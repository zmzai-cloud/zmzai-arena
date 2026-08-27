// 仿真引擎：逐日运行策略 → 产出成交 / 持仓 / 净值曲线 / 决策日志。
// 风控护栏在引擎内强制执行，超限订单转为 REJECT 决策（而非成交）。
// 反前瞻：策略只能看到 ≤ 当前 day 的行情（closesUntil 已截断未来）。

import { INSTRUMENT_MAP, type PriceSeries, type RealRow } from "./market";
import type { StrategyConfig, StyleKey } from "./strategies";
import { computeMetrics, type Metrics } from "./metrics";
import { indexTrend, alignIndexBars, BENCH_INDEX, BENCH_INDEX_NAME } from "./index-market";

export type Tier = "Live" | "Forward" | "Backtest" | "Paper";
type Action = "BUY" | "SELL" | "HOLD" | "REJECT";

interface Holding {
  qty: number;
  cost: number; // 加权成本
}

export interface RawDecision {
  day: number;
  action: Action;
  code?: string;
  price?: number;
  qty?: number;
  reason: string;
  source: string;
}

export interface SimResult {
  nav: number[];
  positions: { code: string; name: string; qty: string; price: string; mv: string }[];
  decisions: RawDecision[];
  metrics: Metrics;
}

const NAV0 = 1_000_000;

// ---------- 撮合层（真实成本与约束） ----------
// 成交不是"收盘价直接成交"，而是带手续费 / 滑点 / 涨跌停约束的撮合：
// - 手续费：按市场差异化单边费率，买卖双向收取（金额 = 成交额 × 费率）
// - 滑点：买入按信号价 ×(1+滑点) 成交，卖出按 ×(1-滑点) 成交
// - 涨跌停（仅 A 股）：日内涨跌幅超 ±9.9% 视为封板，无法成交 → 订单 REJECT 并留痕
// 这些成本会真实影响净值 / 指标 / 归因，使回测更接近实盘口径。

const FEE_RATE: Record<string, number> = { A股: 0.00025, 港股: 0.00025, 美股: 0.00025, 加密: 0.0005 };
const SLIP_RATE: Record<string, number> = { A股: 0.001, 港股: 0.001, 美股: 0.001, 加密: 0.002 };
const CN_LIMIT = 0.099; // A 股日内涨跌幅 ±9.9% 视为封板

function marketKindOf(code: string): string {
  return INSTRUMENT_MAP[code]?.market ?? "A股";
}

/** 涨跌停判定（仅 A 股）：返回 "UP" | "DOWN" | null */
function limitStatus(market: PriceSeries, code: string, day: number): "UP" | "DOWN" | null {
  if (marketKindOf(code) !== "A股" || day < 1) return null;
  const prev = market[code]?.[day - 1]?.close;
  const cur = market[code]?.[day]?.close;
  if (!prev || !cur) return null;
  const chg = cur / prev - 1;
  if (chg >= CN_LIMIT) return "UP";
  if (chg <= -CN_LIMIT) return "DOWN";
  return null;
}

