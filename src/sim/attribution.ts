// 收益归因：把每个智能体的总收益拆成可解释的来源。
//
// 4 维分解（精确加总到总收益）：
//   基准 β     = 全市场被动持有的收益（行情β，非技能）
//   行业配置   = 押注了哪些板块/市场（相对全市场基准的偏离）
//   选股能力   = 在押注的板块内，挑的具体标的相对板块均值的超额
//   择时能力   = 相对「从一开始就一直持有你最终选中的标的」，主动买卖带来的增减
// 运气占比     = 同策略在多种子（不同随机行情）下总收益的离散度：
//               收益对随机行情越敏感 → 运气成分越高（用 std / |mean| 估计）
//
// 方法：解析决策日志的逐笔买卖（FIFO 配对，未平仓用期末价配对），对每笔用
// 全市场/分板块均值序列把窗口收益拆成 基准+行业+选股，择时由残差补足，
// 因此 4 项之和 ≡ 总收益。运气项正交，靠对照种子重跑估计。

import { INSTRUMENT_MAP, generateMarket, type MarketKind, type PriceSeries } from "./market";
import { runSimulation, type SimResult, type Tier } from "./engine";
import type { StrategyConfig } from "./strategies";

export interface AttributionBucket {
  key: string;
  label: string;
  value: number; // % 贡献（可正可负）
}

export interface Attribution {
  total: number; // % 总收益
  benchmark: number; // % 基准 β
  sector: number; // % 行业/市场配置
  selection: number; // % 选股能力
  timing: number; // % 择时能力
  luckShare: number; // 0-1，运气占比
  byBucket: AttributionBucket[]; // [基准, 行业, 选股, 择时]
  altReturns: number[]; // 对照种子总收益（%），用于解读
  note: string;
}

const LUCK_SEEDS = [101, 307, 613, 919, 1237]; // 对照行情种子偏移（5 条替代随机行情）

