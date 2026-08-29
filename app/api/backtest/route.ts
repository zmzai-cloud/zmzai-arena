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
  sanitizeDataSource,
  sanitizeSymbols,
  clientIp,
  allowRequest,
} from "@/lib/backtest-shared";
import { loadRealMarket, snapshotRange, type PriceSeries } from "@/sim/market";
import { DataServiceError, fetchBars } from "@/lib/data-client";
import { emitUsage, runWithTrace } from "@/lib/telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// 创建智能体时调用：把策略配置提交到 zmzai-sandbox 隔离沙箱做真实回测（含撮合成本），
// 返回与本地引擎同构的结果契约；沙箱不可达 / 限流 / 失败时服务端自动降级本地引擎。
export async function POST(req: NextRequest) {
  // 入口绑定 trace：arena→zmzai-data 的行情调用透传 x-trace-id（TODO：回测 span 可后置）
  return runWithTrace(req, () => handleBacktest(req));
}

async function handleBacktest(req: NextRequest) {
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
  // 数据源：sim（默认，本地种子化行情）/ real（zmzai-data 真实行情快照）
  const dataSource = sanitizeDataSource(o.dataSource);

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

  // ---- 实盘行情快照（dataSource=real）----
  // 放在配额消费之前：行情取不到就不扣额度，用户不会被无效扣费。
  // v1 只支持官方 Agent 策略（用户 Agent 存在 localStorage，服务端无法还原完整契约）。
  let snapshot: PriceSeries | null = null;
  let symbols: string[] = [];
  let effectiveDays = s.simDays;
  let clampNote: string | null = null;

  if (dataSource === "real") {
    const symRes = sanitizeSymbols(o.symbols);
    if (!symRes.ok) {
      return NextResponse.json({ code: "INVALID_SYMBOLS", error: symRes.error }, { status: 400 });
    }
    symbols = symRes.symbols;
    // 实盘模式的标的池 = 用户选择的真实标的（与行情快照一一对应）
    s.cfg = { ...s.cfg, universe: symbols, maxPositions: Math.min(6, Math.max(1, symbols.length)) };

    try {
      snapshot = await loadRealMarket(fetchBars, symbols, s.simDays);
    } catch (err) {
      if (err instanceof DataServiceError) {
        // 透传 zmzai-data 的状态与提示（如 A股缺 TUSHARE_TOKEN → 503 + 明确文案）
        return NextResponse.json(
          { code: err.code, error: err.message, dataSource: "real", symbols },
          { status: err.status, headers: { "Cache-Control": "no-store" } }
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[arena backtest] 实盘行情快照加载失败：${msg}`);
      return NextResponse.json(
        { code: "REAL_MARKET_FAILED", error: `真实行情加载失败：${msg}`, dataSource: "real", symbols },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 快照根数不足（标的历史短 / 区间覆盖有限）→ 裁剪回测周期，不让引擎越界
    const available = Math.min(...symbols.map((c) => snapshot?.[c]?.length ?? 0));
    if (Number.isFinite(available) && available < s.simDays) {
      effectiveDays = Math.max(2, Math.floor(available));
      clampNote = `真实行情快照只有 ${effectiveDays} 根（区间覆盖有限），回测周期已自动裁剪`;
    }
  }

  // 配额消费：通过校验后扣减（沙箱与本地降级均消耗算力资源；实盘回测计同一份额度）
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
    simDays: effectiveDays,
    seed: s.seed,
    tier: "Paper",
    marketDays: MARKET_DAYS,
    marketSeed: GLOBAL_SEED,
  };

  // 实盘快照只在 arena 服务端可用（沙箱内无网络与 service-key）→ 强制本地引擎
  const outcome = await runBacktest(input, user?.id ?? "anon", { market: snapshot ?? undefined });
  // 用量点：回测完成发 usage.recorded（fire-and-forget，绝不影响响应）
  emitUsage({
    userId: user?.id ?? key,
    product: "arena",
    metric: "backtests",
    amount: 1,
    meta: { dataSource, simDays: effectiveDays, engine: outcome.engine, plan: quota.plan },
  });
  const note = [outcome.note, clampNote].filter(Boolean).join("；") || null;
  return NextResponse.json(
    {
      engine: outcome.engine,
      runId: outcome.runId ?? null,
      note,
      result: outcome.result,
      dataSource,
      simDays: effectiveDays,
      snapshot:
        snapshot && symbols.length > 0
          ? { symbols, days: effectiveDays, ...(snapshotRange(snapshot) ?? { from: null, to: null }) }
          : null,
      quota: { plan: quota.plan, used: quota.used, limit: quota.limit === Infinity ? -1 : quota.limit },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
