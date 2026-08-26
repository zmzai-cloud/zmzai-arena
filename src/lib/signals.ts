// 共识信号：聚合全体 AI（官方 + 用户已上云策略）的「当前真实持仓」，
// 按标的统计持有数 → 共识度。给韭菜的「答案」：AI 们集体在买什么。
//
// 数据源为结构化的 positions（零算力、零配额），非真实标的的篮子仓位
// （如对冲风格的「多头/空头」）按 code 不在 INSTRUMENT_MAP 中天然过滤。

import { INSTRUMENT_MAP } from "@/sim/market";
import type { Agent } from "@/data/agents";

// 免费可见条数（引流），Pro 解锁全部
export const FREE_VISIBLE_SIGNALS = 3;

/** /api/signals 响应（供客户端组件与服务端共享） */
export interface SignalsResponse {
  total: number; // 参与共识的 AI 总数
  signals: ConsensusSignal[]; // 信号列表（免费截断 + locked 提示）
  pro: boolean; // 当前账户是否 Pro
  locked: number; // 被锁定的信号数（免费 = 总数 - 可见数）
  fetchedAt: string;
}

/** 共识度档位（用于 UI 分级高亮） */
export type ConsensusTier = "high" | "mid" | "low";

export interface ConsensusSignal {
  code: string;
  name: string;
  market: string;
  holders: number; // 持有该标的的 AI 数
  total: number; // 参与共识的 AI 总数
  ratio: number; // 共识度 0-1（holders / total）
  topHolders: string[]; // 持有者名单（最多 3 个，按持仓市值降序）
}

/** 共识度档位：≥60% 高共识（强信号）/ ≥30% 中 / 其余观察 */
export function tierOf(ratio: number): ConsensusTier {
  if (ratio >= 0.6) return "high";
  if (ratio >= 0.3) return "mid";
  return "low";
}

/**
 * 同名去重（与对决擂台同一口径）：官方优先（staticsKeys 集合判断，不依赖 id 范围），
 * 用户副本间保留 simDays 最大者——「重新验证」产生的同名副本不重复计票。
 */
export function dedupeAgentsByName(agents: Agent[], official: Agent[]): Agent[] {
  const staticsKeys = new Set(official.map((a) => `${a.name}|${a.style}`));
  const best = new Map<string, Agent>();
  for (const a of official) best.set(`${a.name}|${a.style}`, a);
  for (const a of agents) {
    const k = `${a.name}|${a.style}`;
    const cur = best.get(k);
    if (!cur) best.set(k, a);
    else if (!staticsKeys.has(k) && (a.simDays ?? 0) > (cur.simDays ?? 0)) best.set(k, a);
  }
  return [...best.values()];
}

/**
 * 从全体 Agent 聚合共识信号，按持有数降序。
 * 只统计「至少有一个真实持仓」的 Agent（排除空仓与纯篮子仓位）。
 */
export function computeSignals(agents: Agent[]): ConsensusSignal[] {
  const withPos = agents.filter((a) => a.positions?.some((p) => INSTRUMENT_MAP[p.code]));
  const total = withPos.length;
  if (total === 0) return [];

  // code → { 标的, 持有者计数, 持有者名单（前 3，按持仓市值降序） }
  const byCode = new Map<string, { inst: (typeof INSTRUMENT_MAP)[string]; count: number; top: string[] }>();
  for (const a of withPos) {
    const sorted = [...a.positions].sort(
      (x, y) => mvNum(y.mv) - mvNum(x.mv),
    );
    for (const p of sorted) {
      const inst = INSTRUMENT_MAP[p.code];
      if (!inst) continue; // 跳过「多头/空头」等非真实标的
      const cur = byCode.get(p.code);
      if (cur) {
        cur.count += 1;
        if (cur.top.length < 3) cur.top.push(a.name);
      } else {
        byCode.set(p.code, { inst, count: 1, top: [a.name] });
      }
      break; // 每 Agent 只计入其第一大持仓（贡献给该标的的共识）
    }
  }

  return [...byCode.values()]
    .map(({ inst, count, top }) => ({
      code: inst.code,
      name: inst.name,
      market: inst.market,
      holders: count,
      total,
      ratio: count / total,
      topHolders: top,
    }))
    .sort((a, b) => b.holders - a.holders || b.ratio - a.ratio);
}

/** 从 "¥12.3万" / "-¥3,456" 等展示串解析数值（纯数字部分），失败返回 0 */
function mvNum(s: string): number {
  const n = Number(String(s ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 按市场分组统计：市场名 → { aiCount, signalCount } */
export function signalsByMarket(signals: ConsensusSignal[]): Record<string, { aiCount: number; signalCount: number }> {
  const out: Record<string, { aiCount: number; signalCount: number }> = {};
  for (const s of signals) {
    const cur = (out[s.market] ??= { aiCount: 0, signalCount: 0 });
    cur.signalCount += 1;
    cur.aiCount = Math.max(cur.aiCount, s.total);
  }
  return out;
}
