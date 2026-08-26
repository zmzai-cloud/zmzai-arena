import { NextRequest, NextResponse } from "next/server";

import { AUTH_ORIGIN, type SessionUser } from "@/lib/auth";
import { MARKET_DAYS, GLOBAL_SEED, type BacktestInput } from "@/lib/backtest-assemble";
import type { StrategyConfig } from "@/sim/strategies";
import { runBacktest } from "@/lib/sandbox-backtest";
import { accountKey, consumeQuota, peekQuota, BillingStoreError } from "@/lib/billing-store";
import { PLANS } from "@/lib/billing";
import {
  sanitizeCfg,
  sanitizeSeed,
  clientIp,
  allowRequest,
  downsampleNav,
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
} from "@/lib/backtest-shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120; // 多人回测可能较慢

// 多人同场对决：所有参赛者在「同一段新行情（同 seed + 同周期）」上重跑，
// 输出逐日净值曲线对比与排名——公平竞技，而不是拿各自历史档案硬比。
// 一场对决消耗 1 次回测配额（算力成本由平台承担，鼓励拉人对战）。

interface ParticipantIn {
  id: number;
  name: string;
  emoji: string;
  style: string;
  cfg: StrategyConfig;
  simDays: number;
}

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
  const o = (body ?? {}) as Record<string, unknown>;
  const rawList = Array.isArray(o.participants) ? o.participants : null;
  if (!rawList || rawList.length < MIN_PARTICIPANTS || rawList.length > MAX_PARTICIPANTS) {
    return NextResponse.json(
      { code: "INVALID_BODY", error: `参赛者须为 ${MIN_PARTICIPANTS}~${MAX_PARTICIPANTS} 人` },
      { status: 400 }
    );
  }

  // 逐个白名单校验（与创建/重新验证同口径），并统一回测周期
  const participants: ParticipantIn[] = [];
  const seenIds = new Set<number>();
  let simDays = 0;
  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ code: "INVALID_BODY", error: "参赛者数据不合法" }, { status: 400 });
    }
    const p = raw as Record<string, unknown>;
    const id = typeof p.id === "number" && Number.isInteger(p.id) && p.id > 0 ? p.id : null;
    if (!id || seenIds.has(id)) {
      return NextResponse.json({ code: "INVALID_BODY", error: "参赛者 id 缺失或重复" }, { status: 400 });
    }
    const name = typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 40) : `参赛者 #${id}`;
    const emoji = typeof p.emoji === "string" && p.emoji.trim() ? p.emoji.trim().slice(0, 8) : "🤖";
    const style = typeof p.style === "string" && p.style.trim() ? p.style.trim().slice(0, 12) : "策略";
    const cfgRes = sanitizeCfg(p.cfg);
    if (!cfgRes.ok) {
      return NextResponse.json({ code: "INVALID_BODY", error: `「${name}」${cfgRes.error}` }, { status: 400 });
    }
    // 同场同周期：取全体参赛者配置的最大回测天数（公平对决的前提）
    const pDays = typeof p.simDays === "number" && p.simDays >= 10 && p.simDays <= 500 ? Math.round(p.simDays) : 120;
    simDays = Math.max(simDays, pDays);
    seenIds.add(id);
    participants.push({ id, name, emoji, style, cfg: cfgRes.cfg, simDays: pDays });
  }

  // 归属账户：复用 SSO 会话（与 /api/backtest 同逻辑），未登录用「anon:<ip>」独立额度
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

  // 计划权益校验：统一周期不能超过当前计划上限
  let plan;
  try {
    plan = PLANS[peekQuota(key).plan];
  } catch (e) {
    if (e instanceof BillingStoreError) {
      return NextResponse.json({ code: "BILLING_UNAVAILABLE", error: "计费服务暂不可用，请稍后再试" }, { status: 503 });
    }
    throw e;
  }
  if (simDays > plan.maxSimDays) {
    return NextResponse.json(
      {
        code: "UPGRADE_REQUIRED",
        error: `当前计划最长回测 ${plan.maxSimDays} 个交易日，本场对决需要 ${simDays} 天，升级 Pro 解锁`,
        plan: { id: plan.id, name: plan.name, maxSimDays: plan.maxSimDays },
        upgradeUrl: "/pricing",
      },
      { status: 402 }
    );
  }

  // 配额消费：一场对决 = 1 次回测配额（多人在同一段行情上跑，算力成本平台承担）
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

  // 同场对决：同一随机种子（未指定时按时间生成），全体共享
  const seed = sanitizeSeed(o.seed);
  const userId = user?.id ?? "anon";

  const results = await Promise.all(
    participants.map(async (p) => {
      const input: BacktestInput = {
        cfg: p.cfg,
        simDays,
        seed,
        tier: "Paper",
        marketDays: MARKET_DAYS,
        marketSeed: GLOBAL_SEED,
      };
      const outcome = await runBacktest(input, userId);
      return {
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        style: p.style,
        engine: outcome.engine,
        runId: outcome.runId ?? null,
        note: outcome.note ?? null,
        nav: downsampleNav(outcome.result.nav),
        metrics: outcome.result.metrics,
      };
    })
  );

  // 排名：按总收益降序（同场同行情，直接可比）
  const ranking = [...results]
    .sort((a, b) => b.metrics.totalReturn - a.metrics.totalReturn)
    .map((r, i) => ({ id: r.id, rank: i + 1 }));

  return NextResponse.json(
    {
      battle: {
        seed,
        simDays,
        participants: results,
        ranking,
      },
      quota: { plan: quota.plan, used: quota.used, limit: quota.limit === Infinity ? -1 : quota.limit },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
