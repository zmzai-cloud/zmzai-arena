// 大盘指数工具：基准指数（沪深300）的趋势状态、窗口收益、超额收益。
// 指数行情来自 src/data/market-real.ts 的 REAL_INDEXES（新浪日K，不复权点位），
// 与个股行情同交易日历；引擎/UI 共用本模块，保证口径一致。

import type { RealRow } from "./market";

// 全站统一基准指数：沪深300（竞技场/详情页/熔断护栏共用）
export const BENCH_INDEX = "sh000300";
export const BENCH_INDEX_NAME = "沪深300";

export interface IndexTrend {
  phase: "牛" | "熊" | "震荡";
  close: number;
  ma20: number;
  ma60: number;
  ddFrom20: number; // 收盘相对 20 日线偏离（close/ma20 - 1）
  ddFrom60: number; // 收盘相对 60 日线偏离（close/ma60 - 1）
}

/** 尾部对齐到行情窗口（与 buildMarket 的最近 windowLen 根一致），返回 day 索引可用的数组 */
export function alignIndexBars(rows: RealRow[], windowLen: number): RealRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.slice(-windowLen);
}

/** 大盘趋势：牛 = 收盘站上 20 日线且 20 日线在 60 日线上方；熊 = 相反；其余震荡 */
export function indexTrend(bars: RealRow[], day: number): IndexTrend | null {
  if (!bars || bars.length < 60 || day < 1) return null;
  const i = Math.min(day, bars.length - 1);
  const close = bars[i][2];
  const ma20 = ma(bars, i, 20);
  const ma60 = ma(bars, i, 60);
  if (!ma20 || !ma60) return null;
  const phase = close > ma20 && ma20 > ma60 ? "牛" : close < ma20 && ma20 < ma60 ? "熊" : "震荡";
  return { phase, close, ma20, ma60, ddFrom20: close / ma20 - 1, ddFrom60: close / ma60 - 1 };
}

/** 窗口收益：取对齐窗口前 n 根的首末收盘涨跌（与引擎 simDays 窗口对齐） */
export function indexReturn(bars: RealRow[], n: number): number | null {
  if (!bars || bars.length < 2 || n < 2) return null;
  const first = bars[Math.max(0, bars.length - n)][2];
  const last = bars[bars.length - 1][2];
  return last / first - 1;
}

/** 引擎窗口收益：与 buildMarket 同窗口对齐（最近 windowLen 根中取前 n 根首末涨跌） */
export function windowReturn(bars: RealRow[], windowLen: number, n: number): number | null {
  if (!bars || bars.length < 2 || n < 2) return null;
  const aligned = bars.slice(-windowLen);
  if (aligned.length < 2) return null;
  const first = aligned[0][2];
  const last = aligned[Math.min(n - 1, aligned.length - 1)][2];
  return last / first - 1;
}

export interface Excess {
  indexReturn: number; // 基准指数同窗口涨跌（小数）
  excess: number; // 超额收益 = 策略总收益 − 基准收益
  beat: boolean; // 是否跑赢基准
}

/** 超额收益（策略总收益 vs 基准指数同窗口收益）；基准缺失时返回 null（UI 不展示） */
export function excessOf(totalReturn: number, indexReturnValue: number | null): Excess | null {
  if (indexReturnValue == null || !Number.isFinite(indexReturnValue)) return null;
  return { indexReturn: indexReturnValue, excess: totalReturn - indexReturnValue, beat: totalReturn >= indexReturnValue };
}

function ma(bars: RealRow[], day: number, n: number): number {
  const start = Math.max(0, day - n + 1);
  let s = 0;
  let c = 0;
  for (let i = start; i <= day; i++) {
    s += bars[i][2];
    c++;
  }
  return c ? s / c : 0;
}
