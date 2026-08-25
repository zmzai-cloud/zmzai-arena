// 黑天鹅压力测试：把历史极端行情「冲击」叠加到同一段基础行情上，
// 让所有智能体在受压行情下重跑仿真引擎，观察谁扛得住、谁爆仓。
//
// 设计原则：
// - 复用 P1 的 runSimulation 与「同一段基础行情」，只改变行情输入，不改动引擎逻辑。
// - 冲击是确定性的乘数叠加（smoothstep 形态），可复现、SSR/客户端一致。
// - 三类历史场景各有差异化的市场强度（A股/港股/美股/加密受冲击不同），制造丰富的分化结果。

import { INSTRUMENTS, type MarketKind, type PriceSeries } from "./market";
import { STRATEGIES } from "./strategies";
import { runSimulation, type Tier as SimTier } from "./engine";

export type StressStatus = "稳健" | "承压" | "重创" | "爆仓";

export interface StressScenario {
  id: string;
  name: string;
  period: string;
  desc: string;
  anchor: number; // 冲击开始的交易日
  trough: number; // 触底交易日
  recover: number; // 反弹完成的交易日
  rebound: number; // 0..1，触底后收复的跌幅比例
  troughMul: Record<MarketKind, number>; // 触底时价格乘数（0.55 = -45%）
}

// 三大历史极端行情。troughMul 按市场分化：同一场危机，A股/美股/加密受伤程度不同。
export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: "crash2015",
    name: "2015 股灾",
    period: "2015.06–2015.08",
    desc: "杠杆牛崩盘，千股跌停，A股两个月近乎腰斩；美股小幅回调，加密尚处早期、低相关。",
    anchor: 15,
    trough: 50,
    recover: 110,
    rebound: 0.3,
    troughMul: { "A股": 0.45, "港股": 0.6, "美股": 0.9, "加密": 1.08 },
  },
  {
    id: "bear2018",
    name: "2018 阴跌",
    period: "2018 全年",
    desc: "贸易摩擦下全年单边下行，A股阴跌一整年未回头；美股微涨，加密步入漫长熊市。",
    anchor: 10,
    trough: 220,
    recover: 300,
    rebound: 0.05,
    troughMul: { "A股": 0.5, "港股": 0.55, "美股": 1.0, "加密": 0.2 },
  },
  {
    id: "covid2020",
    name: "2020 熔断",
    period: "2020.02–2020.04",
    desc: "疫情全球熔断，一个月内急挫后 V 型反弹；A股跌幅较轻，美股/加密走出深 V。",
    anchor: 20,
    trough: 50,
    recover: 120,
    rebound: 0.9,
    troughMul: { "A股": 0.8, "港股": 0.78, "美股": 0.55, "加密": 0.4 },
  },
];

export interface SimSpec {
  id: number;
  tier: SimTier;
  simDays: number;
  seed: number;
}

export interface AgentStress {
  agentId: number;
  scenarioId: string;
  totalReturn: number; // %
  maxDD: number; // %
  sharpe: number;
  finalNav: number;
  status: StressStatus;
  survived: boolean; // 期末净值 > 0.5×初始（亏损 < 50%）
}

export interface ScenarioResult {
  scenario: StressScenario;
  agents: AgentStress[];
  survivedCount: number; // 存活的 Agent 数
  total: number;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// 对某市场生成「冲击乘数」序列：anchor 前=1，anchor→trough 平滑跌到 troughMul，
// trough→recover 部分反弹到 finalLevel，之后维持。
function buildOverlay(scn: StressScenario, market: MarketKind, days: number): number[] {
  const trough = scn.troughMul[market] ?? 1;
  const finalLevel = 1 - (1 - trough) * (1 - scn.rebound);
  const out: number[] = [];
  for (let t = 0; t < days; t++) {
    let s: number;
    if (t < scn.anchor) s = 1;
    else if (t <= scn.trough) s = 1 - (1 - trough) * smoothstep(scn.anchor, scn.trough, t);
    else if (t <= scn.recover) s = trough + (finalLevel - trough) * smoothstep(scn.trough, scn.recover, t);
    else s = finalLevel;
    out.push(s);
  }
  return out;
}

function stressMarket(base: PriceSeries, scn: StressScenario): PriceSeries {
  const anyCode = Object.keys(base)[0];
  const days = base[anyCode]?.length ?? 0;
  // 预计算每个标的的叠加乘数
  const overlays: Record<string, number[]> = {};
  for (const inst of INSTRUMENTS) {
    overlays[inst.code] = buildOverlay(scn, inst.market, days);
  }
  const out: PriceSeries = {};
  for (const code of Object.keys(base)) {
    const ov = overlays[code] ?? new Array(days).fill(1);
    out[code] = base[code].map((b, t) => {
      const m = ov[t] ?? 1;
      return {
        t: b.t,
        close: round2(b.close * m),
        high: round2(b.high * m),
        low: round2(b.low * m),
      };
    });
  }
  return out;
}

function classify(totalReturn: number): { status: StressStatus; survived: boolean } {
  if (totalReturn <= -35) return { status: "爆仓", survived: false };
  if (totalReturn <= -18) return { status: "重创", survived: true };
  if (totalReturn < 0) return { status: "承压", survived: true };
  return { status: "稳健", survived: true };
}

// 对全部场景跑全部 Agent。base 为 P1 用的同一段基础行情；specs 携带每个 Agent 的 tier/simDays/seed。
export function runStressTest(base: PriceSeries, specs: SimSpec[]): ScenarioResult[] {
  return STRESS_SCENARIOS.map((scn) => {
    const stressed = stressMarket(base, scn);
    const agents: AgentStress[] = STRATEGIES.map((cfg) => {
      const spec = specs.find((s) => s.id === cfg.id)!;
      const res = runSimulation(cfg, stressed, spec.simDays, spec.seed, spec.tier);
      const tr = res.metrics.totalReturn;
      const { status, survived } = classify(tr);
      return {
        agentId: cfg.id,
        scenarioId: scn.id,
        totalReturn: tr,
        maxDD: res.metrics.maxDD,
        sharpe: res.metrics.sharpe,
        finalNav: res.nav[res.nav.length - 1],
        status,
        survived,
      };
    }).sort((a, b) => b.totalReturn - a.totalReturn);
    const survivedCount = agents.filter((a) => a.survived).length;
    return { scenario: scn, agents, survivedCount, total: agents.length };
  });
}

function round2(n: number): number {
  if (n >= 1000) return Math.round(n * 10) / 10;
  if (n >= 100) return Math.round(n * 100) / 100;
  return Math.round(n * 1000) / 1000;
}