export function attributeReturn(
  res: SimResult,
  market: PriceSeries,
  cfg: StrategyConfig,
  simDays: number,
  tier: Tier,
  seed: number
): Attribution {
  const codes = Object.keys(market);
  if (codes.length === 0) return emptyAttr(res.metrics.totalReturn);

  const days = market[codes[0]].length;
  const last = days - 1;

  // 预计算每日：全市场均值 + 分板块均值
  const broad: number[] = new Array(days);
  const byKind: Record<string, number[]> = {};
  for (const k of Object.keys(INSTRUMENT_MAP)) byKind[INSTRUMENT_MAP[k].market] ??= new Array(days);
  for (let d = 0; d < days; d++) {
    let s = 0,
      n = 0;
    const ksum: Record<string, { s: number; n: number }> = {};
    for (const c of codes) {
      const p = market[c][d].close;
      s += p;
      n++;
      const mk = INSTRUMENT_MAP[c].market;
      (ksum[mk] ??= { s: 0, n: 0 }).s += p;
      ksum[mk].n += 1;
    }
    broad[d] = s / n;
    for (const mk of Object.keys(ksum)) byKind[mk][d] = ksum[mk].s / ksum[mk].n;
  }
  // 全周期参考（与总收益同量级）
  const B = broad[last] / broad[0] - 1; // 全市场基准（兜底用）
  const Mfull: Record<string, number> = {};
  for (const mk of Object.keys(byKind)) Mfull[mk] = byKind[mk][last] / byKind[mk][0] - 1;
  const Rfull = (c: string) => market[c][last].close / market[c][0].close - 1;
  // 以「智能体自身标的池」等权持有为基准，量级正常、跨风格公平
  const Ru =
    cfg.universe.length > 0
      ? cfg.universe.reduce((s, c) => s + Rfull(c), 0) / cfg.universe.length
      : B;
  // 单市场池（如加密 BTC+ETH）无跨资产类配置可言，行业置 0，选股直接对标自身池
  const universeMarkets = new Set(cfg.universe.map((c) => INSTRUMENT_MAP[c]?.market).filter(Boolean));
  const singleMarket = universeMarkets.size <= 1;

  // 解析逐笔买卖（FIFO 配对）
  interface Trip {
    code: string;
    buyDay: number;
    buyPrice: number;
    sellDay: number;
    sellPrice: number;
    qty: number;
  }
  const opens: Record<string, { day: number; price: number; qty: number }[]> = {};
  const trips: Trip[] = [];
  for (const dec of res.decisions) {
    if (!dec.code || dec.price == null) continue;
    if (dec.action === "BUY") {
      (opens[dec.code] ??= []).push({ day: dec.day, price: dec.price, qty: dec.qty ?? 0 });
    } else if (dec.action === "SELL") {
      const stk = opens[dec.code];
      const buy = stk && stk.length ? stk.shift()! : null;
      if (!buy) continue;
      trips.push({
        code: dec.code,
        buyDay: buy.day,
        buyPrice: buy.price,
        sellDay: dec.day,
        sellPrice: dec.price,
        qty: buy.qty,
      });
    }
  }
  // 未平仓：用期末价配对
  for (const code of Object.keys(opens)) {
    for (const buy of opens[code]) {
      trips.push({
        code,
        buyDay: buy.day,
        buyPrice: buy.price,
        sellDay: last,
        sellPrice: market[code][last].close,
        qty: buy.qty,
      });
    }
  }

  let wsum = 0,
    sectorC = 0,
    selC = 0;
  for (const t of trips) {
    const mk: MarketKind | undefined = INSTRUMENT_MAP[t.code]?.market;
    const mFull = Mfull[mk ?? ""] ?? Ru;
    const rFull = Rfull(t.code);
    const w = t.buyPrice * t.qty;
    if (singleMarket) {
      selC += w * (rFull - Ru); // 单市场：选股 = 标的 − 自身池基准
    } else {
      sectorC += w * (mFull - Ru); // 跨市场：行业 = 板块 − 自身池基准
      selC += w * (rFull - mFull); // 选股 = 标的 − 板块
    }
    wsum += w;
  }

  const Tfrac = res.metrics.totalReturn / 100;
  let benchmark = 0,
    sector = 0,
    selection = 0,
    timing = 0;
  if (wsum > 0) {
    const bF = Ru;
    const sF = sectorC / wsum;
    const seF = selC / wsum;
    benchmark = bF * 100;
    sector = sF * 100;
    selection = seF * 100;
    timing = (Tfrac - (bF + sF + seF)) * 100; // 残差补足，保证 4 项≡总收益
  } else {
    // 无逐笔交易（如中性策略）：整体收益归入基准，其余为 0
    benchmark = res.metrics.totalReturn;
  }

  // 运气占比：策略逻辑固定、仅替换随机行情路径，看收益波动多大。
  // 本引擎策略决策完全由行情决定（seed 不参与策略），故用多种子重新生成行情来度量。
  // 运气占比 = 1 − 跨随机行情胜率：在多条替代随机行情下仍盈利的比例越高，
  // 说明收益越可复现（技能驱动）；越低，说明越依赖"恰好撞上的那一段行情"（运气）。
  const altReturns: number[] = [res.metrics.totalReturn];
  for (const off of LUCK_SEEDS) {
    const altMarket = generateMarket(days, seed + off * 1000 + 7);
    const r = runSimulation(cfg, altMarket, simDays, seed, tier);
    altReturns.push(r.metrics.totalReturn);
  }
  const alts = altReturns.slice(1); // 仅对照行情（不含主路径）
  const wins = alts.filter((x) => x > 0).length;
  const winRate = wins / alts.length;
  const luckShare = clamp(1 - winRate, 0, 1);

  const byBucket: AttributionBucket[] = [
    { key: "bench", label: "基准 β", value: round1(benchmark) },
    { key: "sector", label: "行业配置", value: round1(sector) },
    { key: "selection", label: "选股能力", value: round1(selection) },
    { key: "timing", label: "择时能力", value: round1(timing) },
  ];

  return {
    total: round1(res.metrics.totalReturn),
    benchmark: round1(benchmark),
    sector: round1(sector),
    selection: round1(selection),
    timing: round1(timing),
    luckShare: round2(luckShare),
    byBucket,
    altReturns: altReturns.map((x) => round1(x)),
    note: buildNote(res.metrics.totalReturn, sector, selection, timing, luckShare, winRate),
  };
}

function buildNote(
  total: number,
  sector: number,
  selection: number,
  timing: number,
  luck: number,
  winRate: number
): string {
  if (total <= 0) return "本期未实现正收益，归因仅供结构参考。";
  const parts: string[] = [];
  const skills = [
    { name: "行业配置", v: sector },
    { name: "选股能力", v: selection },
    { name: "择时能力", v: timing },
  ].sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const top = skills[0];
  if (top.v > 1.5) parts.push(`主要收益来自${top.name}（${top.v >= 0 ? "+" : ""}${top.v.toFixed(1)}%）`);
  else parts.push("收益较均衡，主动管理贡献不突出");
  if (luck > 0.5) parts.push(`收益对随机行情敏感（跨行情胜率仅 ${(winRate * 100).toFixed(0)}%），运气成分偏高`);
  else if (luck < 0.2) parts.push(`收益在多种子行情下稳定（跨行情胜率 ${(winRate * 100).toFixed(0)}%），技能成分偏高`);
  return parts.join("；") + "。";
}

function emptyAttr(total: number): Attribution {
  return {
    total: round1(total),
    benchmark: round1(total),
    sector: 0,
    selection: 0,
    timing: 0,
    luckShare: 0,
    byBucket: [
      { key: "bench", label: "基准 β", value: round1(total) },
      { key: "sector", label: "行业配置", value: 0 },
      { key: "selection", label: "选股能力", value: 0 },
      { key: "timing", label: "择时能力", value: 0 },
    ],
    altReturns: [round1(total)],
    note: "无逐笔交易记录，归因不可用。",
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
