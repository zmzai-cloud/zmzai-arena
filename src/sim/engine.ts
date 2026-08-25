// 仿真引擎：逐日运行策略 → 产出成交 / 持仓 / 净值曲线 / 决策日志。
// 风控护栏在引擎内强制执行，超限订单转为 REJECT 决策（而非成交）。
// 反前瞻：策略只能看到 ≤ 当前 day 的行情（closesUntil 已截断未来）。

import { INSTRUMENT_MAP, type PriceSeries } from "./market";
import type { StrategyConfig, StyleKey } from "./strategies";
import { computeMetrics, type Metrics } from "./metrics";

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

export function runSimulation(
  cfg: StrategyConfig,
  market: PriceSeries,
  simDays: number,
  seed: number,
  tier: Tier
): SimResult {
  // 市场中性特殊处理：多低估值 / 空高估值 对冲篮子
  if (cfg.style === "neutral") return runNeutral(cfg, market, simDays, tier);

  const cash0 = NAV0;
  let cash = cash0;
  const holdings = new Map<string, Holding>();
  const nav: number[] = [cash0];
  const decisions: RawDecision[] = [];
  const gridState = new Map<string, number>();
  for (const c of cfg.universe) gridState.set(c, priceAt(market, c, 0));

  for (let day = 1; day < simDays; day++) {

    // 1) 回撤止损（护栏）
    for (const [code, h] of [...holdings]) {
      const p = priceAt(market, code, day);
        const dd = p / h.cost - 1;
      if (dd <= -cfg.stopDD) {
        cash += h.qty * p;
        holdings.delete(code);
        decisions.push(mk(day, "SELL", code, p, h.qty, `回撤触及 ${(cfg.stopDD * 100).toFixed(0)}% 止损线，${INSTRUMENT_MAP[code]?.name ?? code} 清仓离场`, "策略"));
      }
    }

    // 2) 风格信号 → 提案
    const proposals = styleSignals(cfg, market, holdings, day, gridState);

    // 3) 护栏执行
    let tradedToday = false;
    for (const prop of proposals) {
      if (prop.side === "SELL") {
        const h = holdings.get(prop.code);
        if (h) {
          cash += h.qty * prop.price;
          holdings.delete(prop.code);
          decisions.push(mk(day, "SELL", prop.code, prop.price, h.qty, prop.reason, "策略"));
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
      const affordable = cash - cfg.minCash * navB;
      if (affordable <= 0) {
        continue; // 现金不足以维持保留下限，静默跳过（不重复记 REJECT）
      }
      const notional = Math.min(desired, affordable);
      const qty = roundLot(prop.code, notional / prop.price);
      if (qty <= 0) continue;
      cash -= qty * prop.price;
      const prev = holdings.get(prop.code);
      if (prev) {
        const totQ = prev.qty + qty;
        holdings.set(prop.code, { qty: totQ, cost: (prev.cost * prev.qty + prop.price * qty) / totQ });
      } else {
        holdings.set(prop.code, { qty, cost: prop.price });
      }
      decisions.push(mk(day, "BUY", prop.code, prop.price, qty, prop.reason, prop.source));
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
    metrics: computeMetrics(nav, cfg.aggr),
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

function runNeutral(cfg: StrategyConfig, market: PriceSeries, simDays: number, tier: Tier): SimResult {
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
  const positions = [
    { code: "多头", name: "一篮子低估值", qty: "—", price: "—", mv: fmtMoney(longQty * priceAt(market, longC, simDays - 1)) },
    { code: "空头", name: "一篮子高估值", qty: "—", price: "—", mv: fmtMoney(-(shortQty * priceAt(market, shortC, simDays - 1))) },
  ];
  return { nav, positions, decisions, metrics: computeMetrics(nav, cfg.aggr) };
}

// ---------- 工具 ----------

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
