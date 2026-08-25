// 用户创建的智能体：纯客户端流程（无后端）。
// 复用 P1 仿真引擎与「同一段全局行情 market」，让用户的策略与官方 Agent 在公平、一致的行情上 PK。
// 创建结果序列化存入 localStorage，详情页 / 排行榜 / 我的 均可读取。
//
// 设计：agents.ts 是服务端模块（加载时跑仿真），用户 Agent 无法混入其静态数组，
// 因此用户 Agent 仅存于客户端 localStorage，由本模块在客户端合并与解析。

import { INSTRUMENT_MAP } from "@/sim/market";
import { runSimulation, type RawDecision, type Tier as SimTier } from "@/sim/engine";
import { stressForConfig, type AgentStress, type SimSpec } from "@/sim/stress";
import { type Agent, type Decision, market, agents as STATIC_AGENTS } from "@/data/agents";
import { type StrategyConfig, type StyleKey } from "@/sim/strategies";

// ---------- 表单可选配置 ----------

export const STYLE_LABELS: Record<StyleKey, string> = {
  momentum: "动量",
  value: "价值",
  breakout: "打板",
  grid: "网格",
  rotation: "轮动",
  dca: "定投",
  neutral: "市场中性",
};

export const STYLE_OPTIONS: { key: StyleKey; label: string }[] = (
  Object.keys(STYLE_LABELS) as StyleKey[]
).map((k) => ({ key: k, label: STYLE_LABELS[k] }));

export interface InstrumentOption {
  code: string;
  name: string;
  market: string;
}
export const INSTRUMENT_OPTIONS: InstrumentOption[] = Object.entries(INSTRUMENT_MAP).map(
  ([code, v]) => ({ code, name: v.name, market: v.market })
);

// 各风格默认参数（与官方 Agent 同档），用户可在表单微调风控护栏
const STYLE_AGGR: Record<StyleKey, number> = {
  momentum: 28,
  value: 20,
  breakout: 46,
  grid: 4,
  rotation: 36,
  dca: 16,
  neutral: 8,
};
const STYLE_SIMDAYS: Record<StyleKey, number> = {
  momentum: 120,
  value: 252,
  breakout: 60,
  grid: 300,
  rotation: 90,
  dca: 260,
  neutral: 180,
};

export interface CreateAgentInput {
  emoji: string;
  name: string;
  persona: string;
  universe: string[]; // 标的代码
  style: StyleKey;
  maxSingle: number; // 0..1
  minCash: number; // 0..1
  stopDD: number; // 0..1
  rebalance: number; // 天
  prompt: string;
  slogan?: string;
}

// ---------- 决策日志格式化（与官方 Agent 同款） ----------

function fmtTime(day: number, simDays: number): string {
  const base = new Date(2026, 7, 25);
  const d = new Date(base);
  d.setDate(base.getDate() - (simDays - 1 - day));
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const DD = String(d.getDate()).padStart(2, "0");
  const times = ["09:35", "10:15", "11:10", "13:40", "14:02", "09:32", "10:31"];
  return `${MM}-${DD} ${times[day % times.length]}`;
}

function toDecision(r: RawDecision, simDays: number): Decision {
  const name = r.code ? INSTRUMENT_MAP[r.code]?.name ?? r.code : "";
  let text = r.reason;
  if (r.action === "BUY" && r.code) {
    const unit = INSTRUMENT_MAP[r.code]?.market === "加密" ? "枚" : "股";
    text = `买入 ${r.qty} ${unit} ${name}：${r.reason}`;
  }
  const meta =
    r.source === "风控"
      ? "风控引擎 · 自动拦截"
      : r.source === "规则"
        ? "规则引擎 · 0 tok"
        : "你的策略 · 模型推演";
  return { action: r.action, time: fmtTime(r.day, simDays), text, meta };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

// ---------- 黑天鹅压力测试（与官方共用 STRESS_SCENARIOS） ----------

function buildStress(id: number, simDays: number, seed: number, cfg: StrategyConfig): Record<string, AgentStress> {
  const spec: SimSpec = { id, tier: "Paper" as SimTier, simDays, seed };
  return stressForConfig(market, cfg, spec);
}

// ---------- 核心：由表单输入创建一个智能体 ----------

export function createUserAgent(input: CreateAgentInput, creator: string): Agent {
  const id = Date.now();
  const style = input.style;
  const universe = input.universe.filter((c) => INSTRUMENT_MAP[c]);
  const simDays = STYLE_SIMDAYS[style];
  const seed = 20260825 + (id % 100000) + Math.floor(Math.random() * 100000);

  const cfg: StrategyConfig = {
    id,
    style,
    universe,
    maxSingle: input.maxSingle,
    minCash: input.minCash,
    maxPositions: Math.max(1, Math.min(6, universe.length)),
    stopDD: input.stopDD,
    rebalance: Math.max(1, Math.round(input.rebalance)),
    aggr: STYLE_AGGR[style],
  };

  const res = runSimulation(cfg, market, simDays, seed, "Paper" as SimTier);
  const stress = buildStress(id, simDays, seed, cfg);
  const marketLabel = universe.length ? INSTRUMENT_MAP[universe[0]]?.market ?? "A股" : "A股";

  return {
    id,
    emoji: input.emoji || "🤖",
    name: input.name.trim() || "无名策略",
    persona: input.persona.trim() || `${STYLE_LABELS[style]}派`,
    creator: creator || "我",
    market: marketLabel,
    style: STYLE_LABELS[style],
    tier: "Paper",
    totalReturn: res.metrics.totalReturn,
    maxDD: res.metrics.maxDD,
    sharpe: res.metrics.sharpe,
    riskScore: res.metrics.riskScore,
    days: simDays,
    followers: 0,
    slogan: input.slogan?.trim() || `${input.name} · 用户策略`,
    verified: false,
    prompt: input.prompt,
    guard: `风控规则：单笔 ≤ ${pct(input.maxSingle)} NAV；强制 ≥ ${pct(
      input.minCash
    )} 现金；回撤 > ${pct(input.stopDD)} 自动减仓。`,
    positions: res.positions,
    log: res.decisions.map((r) => toDecision(r, simDays)).slice(-12),
    stress,
  };
}

// ---------- localStorage 持久化 ----------

const LS_KEY = "zmzai_arena_user_agents_v1";

export function loadUserAgents(): Agent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Agent[]) : [];
  } catch {
    return [];
  }
}

export function saveUserAgent(a: Agent): void {
  const list = loadUserAgents();
  list.push(a);
  if (typeof window !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(list));
}

export function getUserAgent(id: number): Agent | undefined {
  return loadUserAgents().find((a) => a.id === id);
}

export function deleteUserAgent(id: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify(loadUserAgents().filter((a) => a.id !== id)));
}

// 排行榜用：官方（静态）+ 用户（localStorage）合并
export function combinedAgents(): Agent[] {
  return [...STATIC_AGENTS, ...loadUserAgents()];
}