export function runSimulation(
  cfg: StrategyConfig,
  market: PriceSeries,
  simDays: number,
  seed: number,
  tier: Tier,
  indexMarket?: Record<string, RealRow[]>
): SimResult {
  // 市场中性特殊处理：多低估值 / 空高估值 对冲篮子
  if (cfg.style === "neutral") return runNeutral(cfg, market, simDays, tier, indexMarket);

  const cash0 = NAV0;
  let cash = cash0;
  const holdings = new Map<string, Holding>();
  const nav: number[] = [cash0];
  const decisions: RawDecision[] = [];
  const gridState = new Map<string, number>();
  for (const c of cfg.universe) gridState.set(c, priceAt(market, c, 0));

  // 大盘维度：基准指数行情对齐到与 buildMarket 相同的窗口（尾部 windowLen 根）
  const windowLen = cfg.universe[0] ? (market[cfg.universe[0]]?.length ?? simDays) : simDays;
  const indexBars = indexMarket?.[BENCH_INDEX] ? alignIndexBars(indexMarket[BENCH_INDEX], windowLen) : null;
  let breakerActive = false; // 熔断是否处于生效中
  let breakerCap = 0; // 当前生效的仓位上限

  for (let day = 1; day < simDays; day++) {

    // 0) 大盘状态 + 熔断护栏（基准指数行情可用时生效；存量策略无 circuitBreaker → 只记状态不改仓位）
    if (indexBars && day >= 20) {
      const tr = indexTrend(indexBars, day);
      if (tr) {
        if (day % 5 === 0) {
          const line = tr.ddFrom20 >= 0 ? "站上" : "低于";
          decisions.push(mk(day, "HOLD", undefined, undefined, undefined,
            `大盘: ${BENCH_INDEX_NAME} ${tr.phase} · ${line}20日线 ${(Math.abs(tr.ddFrom20) * 100).toFixed(1)}% · 距20日高点 ${(tr.ddFrom60 * 100).toFixed(1)}%`,
            "大盘"));
        }
        const cb = cfg.circuitBreaker;
        if (cb?.enabled) {
          const cap = tr.ddFrom60 <= cb.ma60 ? cb.cap60 : tr.ddFrom20 <= cb.ma20 ? cb.cap20 : null;
          if (cap != null && !breakerActive) {
            breakerActive = true;
            breakerCap = cap;
            const r = enforceCap(market, holdings, cash, day, cap, decisions);
            cash = r.cash;
            decisions.push(mk(day, "HOLD", undefined, undefined, undefined,
              `大盘熔断: ${BENCH_INDEX_NAME} ${tr.ddFrom60 <= cb.ma60 ? "跌破60日线" : `低于20日线 ${(Math.abs(tr.ddFrom20) * 100).toFixed(1)}%`}，总仓位上限降至 ${(cap * 100).toFixed(0)}%（当前 ${(r.mvBefore / r.navBefore * 100).toFixed(0)}%）`,
              "风控"));
          } else if (breakerActive) {
            // 解除需回到触发级别之上（滞回，避免边缘反复开关）：60 日线熔断须站回 60 日线，20 日线熔断须站回 20 日线
            const released = breakerCap === cb.cap60 ? tr.ddFrom60 > cb.ma60 : tr.ddFrom20 > cb.ma20;
            if (released) {
              breakerActive = false;
              decisions.push(mk(day, "HOLD", undefined, undefined, undefined,
                `大盘熔断解除: ${BENCH_INDEX_NAME} ${breakerCap === cb.cap60 ? "重新站上60日线" : "重新站上20日线"}，仓位限制恢复`,
                "风控"));
            } else {
              // 熔断持续中：仓位仍超限则继续等比例压降（不重复刷事件）
              const r = enforceCap(market, holdings, cash, day, breakerCap, decisions);
              cash = r.cash;
            }
          }
        }
      }
    }

    // 1) 回撤止损（护栏）——卖出同样走撮合（滑点 + 手续费）
    for (const [code, h] of [...holdings]) {
      const p = priceAt(market, code, day);
        const dd = p / h.cost - 1;
      if (dd <= -cfg.stopDD) {
        if (limitStatus(market, code, day) === "DOWN") {
          decisions.push(mk(day, "REJECT", code, p, undefined, `${INSTRUMENT_MAP[code]?.name ?? code} 跌停无法卖出，止损挂单顺延`, "风控"));
          continue;
        }
        const exec = p * (1 - slipOf(code));
        const fee = h.qty * exec * feeOf(code);
        cash += h.qty * exec - fee;
        holdings.delete(code);
        decisions.push(mk(day, "SELL", code, exec, h.qty, `回撤触及 ${(cfg.stopDD * 100).toFixed(0)}% 止损线，${INSTRUMENT_MAP[code]?.name ?? code} 清仓离场（含手续费与滑点）`, "策略"));
      }
    }

    // 2) 风格信号 → 提案
    const proposals = styleSignals(cfg, market, holdings, day, gridState);

    // 3) 护栏执行（含撮合：滑点成交 + 手续费 + 涨跌停约束）
    let tradedToday = false;
    for (const prop of proposals) {
      if (prop.side === "SELL") {
        const h = holdings.get(prop.code);
        if (h) {
          if (limitStatus(market, prop.code, day) === "DOWN") {
            decisions.push(mk(day, "REJECT", prop.code, prop.price, undefined, `${INSTRUMENT_MAP[prop.code]?.name ?? prop.code} 跌停无法卖出，${prop.reason}`, "风控"));
            tradedToday = true;
            continue;
          }
          const exec = prop.price * (1 - slipOf(prop.code));
          const fee = h.qty * exec * feeOf(prop.code);
          cash += h.qty * exec - fee;
          holdings.delete(prop.code);
          decisions.push(mk(day, "SELL", prop.code, exec, h.qty, prop.reason, "策略"));
          tradedToday = true;
        }
        continue;
      }
      // BUY：护栏校验
      const navB = navValue(market, holdings, cash, day);
      const desired = prop.frac * navB;
      const cap = cfg.maxSingle * navB;
      const nm = INSTRUMENT_MAP[prop.code]?.name ?? prop.code;
      if (desired > cap) {
        decisions.push(mk(day, "REJECT", prop.code, prop.price, undefined, `买入 ${nm} 被拒：金额超出单笔 ${(cfg.maxSingle * 100).toFixed(0)}% NAV 上限`, "风控"));
        continue;
      }
      if (limitStatus(market, prop.code, day) === "UP") {
        decisions.push(mk(day, "REJECT", prop.code, prop.price, undefined, `买入 ${nm} 被拒：涨停封板无法成交`, "风控"));
        continue;
      }
      const affordable = cash - cfg.minCash * navB;
      if (affordable <= 0) {
        continue; // 现金不足以维持保留下限，静默跳过（不重复记 REJECT）
      }
      // 撮合：按滑点后的成交价计算可买数量
      const exec = prop.price * (1 + slipOf(prop.code));
      const notional = Math.min(desired, affordable);
      const qty = roundLot(prop.code, notional / exec);
      if (qty <= 0) continue;
      const fee = qty * exec * feeOf(prop.code);
      if (qty * exec + fee > cash) continue;
      cash -= qty * exec + fee;
      const prev = holdings.get(prop.code);
      if (prev) {
        const totQ = prev.qty + qty;
        holdings.set(prop.code, { qty: totQ, cost: (prev.cost * prev.qty + exec * qty + fee) / totQ });
      } else {
        holdings.set(prop.code, { qty, cost: exec + fee / qty });
      }
      decisions.push(mk(day, "BUY", prop.code, exec, qty, prop.reason, prop.source));
      tradedToday = true;
    }

    // 4) 周期性留痕（无成交时偶尔记 HOLD，保持日志可读）
    if (!tradedToday && day % 15 === 0) {
      decisions.push(mk(day, "HOLD", undefined, undefined, undefined, holdText(cfg.style), "策略"));
    }

    nav.push(navValue(market, holdings, cash, day));
  }

  return {
    nav,
    positions: buildPositions(market, holdings, simDays - 1),
    decisions,
    metrics: computeMetrics(nav, { aggr: cfg.aggr, maxSingle: cfg.maxSingle, minCash: cfg.minCash }),
  };
}

