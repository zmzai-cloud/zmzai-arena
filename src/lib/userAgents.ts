// 用户创建的智能体：纯客户端流程（无后端）。
// 复用 P1 仿真引擎与「同一段全局行情 market」，让用户的策略与官方 Agent 在公平、一致的行情上 PK。
// 创建结果序列化存入 localStorage，详情页 / 排行榜 / 我的 均可读取。
//
// 设计：agents.ts 是服务端模块（加载时跑仿真），用户 Agent 无法混入其静态数组，
// 因此用户 Agent 仅存于客户端 localStorage，由本模块在客户端合并与解析。

import { INSTRUMENT_MAP } from "@/sim/market";
import { runSimulation, type RawDecision, type Tier as SimTier } from "@/sim/engine";
import { stressForConfig, type AgentStress, type SimSpec } from "@/sim/stress";
import { attributeReturn, type Attribution } from "@/sim/attribution";
import { certifyRobustness, type RobustnessCert } from "@/sim/robustness";
import { computeIntegrityHash } from "@/lib/integrity";
import { type Agent, type Decision, market, agents as STATIC_AGENTS } from "@/data/agents";
import { type StrategyConfig, type StyleKey } from "@/sim/strategies";
import type { Metrics } from "@/sim/metrics";

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
// 每种风格的回测周期（交易日）。超过 120 天的风格在 Free 计划下会被服务端拦截，需 Pro。
export const STYLE_SIMDAYS: Record<StyleKey, number> = {
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

/** 由表单输入重建策略配置（与官方 Agent 同档风控参数），同时作为档案存档供重新验证 */
function buildCfg(input: CreateAgentInput, id: number): StrategyConfig {
  const universe = input.universe.filter((c) => INSTRUMENT_MAP[c]);
  return {
    id,
    style: input.style,
    universe,
    maxSingle: input.maxSingle,
    minCash: input.minCash,
    maxPositions: Math.max(1, Math.min(6, universe.length)),
    stopDD: input.stopDD,
    rebalance: Math.max(1, Math.round(input.rebalance)),
    aggr: STYLE_AGGR[input.style],
  };
}

/** 回测结果的统一契约（本地引擎 / 沙箱返回同构） */
interface BacktestParts {
  metrics: Metrics;
  positions: Agent["positions"];
  decisions: RawDecision[];
  attribution: Attribution;
  robustness: RobustnessCert;
  stress: Record<string, AgentStress>;
}

/**
 * 由回测产物组装 Agent（本地与沙箱路径共用，保证字段口径一致）。
 * cfgOverride：重新验证时传入原存档配置，保证与档案基准完全同参重跑。
 */
function assembleAgent(input: CreateAgentInput, creator: string, id: number, simDays: number, seed: number, parts: BacktestParts, engine: Agent["engine"], sandboxRunId?: string, cfgOverride?: StrategyConfig): Agent {
  const style = input.style;
  const universe = input.universe.filter((c) => INSTRUMENT_MAP[c]);
  const marketLabel = universe.length ? INSTRUMENT_MAP[universe[0]]?.market ?? "A股" : "A股";
  const cfg = cfgOverride ?? buildCfg(input, id);

  const a: Agent = {
    id,
    emoji: input.emoji || "🤖",
    name: input.name.trim() || "无名策略",
    persona: input.persona.trim() || `${STYLE_LABELS[style]}派`,
    creator: creator || "我",
    market: marketLabel,
    style: STYLE_LABELS[style],
    tier: "Paper",
    totalReturn: parts.metrics.totalReturn,
    maxDD: parts.metrics.maxDD,
    sharpe: parts.metrics.sharpe,
    riskScore: parts.metrics.riskScore,
    riskBreakdown: parts.metrics.riskBreakdown,
    attribution: parts.attribution,
    robustness: parts.robustness,
    integrityHash: "",
    days: simDays,
    followers: 0,
    slogan: input.slogan?.trim() || `${input.name} · 用户策略`,
    verified: false,
    prompt: input.prompt,
    guard: `风控规则：单笔 ≤ ${pct(input.maxSingle)} NAV；强制 ≥ ${pct(
      input.minCash
    )} 现金；回撤 > ${pct(input.stopDD)} 自动减仓。`,
    positions: parts.positions,
    log: parts.decisions.map((r) => toDecision(r, simDays)).slice(-12),
    stress: parts.stress,
    engine,
    ...(sandboxRunId ? { sandboxRunId } : {}),
    cfg, // 完整策略配置存档：详情页可一键重新验证
    simDays, // 引擎模拟天数（重验证基准周期）
  };
  a.integrityHash = computeIntegrityHash(a);
  return a;
}

export function createUserAgent(input: CreateAgentInput, creator: string): Agent {
  // id = 时间戳 + 随机后缀，避免同毫秒内连建两次覆盖（Date.now() 冲突）
  const id = Date.now() + Math.floor(Math.random() * 1_000_000);
  const style = input.style;
  const simDays = STYLE_SIMDAYS[style];
  const seed = 20260825 + (id % 100000) + Math.floor(Math.random() * 100000);

  const cfg: StrategyConfig = buildCfg(input, id);

  const res = runSimulation(cfg, market, simDays, seed, "Paper" as SimTier);
  const stress = buildStress(id, simDays, seed, cfg);

  return assembleAgent(input, creator, id, simDays, seed, {
    metrics: res.metrics,
    positions: res.positions,
    decisions: res.decisions,
    attribution: attributeReturn(res, market, cfg, simDays, "Paper", seed),
    robustness: certifyRobustness(market, cfg, simDays, "Paper", seed),
    stress,
  }, "local");
}

// ---------- 沙箱回测创建（优先）：提交 zmzai-sandbox 真实回测，失败自动降级本地 ----------

interface BacktestApiResponse {
  engine: "sandbox" | "local";
  runId: string | null;
  note: string | null;
  result: {
    metrics: Metrics;
    positions: Agent["positions"];
    decisions: RawDecision[];
    attribution: Attribution;
    robustness: RobustnessCert;
    stress: Record<string, AgentStress>;
  };
}

/**
 * 配额/计划拦截错误：服务端 402 时抛出（前端显示升级引导），不降级本地引擎——
 * 本地引擎虽不耗服务器算力，但会让配额形同虚设。
 */
export class BacktestQuotaError extends Error {
  code: string;
  upgradeUrl: string | null;
  constructor(message: string, code: string, upgradeUrl: string | null = null) {
    super(message);
    this.name = "BacktestQuotaError";
    this.code = code;
    this.upgradeUrl = upgradeUrl;
  }
}

/**
 * 调用服务端 /api/backtest：优先 zmzai-sandbox 隔离沙箱真实回测（含撮合成本），
 * 服务端已内置失败降级，此处仅做网络层兜底（接口不可达时退回本地引擎）。
 * 注意：402（配额用尽 / 计划超限）会抛出 BacktestQuotaError，绝不静默降级。
 */
export async function createUserAgentRemote(input: CreateAgentInput, creator: string): Promise<Agent> {
  // id = 时间戳 + 随机后缀，避免同毫秒内连建两次覆盖（Date.now() 冲突）
  const id = Date.now() + Math.floor(Math.random() * 1_000_000);
  const style = input.style;
  const universe = input.universe.filter((c) => INSTRUMENT_MAP[c]);
  const simDays = STYLE_SIMDAYS[style];
  const seed = 20260825 + (id % 100000) + Math.floor(Math.random() * 100000);

  const cfg: StrategyConfig = buildCfg(input, id);

  let res: Response;
  try {
    res = await fetch("/api/backtest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cfg, simDays, seed }),
      cache: "no-store",
    });
  } catch {
    // 网络层不可达：降级本地引擎，保证可用性
    console.warn("[arena] 回测接口不可达，降级本地引擎：");
    return createUserAgent(input, creator);
  }

  if (res.status === 402) {
    let code = "QUOTA_EXCEEDED";
    let message = "本月沙箱回测额度已用完，升级 Pro 解锁无限回测";
    let upgradeUrl: string | null = null;
    try {
      const err = (await res.json()) as { code?: string; error?: string; upgradeUrl?: string };
      code = err.code ?? code;
      message = err.error ?? message;
      upgradeUrl = err.upgradeUrl ?? null;
    } catch {
      // 忽略解析失败
    }
    throw new BacktestQuotaError(message, code, upgradeUrl);
  }
  if (!res.ok) {
    // 5xx / 其他服务端错误：服务器兜底失败，退回本地引擎
    console.warn(`[arena] 回测接口 HTTP ${res.status}，降级本地引擎：`);
    return createUserAgent(input, creator);
  }
  const data = (await res.json()) as BacktestApiResponse;
  return assembleAgent(input, creator, id, simDays, seed, {
    metrics: data.result.metrics,
    positions: data.result.positions,
    decisions: data.result.decisions,
    attribution: data.result.attribution,
    robustness: data.result.robustness,
    stress: data.result.stress,
  }, data.engine, data.runId ?? undefined);
}

