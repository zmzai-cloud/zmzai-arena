// 回测类 API 共享工具：输入白名单校验 + per-IP 限流。
// /api/backtest（单 Agent）与 /api/arena/battle（多 Agent 同场对决）共用，
// 避免恶意参数打爆本地降级引擎（CPU / 内存），也保证两套 API 校验口径一致。

import type { NextRequest } from "next/server";
import { INSTRUMENT_MAP } from "@/sim/market";
import { STRATEGIES, type StyleKey, type StrategyConfig } from "@/sim/strategies";

export const MAX_PARTICIPANTS = 6; // 一场对决最多参赛者
export const MIN_PARTICIPANTS = 2;

// 允许的风格（与 src/sim/strategies 的 StyleKey 一一对应）
const STYLE_KEYS: StyleKey[] = [...new Set(STRATEGIES.map((s) => s.style))];

export interface SanitizedCfg {
  ok: true;
  cfg: StrategyConfig;
}
export type SanitizeCfgResult = SanitizedCfg | { ok: false; error: string };

/** 校验单个策略配置（与创建/重新验证同口径白名单） */
export function sanitizeCfg(raw: unknown): SanitizeCfgResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "cfg 必须是对象" };
  const cfg = raw as Record<string, unknown>;

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
  };
}

/** 回测周期范围（与 backtest 一致） */
export function sanitizeSimDays(v: unknown): number {
  return typeof v === "number" && v >= 10 && v <= 500 ? Math.round(v) : 120;
}

/** 随机种子：默认按当前时间生成（同场参赛者共享同一种子，保证公平对决） */
export function sanitizeSeed(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : Date.now() % 1_000_000;
}

// ---------- 简单 per-IP 限流（内存滑动窗口，防刷；单实例部署足够） ----------

const RATE_LIMIT = { windowMs: 60_000, max: 30 };
const hits = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

export function allowRequest(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return true;
  }
  h.count += 1;
  return h.count <= RATE_LIMIT.max;
}

/** 逐日净值降采样到 ≤60 点（对比图渲染用，减载荷） */
export function downsampleNav(nav: number[], maxPoints = 60): number[] {
  if (nav.length <= maxPoints) return nav;
  const step = nav.length / maxPoints;
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(nav[Math.floor(i * step)]);
  out.push(nav[nav.length - 1]);
  return out;
}