// ---------- 风格信号 ----------

function styleSignals(
  cfg: StrategyConfig,
  market: PriceSeries,
  holdings: Map<string, Holding>,
  day: number,
  gridState: Map<string, number>
): { code: string; side: "BUY" | "SELL"; price: number; frac: number; reason: string; source: string }[] {
  const out: { code: string; side: "BUY" | "SELL"; price: number; frac: number; reason: string; source: string }[] = [];
  const price = (c: string) => priceAt(market, c, day);
  const source = cfg.style === "grid" || cfg.style === "dca" ? "规则" : "模型";

  switch (cfg.style) {
    case "momentum": {
      if (day % cfg.rebalance !== 0 || day < 20) break;
      const ranked = cfg.universe
        .map((c) => ({ c, r: retN(market, c, day, 20) }))
        .sort((a, b) => b.r - a.r);
      const top = ranked.slice(0, cfg.maxPositions).map((x) => x.c);
      // 买入强势且未持仓
      for (const c of top) {
        if (!holdings.has(c)) out.push({ code: c, side: "BUY", price: price(c), frac: cfg.maxSingle, reason: `相对强度居前，动量确认`, source });
      }
      // 卖出掉出前列且转弱的持仓
      for (const [c, h] of holdings) {
        if (!top.includes(c) && retN(market, c, day, 5) < 0) out.push({ code: c, side: "SELL", price: price(c), frac: 1, reason: `${INSTRUMENT_MAP[c].name} 动能减弱，获利了结`, source });
      }
      break;
    }
    case "value": {
      if (day % cfg.rebalance !== 0) break;
      for (const c of cfg.universe) {
        if (holdings.has(c)) continue;
        const p = price(c);
        const m = ma(market, c, day, 200);
        if (p < m) out.push({ code: c, side: "BUY", price: p, frac: Math.min(cfg.maxSingle, 0.15), reason: `估值进入合理区间（低于长期均值），建仓`, source });
      }
      break;
    }
    case "breakout": {
      for (const c of cfg.universe) {
        const p = price(c);
        // 次日不连板即走
        if (holdings.has(c) && p < priceAt(market, c, day - 1)) {
          out.push({ code: c, side: "SELL", price: p, frac: 1, reason: `${INSTRUMENT_MAP[c].name} 未延续强势，止盈离场`, source });
          continue;
        }
        if (!holdings.has(c) && isHighN(market, c, day, 10)) {
          out.push({ code: c, side: "BUY", price: p, frac: cfg.maxSingle, reason: `早盘放量封板，打板介入`, source });
        }
      }
      break;
    }
    case "grid": {
      for (const c of cfg.universe) {
        const p = price(c);
        const last = gridState.get(c) ?? p;
        if (p <= last * 0.98) {
          out.push({ code: c, side: "BUY", price: p, frac: 0.1, reason: `网格触发：跌 2% 自动买入`, source });
          gridState.set(c, p);
        } else if (p >= last * 1.02) {
          out.push({ code: c, side: "SELL", price: p, frac: 0.1, reason: `网格触发：涨 2% 自动卖出`, source });
          gridState.set(c, p);
        }
      }
      break;
    }
    case "rotation": {
      if (day % cfg.rebalance !== 0 || day < 20) break;
      const best = cfg.universe.map((c) => ({ c, r: retN(market, c, day, 20) })).sort((a, b) => b.r - a.r)[0];
      const held = [...holdings.keys()];
        if (best && (!held.includes(best.c) || held.length > 1)) {
          for (const c of held) out.push({ code: c, side: "SELL", price: price(c), frac: 1, reason: `轮动切换，清仓 ${INSTRUMENT_MAP[c].name}`, source });
          out.push({ code: best.c, side: "BUY", price: price(best.c), frac: cfg.maxSingle, reason: `行业轮动居前，重拳出击`, source });
        }
      break;
    }
    case "dca": {
      if (day % cfg.rebalance !== 0) break;
      const per = cfg.maxSingle / cfg.universe.length;
      for (const c of cfg.universe) {
        out.push({ code: c, side: "BUY", price: price(c), frac: per, reason: `定投日加仓（纪律定投）`, source });
      }
      break;
    }
    case "neutral":
      break;
  }

  // 模型偶发"超额加仓"信号 → 交护栏校验，超出单笔上限即被 REJECT（演示风控真实生效）
  if (day > 15 && day % 23 === cfg.id % 23) {
    const c = cfg.universe[day % cfg.universe.length];
    out.push({
      code: c,
      side: "BUY",
      price: price(c),
      frac: cfg.maxSingle * 1.8,
      reason: `强势信号放大，模型建议加仓至 ${Math.round(cfg.maxSingle * 1.8 * 100)}%`,
      source: "模型",
    });
  }
  return out;
}

