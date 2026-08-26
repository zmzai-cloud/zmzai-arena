import { NextRequest, NextResponse } from "next/server";

import { AUTH_ORIGIN, type SessionUser } from "@/lib/auth";
import { MARKET_DAYS, GLOBAL_SEED, type BacktestInput } from "@/lib/backtest-assemble";
import { runBacktest } from "@/lib/sandbox-backtest";
import { accountKey, consumeQuota, peekQuota } from "@/lib/billing-store";
import { PLANS } from "@/lib/billing";
import { INSTRUMENT_MAP } from "@/sim/market";
import { STRATEGIES, type StyleKey, type StrategyConfig } from "@/sim/strategies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// 允许的风格（与 src/sim/strategies 的 StyleKey 一一对应）
const STYLE_KEYS: StyleKey[] = [...new Set(STRATEGIES.map((s) => s.style))];

// ---------- 输入白名单校验：避免恶意参数打爆本地降级引擎（CPU / 内存） ----------

interface SanitizeResult {
  ok: true;
  cfg: StrategyConfig;
  simDays: number;
  seed: number;
}

function sanitize(raw: unknown): SanitizeResult | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "请求体必须是 JSON" };
  const o = raw as Record<string, unknown>;
  const cfg = o.cfg as Record<string, unknown> | undefined;
  if (!cfg || typeof cfg !== "object") return { ok: false, error: "cfg 必须是对象" };

  if (typeof cfg.style !== "string" || !(STYLE_KEYS as string[]).includes(cfg.style)) {
    return { ok: false, error: "cfg.style 不合法" };
  }
  const universe = Array.isArray(cfg.universe)
    ? cfg.universe.filter((c): c is string => typeof c === "string" && Boolean(INSTRUMENT_MAP[c]))
    : [];
  if (universe.length === 0) return { ok: false, error: "cfg.universe 必须包含至少 1 个合法标的" };

  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const maxSingle = num(cfg.maxSingle);
  const minCash = num(cfg.minCash);
  const stopDD = num(cfg.stopDD);
  const rebalance = num(cfg.rebalance);
  const aggr = num(cfg.aggr);
  const id = num(cfg.id);
  if (maxSingle === null || maxSingle <= 0 || maxSingle > 1) return { ok: false, error: "cfg.maxSingle 超出范围 (0,1]" };
  if (minCash === null || minCash < 0 || minCash >= 1) return { ok: false, error: "cfg.minCash 超出范围 [0,1)" };
  if (stopDD === null || stopDD <= 0 || stopDD >= 1) return { ok: false, error: "cfg.stopDD 超出范围 (0,1)" };
  if (rebalance === null || rebalance < 1 || rebalance > 60) return { ok: false, error: "cfg.rebalance 超出范围 [1,60]" };
  if (aggr === null || aggr < 1 || aggr > 80 || !Number.isInteger(aggr)) return { ok: false, error: "cfg.aggr 超出范围 [1,80] 且须为整数" };
  if (id === null || !Number.isInteger(id) || id <= 0) return { ok: false, error: "cfg.id 不合法" };

  const simDays =
    typeof o.simDays === "number" && o.simDays >= 10 && o.simDays <= 500 ? Math.round(o.simDays) : 120;
  const seed = typeof o.seed === "number" && Number.isFinite(o.seed) ? Math.round(o.seed) : Date.now() % 1_000_000;

  return {
    ok: true,
    cfg: {
      id: Math.floor(id),
      style: cfg.style as StyleKey,
      universe,
      maxSingle,
      minCash,
      maxPositions: Math.max(1, Math.min(6, universe.length)),
      stopDD,
      rebalance: Math.round(rebalance),
      aggr: Math.round(aggr),
    },
    simDays,
    seed,
  };
}

// ---------- 简单 per-IP 限流（内存滑动窗口，防刷；单实例部署足够） ----------

const RATE_LIMIT = { windowMs: 60_000, max: 30 };
const hits = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function allowRequest(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return true;
  }
  h.count += 1;
  return h.count <= RATE_LIMIT.max;
}

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

  const s = sanitize(body);
  if (!s.ok) {
    return NextResponse.json({ code: "INVALID_BODY", error: s.error }, { status: 400 });
  }

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
  const plan = PLANS[peekQuota(key).plan];
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
  const quota = consumeQuota(key);
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
