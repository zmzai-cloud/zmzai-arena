import { NextRequest, NextResponse } from "next/server";

import { AUTH_ORIGIN, type SessionUser } from "@/lib/auth";
import { MARKET_DAYS, GLOBAL_SEED, type BacktestInput } from "@/lib/backtest-assemble";
import { runBacktest } from "@/lib/sandbox-backtest";
import { accountKey, consumeQuota, peekQuota, BillingStoreError } from "@/lib/billing-store";
import { PLANS } from "@/lib/billing";
import {
  sanitizeCfg,
  sanitizeSimDays,
  sanitizeSeed,
  clientIp,
  allowRequest,
} from "@/lib/backtest-shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// 创建智能体时调用：把策略配置提交到 zmzai-sandbox 隔离沙箱做真实回测（含撮合成本），
// 返回与本地引擎同构的结果契约；沙箱不可达 / 限流 / 失败时服务端自动降级本地引擎。
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!allowRequest(ip)) {
    return NextResponse.json({ code: "RATE_LIMITED", error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY", error: "请求体必须是 JSON" }, { status: 400 });
  }

  const cfgRes = sanitizeCfg(body && typeof body === "object" ? (body as Record<string, unknown>).cfg : undefined);
  if (!cfgRes.ok) {
    return NextResponse.json({ code: "INVALID_BODY", error: cfgRes.error }, { status: 400 });
  }
  const o = (body ?? {}) as Record<string, unknown>;
  const simDays = sanitizeSimDays(o.simDays);
  const seed = sanitizeSeed(o.seed);
  const s = { ok: true as const, cfg: cfgRes.cfg, simDays, seed };

  // 归属账户：复用 SSO 会话（与 /api/me 同逻辑），未登录用「anon:<ip>」独立额度
  let user: SessionUser | null = null;
  const cookie = req.headers.get("cookie") ?? "";
  if (cookie) {
    try {
      const res = await fetch(`${AUTH_ORIGIN}/api/me`, {
        headers: { cookie },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { user: SessionUser | null };
        user = data.user;
      }
    } catch {
      // 会话服务不可达时按匿名额度处理
    }
  }
  const key = accountKey(user, ip);

  // 计划权益校验：回测周期不能超过当前计划上限（Pro 500 交易日 / Free 120）
  let plan;
  try {
    plan = PLANS[peekQuota(key).plan];
  } catch (e) {
    if (e instanceof BillingStoreError) {
      return NextResponse.json({ code: "BILLING_UNAVAILABLE", error: "计费服务暂不可用，请稍后再试" }, { status: 503 });
    }
    throw e;
  }
  if (s.simDays > plan.maxSimDays) {
    return NextResponse.json(
      {
        code: "UPGRADE_REQUIRED",
        error: `当前计划最长回测 ${plan.maxSimDays} 个交易日，${s.simDays} 天需升级 Pro`,
        plan: { id: plan.id, name: plan.name, maxSimDays: plan.maxSimDays },
        upgradeUrl: "/pricing",
      },
      { status: 402 }
    );
  }

  // 配额消费：通过校验后扣减（沙箱与本地降级均消耗算力资源）
  let quota;
  try {
    quota = consumeQuota(key);
  } catch (e) {
    if (e instanceof BillingStoreError) {
      return NextResponse.json({ code: "BILLING_UNAVAILABLE", error: "计费服务暂不可用，请稍后再试" }, { status: 503 });
    }
    throw e;
  }
  if (!quota.ok) {
    return NextResponse.json(
      {
        code: "QUOTA_EXCEEDED",
        error: `本月沙箱回测额度已用完（${quota.used}/${quota.limit}），升级 Pro 解锁无限回测`,
        quota: {
          plan: quota.plan,
          used: quota.used,
          limit: quota.limit === Infinity ? -1 : quota.limit,
        },
        upgradeUrl: "/pricing",
      },
      { status: 402 }
    );
  }

  const input: BacktestInput = {
    cfg: s.cfg,
    simDays: s.simDays,
    seed: s.seed,
    tier: "Paper",
    marketDays: MARKET_DAYS,
    marketSeed: GLOBAL_SEED,
  };

  const outcome = await runBacktest(input, user?.id ?? "anon");
  return NextResponse.json(
    {
      engine: outcome.engine,
      runId: outcome.runId ?? null,
      note: outcome.note ?? null,
      result: outcome.result,
      quota: { plan: quota.plan, used: quota.used, limit: quota.limit === Infinity ? -1 : quota.limit },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