// ---------- 中性策略（多/空篮子，预建） ----------

function runNeutral(cfg: StrategyConfig, market: PriceSeries, simDays: number, tier: Tier, indexMarket?: Record<string, RealRow[]>): SimResult {
  const longC = cfg.universe[0];
  const shortC = cfg.universe[1];
  const longNotional = 0.6 * NAV0;
  const shortNotional = 0.5 * NAV0;
  const longQty = roundLot(longC, longNotional / priceAt(market, longC, 0));
  const shortQty = roundLot(shortC, shortNotional / priceAt(market, shortC, 0));
  const nav: number[] = [];
  for (let day = 0; day < simDays; day++) {
    const lp = priceAt(market, longC, day);
    const sp = priceAt(market, shortC, day);
    // 多仓盈亏 + 空仓盈亏（空头在价格下跌时盈利）
    const equity = NAV0 + (longQty * lp - longNotional) + (shortNotional - shortQty * sp);
    nav.push(equity);
  }
  const decisions: RawDecision[] = [
    mk(2, "HOLD", undefined, undefined, undefined, "日内对冲平衡，净值平稳", "规则"),
    mk(5, "REJECT", undefined, undefined, undefined, "加杠杆被拒：超过 1.5x 上限", "风控"),
  ];
  // 大盘状态事件（中性策略只记录不强制减仓）
  const windowLen = market[cfg.universe[0]]?.length ?? simDays;
  const indexBars = indexMarket?.[BENCH_INDEX] ? alignIndexBars(indexMarket[BENCH_INDEX], windowLen) : null;
  if (indexBars) {
    for (let d = 20; d < simDays; d += 5) {
      const tr = indexTrend(indexBars, d);
      if (tr) {
        decisions.push(mk(d, "HOLD", undefined, undefined, undefined,
          `大盘: ${BENCH_INDEX_NAME} ${tr.phase} · ${tr.ddFrom20 >= 0 ? "站上" : "低于"}20日线 ${(Math.abs(tr.ddFrom20) * 100).toFixed(1)}%`,
          "大盘"));
      }
    }
  }
  decisions.sort((a, b) => a.day - b.day);
  const positions = [
    { code: "多头", name: "一篮子低估值", qty: "—", price: "—", mv: fmtMoney(longQty * priceAt(market, longC, simDays - 1)) },
    { code: "空头", name: "一篮子高估值", qty: "—", price: "—", mv: fmtMoney(-(shortQty * priceAt(market, shortC, simDays - 1))) },
  ];
  return { nav, positions, decisions, metrics: computeMetrics(nav, { aggr: cfg.aggr, maxSingle: cfg.maxSingle, minCash: cfg.minCash }) };
}

