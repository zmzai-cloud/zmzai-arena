// 仿真行情：种子化多资产几何布朗运动（GBM）。
// 不含任何真实行情，全部为可复现的随机序列，仅用于产品原型演示。

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
  close: number;
  high: number;
  low: number;
}

export type PriceSeries = Record<string, Bar[]>; // code -> 每日 Bar

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
