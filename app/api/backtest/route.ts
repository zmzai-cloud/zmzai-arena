import { NextRequest, NextResponse } from "next/server";

import { AUTH_ORIGIN, type SessionUser } from "@/lib/auth";
import { MARKET_DAYS, GLOBAL_SEED, type BacktestInput } from "@/lib/backtest-assemble";
import { runBacktest } from "@/lib/sandbox-backtest";
import type { StrategyConfig } from "@/sim/strategies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// 创建智能体时调用：把策略配置提交到 zmzai-sandbox 隔离沙箱做真实回测（含撮合成本），
// 返回与本地引擎同构的结果契约；沙箱不可达 / 限流 / 失败时服务端自动降级本地引擎。
export async function POST(req: NextRequest) {
  let body: { cfg?: unknown; simDays?: unknown; seed?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ code: "INVALID_BODY", error: "请求体必须是 JSON" }, { status: 400 });
  }

  const cfg = body.cfg as StrategyConfig | undefined;
  if (!cfg || typeof cfg !== "object" || typeof cfg.style !== "string" || !Array.isArray(cfg.universe)) {
    return NextResponse.json({ code: "INVALID_BODY", error: "cfg 缺少 style / universe" }, { status: 400 });
  }
  const simDays = typeof body.simDays === "number" && body.simDays >= 10 && body.simDays <= 500 ? Math.round(body.simDays) : 120;
  const seed = typeof body.seed === "number" && Number.isFinite(body.seed) ? Math.round(body.seed) : Date.now() % 1_000_000;

  const input: BacktestInput = {
    cfg,
    simDays,
    seed,
    tier: "Paper",
    marketDays: MARKET_DAYS,
    marketSeed: GLOBAL_SEED,
  };

  // 归属 userId：复用 SSO 会话（与 /api/me 同逻辑），未登录用公共配额
  let userId = "arena-public";
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
        if (data.user?.id) userId = data.user.id;
      }
    } catch {
      // 会话服务不可达时按公共配额处理
    }
  }

  const outcome = await runBacktest(input, userId);
  return NextResponse.json(
    {
      engine: outcome.engine,
      runId: outcome.runId ?? null,
      note: outcome.note ?? null,
      result: outcome.result,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