// ---------- 重新验证：按档案存档配置在沙箱重跑（每次消耗一次回测配额） ----------

/** 从 Agent 存档重建表单输入（重验证复用组装管线，名称/人设/护栏原样保留） */
function inputFromAgent(agent: Agent): CreateAgentInput {
  const cfg = agent.cfg!;
  return {
    emoji: agent.emoji,
    name: agent.name,
    persona: agent.persona,
    universe: cfg.universe,
    style: cfg.style,
    maxSingle: cfg.maxSingle,
    minCash: cfg.minCash,
    stopDD: cfg.stopDD,
    rebalance: cfg.rebalance,
    prompt: agent.prompt,
    slogan: agent.slogan,
  };
}

/**
 * 重新验证：按 Agent 存档的完整策略配置重跑回测（全新随机行情种子），
 * 产物为「我」的用户副本（新 id），与档案基准同参对照，可判断策略是否仍成立。
 * 官方与用户 Agent 均可重验；每次消耗一次回测配额（Free 3 次/月，Pro 无限）。
 * 402（配额用尽 / 计划超限）抛 BacktestQuotaError，调用方展示升级引导，绝不静默降级。
 */
export async function reverifyAgentRemote(agent: Agent): Promise<Agent> {
  if (!agent.cfg) throw new Error("该 Agent 无存档策略配置，无法重新验证");
  // 副本 id：时间戳 + 随机后缀，避免覆盖
  const id = Date.now() + Math.floor(Math.random() * 1_000_000);
  // 重验证基准周期：官方 Agent 的 simDays 与展示 days 解耦，必须按引擎周期重跑才与档案可比
  const simDays = agent.simDays ?? agent.days;
  const seed = 20260825 + (id % 100000) + Math.floor(Math.random() * 100000);

  let res: Response;
  try {
    res = await fetch("/api/backtest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cfg: agent.cfg, simDays, seed }),
      cache: "no-store",
    });
  } catch {
    // 网络层不可达：退回本地引擎重跑（同一份源码），可用性优先
    console.warn("[arena] 重新验证接口不可达，降级本地引擎：");
    return reverifyLocal(agent, id, simDays, seed);
  }

  if (res.status === 402) {
    let code = "QUOTA_EXCEEDED";
    let message = "本月沙箱回测额度已用完，升级 Pro 解锁无限回测";
    let upgradeUrl: string | null = null;
    try {
      const err = (await res.json()) as { code?: string; error?: string; upgradeUrl?: string };
      code = err.code ?? code;
      message = err.error ?? message;
      upgradeUrl = err.upgradeUrl ?? null;
    } catch {
      // 忽略解析失败
    }
    throw new BacktestQuotaError(message, code, upgradeUrl);
  }
  if (!res.ok) {
    // 5xx / 其他服务端错误：服务器兜底失败，退回本地引擎
    console.warn(`[arena] 重新验证接口 HTTP ${res.status}，降级本地引擎：`);
    return reverifyLocal(agent, id, simDays, seed);
  }
  const data = (await res.json()) as BacktestApiResponse;
  return assembleAgent(
    inputFromAgent(agent),
    "我", // 复验产物归属当前用户（官方 Agent 的重验副本不再是官方档案）
    id,
    simDays,
    seed,
    {
      metrics: data.result.metrics,
      positions: data.result.positions,
      decisions: data.result.decisions,
      attribution: data.result.attribution,
      robustness: data.result.robustness,
      stress: data.result.stress,
    },
    data.engine,
    data.runId ?? undefined,
    agent.cfg // 原存档配置原样保留（含用户微调参数），与档案基准完全同参
  );
}

/** 本地引擎重跑（网络降级路径）：与创建流程同款管线 */
function reverifyLocal(agent: Agent, id: number, simDays: number, seed: number): Agent {
  const cfg = agent.cfg!;
  const res = runSimulation(cfg, market, simDays, seed, "Paper" as SimTier);
  const stress = buildStress(id, simDays, seed, cfg);
  return assembleAgent(
    inputFromAgent(agent),
    "我",
    id,
    simDays,
    seed,
    {
      metrics: res.metrics,
      positions: res.positions,
      decisions: res.decisions,
      attribution: attributeReturn(res, market, cfg, simDays, "Paper", seed),
      robustness: certifyRobustness(market, cfg, simDays, "Paper", seed),
      stress,
    },
    "local",
    undefined,
    cfg
  );
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
