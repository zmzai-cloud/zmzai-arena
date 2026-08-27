// 行情引擎：A 股标的默认接入真实日 K（前复权，见 src/data/market-real.ts，由
// scripts/fetch-market.mjs 拉取生成）；其余市场（美股/加密）保持种子化 GBM 模拟。

import { makeRng, gaussian } from "./rng";

export type MarketKind = "A股" | "港股" | "美股" | "加密";

export interface Instrument {
  code: string;
  name: string;
  market: MarketKind;
  start: number; // 起始价
  drift: number; // 年化漂移（小数）
  vol: number; // 年化波动率（小数）
}

export interface Bar {
  t: number; // 第几天（0 起）
  date?: string; // 真实交易日（仅实盘数据源）
  open?: number;
  close: number;
  high: number;
  low: number;
  volume?: number;
}

export type PriceSeries = Record<string, Bar[]>; // code -> 每日 Bar

// 实盘数据行：[date, open, close, high, low, volume]
export type RealRow = [string, number, number, number, number, number];

// 竞技场标的池（覆盖现有 10 个智能体的持仓与备选池）
export const INSTRUMENTS: Instrument[] = [
  { code: "600519", name: "贵州茅台", market: "A股", start: 1482, drift: 0.12, vol: 0.22 },
  { code: "300750", name: "宁德时代", market: "A股", start: 236, drift: 0.18, vol: 0.42 },
  { code: "000858", name: "五粮液", market: "A股", start: 138, drift: 0.08, vol: 0.28 },
  { code: "600036", name: "招商银行", market: "A股", start: 38, drift: 0.06, vol: 0.2 },
  { code: "000333", name: "美的集团", market: "A股", start: 72, drift: 0.1, vol: 0.26 },
  { code: "002230", name: "科大讯飞", market: "A股", start: 52, drift: 0.22, vol: 0.55 },
  { code: "300059", name: "东方财富", market: "A股", start: 16, drift: 0.2, vol: 0.5 },
  { code: "002594", name: "比亚迪", market: "A股", start: 250, drift: 0.15, vol: 0.4 },
  { code: "000725", name: "京东方A", market: "A股", start: 4.2, drift: 0.05, vol: 0.35 },
  { code: "601012", name: "隆基绿能", market: "A股", start: 18, drift: 0.1, vol: 0.45 },
  { code: "600900", name: "长江电力", market: "A股", start: 28, drift: 0.05, vol: 0.15 },
  { code: "510300", name: "沪深300ETF", market: "A股", start: 3.9, drift: 0.07, vol: 0.18 },
  { code: "510500", name: "中证500ETF", market: "A股", start: 5.8, drift: 0.08, vol: 0.22 },
  { code: "515080", name: "中证红利", market: "A股", start: 1.4, drift: 0.06, vol: 0.16 },
  { code: "AAPL", name: "Apple", market: "美股", start: 228, drift: 0.14, vol: 0.26 },
  { code: "KO", name: "Coca-Cola", market: "美股", start: 62, drift: 0.05, vol: 0.17 },
  { code: "BTC", name: "Bitcoin", market: "加密", start: 62000, drift: 0.5, vol: 0.75 },
  { code: "ETH", name: "Ethereum", market: "加密", start: 3400, drift: 0.45, vol: 0.85 },
];

export const INSTRUMENT_MAP: Record<string, Instrument> = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.code, i])
);

// 生成 days 天的行情。seed 决定整段序列形态。
export function generateMarket(days: number, seed: number): PriceSeries {
  const rng = makeRng(seed);
  const series: PriceSeries = {};
  for (const inst of INSTRUMENTS) {
    const bars: Bar[] = [];
    let prev = inst.start;
    for (let t = 0; t < days; t++) {
      const z = gaussian(rng);
      const dt = 1 / 252;
      const ret = (inst.drift - 0.5 * inst.vol * inst.vol) * dt + inst.vol * Math.sqrt(dt) * z;
      const close = Math.max(0.01, prev * Math.exp(ret));
      const spread = inst.vol * Math.sqrt(dt) * (0.4 + rng() * 0.8);
      const high = close * (1 + spread);
      const low = close * (1 - spread);
      bars.push({ t, close: r2(close), high: r2(high), low: r2(low) });
      prev = close;
    }
    series[inst.code] = bars;
  }
  return series;
}

// 混合行情：先用 GBM 生成全量序列，再把实盘标段替换为真实日 K（取最近 days 根，
// 保证行情尾部对齐当前交易日；不足 days 天则保留拉到的全部根数）。
// 非实盘标的保持确定性 GBM，全站可复现。
export function buildMarket(
  days: number,
  seed: number,
  real?: Record<string, RealRow[]>
): PriceSeries {
  const series = generateMarket(days, seed);
  if (real) {
    for (const [code, rows] of Object.entries(real)) {
      if (!INSTRUMENT_MAP[code]) continue; // 只接受标的池内的 code
      series[code] = rows
        .slice(-days)
        .map((r, t) => ({ t, date: r[0], open: r[1], close: r[2], high: r[3], low: r[4], volume: r[5] }));
    }
  }
  return series;
}

// 从行情序列聚合全局交易日历（所有实盘 bar 的日期并集，升序）；无实盘数据时返回空数组
// 供决策日志/图表把「第 N 天」映射为真实交易日。
export function tradeCalendar(series: PriceSeries): string[] {
  const set = new Set<string>();
  for (const bars of Object.values(series)) {
    for (const b of bars) if (b.date) set.add(b.date);
  }
  return [...set].sort();
}

// 取某标的截至 day（含）的收盘价序列——反前瞻：永远拿不到未来价格
export function closesUntil(series: PriceSeries, code: string, day: number): number[] {
  const bars = series[code] ?? [];
  return bars.slice(0, day + 1).map((b) => b.close);
}

function r2(n: number): number {
  if (n >= 1000) return Math.round(n * 10) / 10;
  if (n >= 100) return Math.round(n * 100) / 100;
  return Math.round(n * 1000) / 1000;
}