// ---------- 工具 ----------

// 大盘熔断等比例减仓：总仓位强制降至 cap × NAV（卖出走撮合：滑点 + 手续费 + 跌停约束）
function enforceCap(
  market: PriceSeries,
  holdings: Map<string, Holding>,
  cash: number,
  day: number,
  cap: number,
  decisions: RawDecision[]
): { cash: number; mvBefore: number; navBefore: number } {
  const navBefore = navValue(market, holdings, cash, day);
  const mvBefore = navBefore - cash;
  const targetMv = cap * navBefore;
  if (mvBefore <= targetMv) return { cash, mvBefore, navBefore };
  for (const [code, h] of [...holdings]) {
    if (mvBefore <= targetMv) break;
    const p = priceAt(market, code, day);
    if (p <= 0) continue;
    const mvI = h.qty * p;
    const targetI = targetMv * (mvI / mvBefore);
    const exec = p * (1 - slipOf(code));
    const maxSell = Math.max(0, Math.floor((mvI - targetI) / exec));
    if (maxSell <= 0) continue;
    if (limitStatus(market, code, day) === "DOWN") {
      decisions.push(mk(day, "REJECT", code, p, undefined, `${INSTRUMENT_MAP[code]?.name ?? code} 跌停无法卖出，熔断减仓挂单顺延`, "风控"));
      continue;
    }
    const qty = Math.min(maxSell, h.qty);
    const fee = qty * exec * feeOf(code);
    cash += qty * exec - fee;
    decisions.push(mk(day, "SELL", code, p, qty, `${INSTRUMENT_MAP[code]?.name ?? code} 大盘熔断降仓：卖出 ${fmtQty(code, qty)} ${INSTRUMENT_MAP[code]?.market === "加密" ? "枚" : "股"}`, "风控"));
    if (qty >= h.qty) holdings.delete(code);
    else holdings.set(code, { qty: h.qty - qty, cost: h.cost });
  }
  return { cash, mvBefore, navBefore };
}

