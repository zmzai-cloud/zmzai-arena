// 行情引擎：A 股标的默认接入真实日 K（前复权，见 src/data/market-real.ts，由
// scripts/fetch-market.mjs 拉取生成）；其余市场（美股/加密）保持种子化 GBM 模拟。
// 实盘标的池由拉取脚本按成交额排行榜动态扩展（当前 ~300 只），基础池仅定义
// 美股/加密 + A 股锚点（自定义 drift/vol 优先，未在基础池的实盘标的自动并入）。

import { makeRng, gaussian } from "./rng";
import { REAL_MARKET, REAL_MARKET_NAMES } from "@/data/market-real";

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

// 基础标的池（覆盖 10 个智能体持仓/备选池 + 美股/加密模拟；start 为 GBM 兜底起点，
// 行情拉取成功后被真实数据覆盖）
export const BASE_INSTRUMENTS: Instrument[] = [
  // 白酒/消费
  { code: "600519", name: "贵州茅台", market: "A股", start: 1302.8, drift: 0.12, vol: 0.22 },
  { code: "000858", name: "五粮液", market: "A股", start: 71.9, drift: 0.08, vol: 0.28 },
  { code: "000568", name: "泸州老窖", market: "A股", start: 82.72, drift: 0.1, vol: 0.3 },
  { code: "600809", name: "山西汾酒", market: "A股", start: 117.09, drift: 0.12, vol: 0.32 },
  { code: "002304", name: "洋河股份", market: "A股", start: 39.91, drift: 0.06, vol: 0.28 },
  { code: "600887", name: "伊利股份", market: "A股", start: 26.1, drift: 0.06, vol: 0.24 },
  { code: "603288", name: "海天味业", market: "A股", start: 35.93, drift: 0.05, vol: 0.26 },
  { code: "000651", name: "格力电器", market: "A股", start: 39.58, drift: 0.07, vol: 0.26 },
  { code: "000333", name: "美的集团", market: "A股", start: 86.39, drift: 0.1, vol: 0.26 },
  { code: "600690", name: "海尔智家", market: "A股", start: 21.15, drift: 0.08, vol: 0.25 },
  { code: "002714", name: "牧原股份", market: "A股", start: 39.99, drift: 0.1, vol: 0.38 },
  // 医药
  { code: "600276", name: "恒瑞医药", market: "A股", start: 46.74, drift: 0.12, vol: 0.32 },
  { code: "300760", name: "迈瑞医疗", market: "A股", start: 161.05, drift: 0.1, vol: 0.28 },
  { code: "603259", name: "药明康德", market: "A股", start: 159.25, drift: 0.1, vol: 0.4 },
  { code: "300015", name: "爱尔眼科", market: "A股", start: 8.53, drift: 0.1, vol: 0.4 },
  // 金融
  { code: "600036", name: "招商银行", market: "A股", start: 39.8, drift: 0.06, vol: 0.2 },
  { code: "601318", name: "中国平安", market: "A股", start: 56.13, drift: 0.06, vol: 0.26 },
  { code: "600030", name: "中信证券", market: "A股", start: 27.77, drift: 0.08, vol: 0.3 },
  { code: "601166", name: "兴业银行", market: "A股", start: 18.21, drift: 0.05, vol: 0.2 },
  { code: "601398", name: "工商银行", market: "A股", start: 7.92, drift: 0.04, vol: 0.16 },
  { code: "000001", name: "平安银行", market: "A股", start: 11.73, drift: 0.05, vol: 0.24 },
  { code: "300059", name: "东方财富", market: "A股", start: 19.36, drift: 0.2, vol: 0.5 },
  // 科技
  { code: "002230", name: "科大讯飞", market: "A股", start: 39.66, drift: 0.22, vol: 0.55 },
  { code: "002415", name: "海康威视", market: "A股", start: 34.78, drift: 0.06, vol: 0.28 },
  { code: "000063", name: "中兴通讯", market: "A股", start: 33.54, drift: 0.12, vol: 0.38 },
  { code: "002475", name: "立讯精密", market: "A股", start: 57.11, drift: 0.12, vol: 0.35 },
  { code: "603986", name: "兆易创新", market: "A股", start: 392.5, drift: 0.2, vol: 0.5 },
  { code: "688981", name: "中芯国际", market: "A股", start: 124.15, drift: 0.14, vol: 0.42 },
  { code: "002371", name: "北方华创", market: "A股", start: 700.7, drift: 0.18, vol: 0.45 },
  { code: "300124", name: "汇川技术", market: "A股", start: 61.9, drift: 0.12, vol: 0.32 },
  // 新能源/制造
  { code: "300750", name: "宁德时代", market: "A股", start: 379, drift: 0.18, vol: 0.42 },
  { code: "601012", name: "隆基绿能", market: "A股", start: 12.28, drift: 0.1, vol: 0.45 },
  { code: "600438", name: "通威股份", market: "A股", start: 12.01, drift: 0.1, vol: 0.4 },
  { code: "002460", name: "赣锋锂业", market: "A股", start: 53.5, drift: 0.15, vol: 0.5 },
  { code: "002594", name: "比亚迪", market: "A股", start: 92.09, drift: 0.15, vol: 0.4 },
  { code: "000625", name: "长安汽车", market: "A股", start: 7.14, drift: 0.1, vol: 0.35 },
  { code: "600104", name: "上汽集团", market: "A股", start: 10.39, drift: 0.05, vol: 0.25 },
  { code: "600031", name: "三一重工", market: "A股", start: 18.86, drift: 0.08, vol: 0.3 },
  { code: "000725", name: "京东方A", market: "A股", start: 5.72, drift: 0.05, vol: 0.35 },
  { code: "601766", name: "中国中车", market: "A股", start: 6.18, drift: 0.06, vol: 0.26 },
  // 资源/能源/公用
  { code: "600900", name: "长江电力", market: "A股", start: 28.24, drift: 0.05, vol: 0.15 },
  { code: "601899", name: "紫金矿业", market: "A股", start: 34.47, drift: 0.12, vol: 0.32 },
  { code: "601088", name: "中国神华", market: "A股", start: 47.26, drift: 0.05, vol: 0.2 },
  { code: "601857", name: "中国石油", market: "A股", start: 11.01, drift: 0.05, vol: 0.22 },
  { code: "600019", name: "宝钢股份", market: "A股", start: 5.89, drift: 0.04, vol: 0.24 },
  { code: "600585", name: "海螺水泥", market: "A股", start: 17.88, drift: 0.04, vol: 0.26 },
  { code: "600941", name: "中国移动", market: "A股", start: 98.45, drift: 0.06, vol: 0.2 },
  // ETF
  { code: "510300", name: "沪深300ETF", market: "A股", start: 4.652, drift: 0.07, vol: 0.18 },
  { code: "510500", name: "中证500ETF", market: "A股", start: 7.789, drift: 0.08, vol: 0.22 },
  { code: "515080", name: "中证红利", market: "A股", start: 1.606, drift: 0.06, vol: 0.16 },
  { code: "510050", name: "上证50ETF", market: "A股", start: 3.013, drift: 0.06, vol: 0.17 },
  { code: "159915", name: "创业板ETF", market: "A股", start: 3.432, drift: 0.09, vol: 0.25 },
  { code: "588000", name: "科创50ETF", market: "A股", start: 1.721, drift: 0.1, vol: 0.28 },
  // 美股/加密（模拟行情）
  { code: "AAPL", name: "Apple", market: "美股", start: 228, drift: 0.14, vol: 0.26 },
  { code: "KO", name: "Coca-Cola", market: "美股", start: 62, drift: 0.05, vol: 0.17 },
  { code: "BTC", name: "Bitcoin", market: "加密", start: 62000, drift: 0.5, vol: 0.75 },
  { code: "ETH", name: "Ethereum", market: "加密", start: 3400, drift: 0.45, vol: 0.85 },
];

