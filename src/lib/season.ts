// 赛季联赛：按自然月划分赛季，每月 1 日自动结算上月榜单（夏普 TOP10 归档），
// TOP3 永久获得赛季徽章（冠军 / 亚军 / 季军），在榜单与详情页展示，形成留存钩子。
//
// 数据：赛季快照存 localStorage（zmzai_arena_season_snapshots_v1）。
// 归档为「尽力而为」：跨月后首次访问时，用当时榜单截取上月 TOP10（无历史行情快照，
// 原型阶段近似结算）；换设备后历史徽章会随本地数据重建，后续可升级为服务端快照。

import type { Agent } from "@/data/agents";

export interface SeasonTopEntry {
  id: number;
  name: string;
  emoji: string;
  market: string;
  sharpe: number;
  totalReturn: number;
  rank: number; // 1-based
}

export interface SeasonSnapshots {
  lastArchived: string; // 已结算的最近月份，如 "2026-07"
  months: Record<string, SeasonTopEntry[]>; // "2026-07" -> 当月 TOP10
}

export const SEASON_TOP_N = 10; // 归档条数
const LS_KEY = "zmzai_arena_season_snapshots_v1";

export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 上个月的 key，如 "2026-07" -> "2026-06" */
export function prevMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** 本赛季剩余天数（含今天，至少 1） */
export function seasonDaysLeft(d: Date = new Date()): number {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0); // 本月最后一天
  return Math.max(1, Math.round((last.getTime() - d.getTime()) / 86_400_000) + 1);
}

function loadSnaps(): SeasonSnapshots {
  if (typeof window === "undefined") return { lastArchived: "", months: {} };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { lastArchived: "", months: {} };
    const s = JSON.parse(raw) as SeasonSnapshots;
    return { lastArchived: s.lastArchived ?? "", months: s.months ?? {} };
  } catch {
    return { lastArchived: "", months: {} };
  }
}

function saveSnaps(s: SeasonSnapshots): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    // 存储满 / 隐私模式静默
  }
}

/** 从榜单截取 TOP N（按 Sharpe 降序） */
function topEntries(list: Agent[], n: number): SeasonTopEntry[] {
  return [...list]
    .sort((a, b) => b.sharpe - a.sharpe)
    .slice(0, n)
    .map((a, i) => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji,
      market: a.market,
      sharpe: a.sharpe,
      totalReturn: a.totalReturn,
      rank: i + 1,
    }));
}

/** 跨月归档：上月榜单未结算时自动归档（幂等，只结算最近一个跨月） */
export function ensureSeasonArchive(list: Agent[]): void {
  if (typeof window === "undefined" || list.length === 0) return;
  const target = prevMonthKey(monthKey());
  const s = loadSnaps();
  if (s.lastArchived >= target) return; // 上月已结算（字符串比较同长度 key 可靠）
  s.months[target] = topEntries(list, SEASON_TOP_N);
  s.lastArchived = target;
  saveSnaps(s);
}

export function loadSeasonSnapshots(): SeasonSnapshots {
  return loadSnaps();
}

/** 当前赛季实时 TOP3（榜单前 3 名，含名次） */
export function liveTop3(list: Agent[]): SeasonTopEntry[] {
  return topEntries(list, 3);
}

/** 某 agent 的全部历史赛季徽章（按赛季升序） */
export function medalsOf(id: number, snaps: SeasonSnapshots): { season: string; rank: number }[] {
  const out: { season: string; rank: number }[] = [];
  for (const season of Object.keys(snaps.months).sort()) {
    const hit = snaps.months[season].find((e) => e.id === id && e.rank <= 3);
    if (hit) out.push({ season, rank: hit.rank });
  }
  return out;
}

export const MEDAL_LABEL = ["", "冠军", "亚军", "季军"] as const;

/** 徽章样式：冠军品牌绿、亚军金、季军灰 */
export function medalCls(rank: number): string {
  if (rank === 1) return "bg-accent/12 text-accent";
  if (rank === 2) return "bg-warning/15 text-warning";
  return "bg-surface-2 text-ink-3";
}

/** 当前赛季榜单中某 agent 的实时名次（Sharpe 降序），未上榜返回 null */
export function liveRankOf(list: Agent[], id: number): number | null {
  const sorted = [...list].sort((a, b) => b.sharpe - a.sharpe);
  const idx = sorted.findIndex((a) => a.id === id);
  return idx >= 0 ? idx + 1 : null;
}

/** 赛季显示名，如 "2026-08 赛季" */
export function seasonTitle(key: string): string {
  const [y, m] = key.split("-");
  return `${y}.${m} 赛季`;
}