function navValue(market: PriceSeries, holdings: Map<string, Holding>, cash: number, day: number): number {
  let v = cash;
  for (const [code, h] of holdings) v += h.qty * priceAt(market, code, day);
  return v;
}

function buildPositions(market: PriceSeries, holdings: Map<string, Holding>, day: number) {
  const arr = [...holdings.entries()].map(([code, h]) => {
    const p = priceAt(market, code, day);
    return {
      code,
      name: INSTRUMENT_MAP[code]?.name ?? code,
      qty: fmtQty(code, h.qty),
      price: fmtPrice(code, p),
      mv: fmtMoney(h.qty * p),
    };
  });
  arr.sort((a, b) => Number(b.mv.replace(/[^\d.]/g, "")) - Number(a.mv.replace(/[^\d.]/g, "")));
  return arr;
}

function feeOf(code: string): number {
  return FEE_RATE[marketKindOf(code)] ?? 0.00025;
}

function slipOf(code: string): number {
  return SLIP_RATE[marketKindOf(code)] ?? 0.001;
}

function priceAt(market: PriceSeries, code: string, day: number): number {
  const bars = market[code];
  if (!bars || bars.length === 0) return 0;
  const i = Math.max(0, Math.min(day, bars.length - 1));
  return bars[i].close;
}

function retN(market: PriceSeries, code: string, day: number, n: number): number {
  const bars = market[code];
  if (!bars || day < n) return 0;
  const cur = bars[day].close;
  const past = bars[day - n].close;
  return cur / past - 1;
}

function ma(market: PriceSeries, code: string, day: number, n: number): number {
  const bars = market[code];
  if (!bars) return 0;
  const start = Math.max(0, day - n + 1);
  let s = 0;
  let c = 0;
  for (let i = start; i <= day; i++) {
    s += bars[i].close;
    c++;
  }
  return c ? s / c : 0;
}

function isHighN(market: PriceSeries, code: string, day: number, n: number): boolean {
  const bars = market[code];
  if (!bars || day < n) return false;
  const window = bars.slice(day - n + 1, day + 1).map((b) => b.close);
  const cur = window[window.length - 1];
  const prev = day > 0 ? bars[day - 1].close : cur;
  return cur >= Math.max(...window) - 1e-9 && cur > prev;
}

function roundLot(code: string, qty: number): number {
  const inst = INSTRUMENT_MAP[code];
  if (!inst) return Math.round(qty);
  if (inst.market === "加密") return Math.round(qty * 10000) / 10000;
  const lot = Math.round(qty / 100) * 100;
  return lot;
}

function fmtQty(code: string, qty: number): string {
  const inst = INSTRUMENT_MAP[code];
  if (inst?.market === "加密") return qty.toFixed(4);
  return String(Math.round(qty));
}

function fmtPrice(code: string, p: number): string {
  const inst = INSTRUMENT_MAP[code];
  if (inst?.market === "加密") return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 100) return p.toFixed(2);
  return p.toFixed(2);
}

function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + Math.abs(Math.round(n)).toLocaleString("en-US");
}

function mk(day: number, action: Action, code: string | undefined, price: number | undefined, qty: number | undefined, reason: string, source: string): RawDecision {
  return { day, action, code, price, qty, reason, source };
}

function holdText(style: StyleKey): string {
  switch (style) {
    case "value":
      return "持有不动，好公司不需要天天看";
    case "grid":
      return "价格在区间内，等待网格触发";
    case "momentum":
      return "模型选择持有，趋势未破坏";
    case "breakout":
      return "封板强度不足，继续观察";
    case "rotation":
      return "格局未变，维持现有仓位";
    case "dca":
      return "非定投日，持有";
    default:
      return "持有";
  }
}
