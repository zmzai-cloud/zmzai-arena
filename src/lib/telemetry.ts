import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import {
  UsageRecordedEventSchema,
  generateTraceId,
  resolveIncomingTraceId,
  type UsageRecordedEvent,
  type UsageRecordedPayload,
} from "@zmzai/contracts";

/**
 * arena 侧埋点 helper：回测成功后发 usage.recorded（product=arena, metric=backtests）。
 * span 可后置（TODO：回测 HTTP 边界 span）。
 * 硬约束：绝不阻塞主流程 —— 150ms 超时、失败静默丢弃仅计数、不重试（v1 无持久化队列）。
 */

const EMIT_TIMEOUT_MS = 150;

const storage = new AsyncLocalStorage<{ traceId: string }>();

export function runWithTrace<T>(request: Request, fn: () => Promise<T>): Promise<T> {
  const traceId = resolveIncomingTraceId(request.headers?.get("x-trace-id"));
  return storage.run({ traceId }, fn);
}

/** 当前 trace；不在请求上下文时生成新的（arena→zmzai-data 透传链用）。 */
export function currentTraceId(): string {
  return storage.getStore()?.traceId ?? generateTraceId();
}

export function traceHeaders(): Record<string, string> {
  return { "x-trace-id": currentTraceId() };
}

const stats = { sent: 0, failed: 0 };
export function telemetryStats() {
  return { ...stats };
}

function countFailure(reason: string): void {
  stats.failed += 1;
  if (process.env.NODE_ENV !== "production") console.debug(`[telemetry] emit failed: ${reason}`);
}

export function emitUsage(payload: UsageRecordedPayload & { traceId?: string; actorId?: string | null }): void {
  const url = process.env.BILLING_INGEST_URL?.trim();
  const key = process.env.BILLING_INGEST_KEY?.trim();
  if (!url || !key) return; // 未配置 → 静默跳过

  const event = {
    id: randomUUID(),
    ...(payload.traceId ? { traceId: payload.traceId } : {}),
    service: "arena" as const,
    type: "usage.recorded" as const,
    actorId: payload.actorId ?? null,
    payload: {
      userId: payload.userId,
      product: payload.product,
      metric: payload.metric,
      amount: payload.amount,
      ...(payload.costMicros !== undefined ? { costMicros: payload.costMicros } : {}),
      ...(payload.meta ? { meta: payload.meta } : {}),
    },
    at: new Date().toISOString(),
  } satisfies UsageRecordedEvent;
  const parsed = UsageRecordedEventSchema.safeParse(event);
  if (!parsed.success) {
    countFailure("schema:usage");
    return;
  }
  void fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ events: [parsed.data as UsageRecordedEvent] }),
    signal: AbortSignal.timeout(EMIT_TIMEOUT_MS),
    cache: "no-store",
  })
    .then((res) => {
      if (!res.ok) countFailure(`http_${res.status}`);
      else stats.sent += 1;
    })
    .catch(() => countFailure("network_or_timeout"));
}