// 实盘标的自动并入：排行榜动态标的（REAL_MARKET_NAMES 驱动）不在基础池时补入，
// 名称/起始价取自真实行情，默认 drift/vol 作为行情拉取失败时的 GBM 兜底。
function mergeRealInstruments(): Instrument[] {
  const seen = new Set(BASE_INSTRUMENTS.map((i) => i.code));
  const extra: Instrument[] = [];
  for (const [code, name] of Object.entries(REAL_MARKET_NAMES)) {
    if (seen.has(code)) continue;
    const bars = REAL_MARKET[code];
    const lastClose = bars?.[bars.length - 1]?.[2];
    extra.push({
      code,
      name,
      market: "A股",
      start: typeof lastClose === "number" ? lastClose : 10,
      drift: 0.08,
      vol: 0.35,
    });
  }
  return [...BASE_INSTRUMENTS, ...extra];
}

export const INSTRUMENTS: Instrument[] = mergeRealInstruments();

export const INSTRUMENT_MAP: Record<string, Instrument> = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.code, i])
);

// 板块分组（UI 用）：按代码前缀推导，与榜单数据保持一致
const BOARD_RULES: Array<[string, RegExp]> = [
  ["科创板", /^688/],
  ["创业板", /^30/],
  ["沪市主板", /^60/],
  ["深市主板", /^000|^001|^002|^003/],
  ["ETF", /^(51|58|15|16|56|159)/],
];
export function boardOf(code: string): string {
  for (const [board, re] of BOARD_RULES) if (re.test(code)) return board;
  return "其他";
}

export const INSTRUMENT_OPTIONS = INSTRUMENTS.map((i) => ({ ...i, board: boardOf(i.code) }));

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
      const sliced = rows.slice(-days);
      const pad = days - sliced.length; // 次新股上市不足 days 天：前向填充为横盘，避免引擎越界
      const first = sliced[0];
      const bars = sliced.map((r, t) => ({ t: t + pad, date: r[0], open: r[1], close: r[2], high: r[3], low: r[4], volume: r[5] }));
      for (let t = 0; t < pad; t++) {
        bars.unshift({ t, date: first[0], open: first[1], close: first[2], high: first[3], low: first[4], volume: first[5] });
      }
      series[code] = bars;
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
