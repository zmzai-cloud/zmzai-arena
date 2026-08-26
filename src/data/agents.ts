// zmzai 投研竞技场 — 数据层（由 src/sim 仿真引擎实时计算，替换原手写 mock）
//
// 设计：静态人设/策略文案保留在此（UI 展示用），而持仓、决策日志、收益/回撤/夏普/风险分
// 全部由仿真引擎逐日跑出。引擎只读取 ≤ 当前日的行情（反前瞻），风控护栏在引擎内强制执行。
// 未来可把策略执行这一步替换为真实 zmzai-sandbox 调用，数据契约不变。

import { generateMarket, INSTRUMENT_MAP } from "@/sim/market";
import { STRATEGIES, type StrategyConfig } from "@/sim/strategies";
import { runSimulation, type Tier as SimTier, type RawDecision } from "@/sim/engine";
import { type RiskPillar } from "@/sim/metrics";
import { attributeReturn, type Attribution } from "@/sim/attribution";
import { certifyRobustness, type RobustnessCert } from "@/sim/robustness";
import { computeIntegrityHash } from "@/lib/integrity";
import {
  runStressTest,
  STRESS_SCENARIOS,
  type AgentStress,
  type SimSpec,
  type ScenarioResult,
} from "@/sim/stress";

export type Tier = "Live" | "Forward" | "Backtest" | "Paper";
export type ActionType = "BUY" | "SELL" | "HOLD" | "REJECT";

export interface Position {
  code: string;
  name: string;
  qty: string;
  price: string;
  mv: string;
}

export interface Decision {
  action: ActionType;
  time: string;
  text: string;
  meta: string;
}

export interface Agent {
  id: number;
  emoji: string;
  name: string;
  persona: string; // 人设分类
  creator: string;
  market: string; // A股 / 港股 / 美股 / 加密
  style: string; // 价值 / 动量 / 网格 / 打板 ...
  tier: Tier;
  totalReturn: number; // %
  maxDD: number; // 最大回撤 %
  sharpe: number;
  riskScore: number; // 0-100，越高越稳健
  riskBreakdown: RiskPillar[]; // 统一风险分构成（5 支柱）
  attribution: Attribution; // 收益归因（基准β/行业/选股/择时 + 运气占比）
  robustness: RobustnessCert; // 反过拟合认证（跨随机行情稳定性标签）
  integrityHash: string; // 决策日志存证：SHA-256 内容指纹（Prompt+日志+持仓）
  days: number;
  followers: number;
  slogan: string;
  verified: boolean;
  prompt: string; // 公开策略逻辑
  guard: string; // 风控护栏说明
  positions: Position[];
  log: Decision[];
  stress: Record<string, AgentStress>; // 黑天鹅压力测试：每场景受压结果（key=scenarioId）
  engine?: "sandbox" | "local"; // 回测执行环境：sandbox=zmzai-sandbox 隔离沙箱真实回测；local/缺省=浏览器或服务端本地引擎
  sandboxRunId?: string; // 沙箱回测的运行 ID（可追溯审计）
  cfg?: StrategyConfig; // 完整策略配置：详情页可一键重新验证（每次消耗一次回测配额）
  simDays?: number; // 引擎模拟天数：与展示 days 解耦，重新验证按此周期重跑（保证与档案基准可比）
}

// 全市场行情只生成一次（确定性种子），所有智能体共用同一段可复现行情
const GLOBAL_SEED = 20260825;
const MARKET_DAYS = 360;
export const market = generateMarket(MARKET_DAYS, GLOBAL_SEED);

// 每个智能体的仿真参数（与 META 人设一一对应），供压力测试复用；定义见 META 之后。

interface Meta {
  id: number;
  emoji: string;
  name: string;
  persona: string;
  creator: string;
  market: string;
  style: string;
  tier: Tier;
  days: number;
  followers: number;
  slogan: string;
  verified: boolean;
  prompt: string;
  guard: string;
  simDays: number; // 引擎模拟天数（与展示 days 解耦）
  seed: number;
  model: string; // 决策日志中展示的"模型来源"
}

// 静态人设/策略文案（与原原型一致），simDays/seed/model 为引擎参数
const META: Meta[] = [
  {
    id: 1,
    emoji: "🤖",
    name: "zmzai-GPT",
    persona: "模型派",
    creator: "zmzai 团队",
    market: "A股",
    style: "动量",
    tier: "Live",
    days: 120,
    followers: 342,
    slogan: "追最强趋势，纪律执行，回撤优先",
    verified: true,
    prompt:
      "你是一个纪律严明的动量交易者。每日从沪深300中筛选3只相对强度最高、量价配合最好的标的。\n单只仓位不超过净值的8%，总持仓不超过5只，始终保留≥20%现金。\n任何回撤超过5%的持仓立即减仓。目标夏普>1.5，优先风险调整后收益。",
    guard: "风控规则：单笔 ≤ 10% NAV；强制 ≥20% 现金；回撤 >5% 自动减仓。",
    simDays: 120,
    seed: GLOBAL_SEED + 1 * 1337,
    model: "gpt-4o-mini",
  },
  {
    id: 2,
    emoji: "🧧",
    name: "价投老张",
    persona: "价投派",
    creator: "老李头",
    market: "A股",
    style: "价值",
    tier: "Forward",
    days: 210,
    followers: 188,
    slogan: "只买看得懂的好公司，长期拿着不折腾",
    verified: true,
    prompt:
      "你是价值投资信徒。只在市盈率<20、ROE>15%、现金流为正的白马股中建仓。\n买入后至少持有12个月，不因短期波动卖出。每年再平衡一次，单只≤25%仓位。",
    guard: "风控规则：单只 ≤25% 仓位；禁止追高（PE>30 不买）；年度再平衡。",
    simDays: 210,
    seed: GLOBAL_SEED + 2 * 1337,
    model: "claude-3.5",
  },
  {
    id: 3,
    emoji: "⚔️",
    name: "打板小王",
    persona: "游资派",
    creator: "板王",
    market: "A股",
    style: "打板",
    tier: "Paper",
    days: 45,
    followers: 521,
    slogan: "只做涨停，快进快出，龙头战法",
    verified: false,
    prompt:
      "你是激进短线选手。只参与早盘放量封板的强势龙头，次日不连板即走。\n追求极致收益，容忍高回撤。单票可重仓至30%。",
    guard: "风控规则：单票 ≤30%；次日不连板强制离场。⚠ 高风险策略，风险分仅31。",
    simDays: 60,
    seed: GLOBAL_SEED + 3 * 1337,
    model: "本地模型",
  },
  {
    id: 4,
    emoji: "📊",
    name: "网格老李",
    persona: "网格派",
    creator: "量化哥",
    market: "A股",
    style: "网格",
    tier: "Paper",
    days: 300,
    followers: 96,
    slogan: "高抛低吸，震荡市里的提款机",
    verified: true,
    prompt:
      "你是网格交易机器人。对宽基ETF设定±2%网格区间，自动低买高卖。\n永不空仓也永不重仓，单标的≤40%仓位，震荡市稳定收割。",
    guard: "风控规则：单标的 ≤40%；网格区间±2%硬约束；低波动优先。",
    simDays: 300,
    seed: GLOBAL_SEED + 4 * 1337,
    model: "规则引擎",
  },
  {
    id: 5,
    emoji: "🏛️",
    name: "关羽·价值",
    persona: "历史人物",
    creator: "三国策",
    market: "A股",
    style: "质量",
    tier: "Backtest",
    days: 0,
    followers: 233,
    slogan: "忠义千秋：只守最信得过的好公司",
    verified: true,
    prompt:
      "你化身关羽，忠义千秋。只守最信得过、护城河深的好公司，不为小利所动。\n高ROIC、低负债、长期持有，绝不追涨杀跌。",
    guard: "风控规则：只买护城河标的；负债率>50% 一票否决；长期持有。",
    simDays: 252,
    seed: GLOBAL_SEED + 5 * 1337,
    model: "回测引擎",
  },
  {
    id: 6,
    emoji: "🎭",
    name: "孙悟空·动量",
    persona: "虚构角色",
    creator: "大圣",
    market: "加密",
    style: "动量",
    tier: "Paper",
    days: 60,
    followers: 410,
    slogan: "七十二变，火眼金睛：追强势，识妖股",
    verified: false,
    prompt:
      "你乃齐天大圣，火眼金睛识强势。专追BTC/ETH强势突破，七十二变随时切换。\n容忍大回撤，追求倍数收益，妖股现形即撤。",
    guard: "风控规则：加密高波动，单币≤25%；破位即走。⚠ 风险分仅22，极高风险。",
    simDays: 90,
    seed: GLOBAL_SEED + 6 * 1337,
    model: "本地模型",
  },
  {
    id: 7,
    emoji: "📊",
    name: "ETF定投妹",
    persona: "定投派",
    creator: "小确幸",
    market: "A股",
    style: "定投",
    tier: "Forward",
    days: 260,
    followers: 154,
    slogan: "每周定投宽基，时间陪你慢慢变富",
    verified: true,
    prompt:
      "你是定投教练。每周固定日期买入沪深300+中证红利ETF，雷打不动。\n不择时、不恐慌，靠纪律和复利取胜。单只≤50%。",
    guard: "风控规则：固定周期定投；单只≤50%；禁止择时操作。",
    simDays: 260,
    seed: GLOBAL_SEED + 7 * 1337,
    model: "规则引擎",
  },
  {
    id: 8,
    emoji: "🤖",
    name: "巴菲特AI",
    persona: "模型派",
    creator: "价值基",
    market: "美股",
    style: "价值",
    tier: "Backtest",
    days: 0,
    followers: 289,
    slogan: "长期主义，买生意不买代码",
    verified: true,
    prompt:
      "你继承巴菲特投资哲学。只在具有持久护城河、自由现金流充沛的公司建仓。\n以所有者心态长期持有，忽略季度噪音。",
    guard: "风控规则：护城河+自由现金流双门槛；长期持有不择时。",
    simDays: 252,
    seed: GLOBAL_SEED + 8 * 1337,
    model: "回测引擎",
  },
  {
    id: 9,
    emoji: "🏛️",
    name: "曹操·机会",
    persona: "历史人物",
    creator: "三国策",
    market: "A股",
    style: "机会",
    tier: "Paper",
    days: 80,
    followers: 201,
    slogan: "果断进攻趋势，不念旧仓",
    verified: false,
    prompt:
      "你乃魏武曹操，果断进取。捕捉行业轮动与拐点机会，重拳出击。\n趋势逆转立即清仓，绝不念旧，宁可错不可拖。",
    guard: "风控规则：趋势逆转清仓；单板块≤35%。⚠ 中等风险，回撤偏大。",
    simDays: 90,
    seed: GLOBAL_SEED + 9 * 1337,
    model: "本地模型",
  },
  {
    id: 10,
    emoji: "🧮",
    name: "量化中性",
    persona: "量化派",
    creator: "宽客",
    market: "A股",
    style: "市场中性",
    tier: "Live",
    days: 150,
    followers: 117,
    slogan: "多空对冲，与市场涨跌无关的稳定",
    verified: true,
    prompt:
      "你是市场中性策略。多头一篮子低估值，空头一篮子高估值，对冲Beta。\n目标绝对收益，与大盘涨跌脱钩，严格控制回撤。",
    guard: "风控规则：Beta 中性约束；回撤>-3% 触发减仓；杠杆≤1.5x。",
    simDays: 180,
    seed: GLOBAL_SEED + 10 * 1337,
    model: "规则引擎",
  },
];

function fmtTime(day: number, simDays: number, tier: Tier): string {
  if (tier === "Backtest") {
    const span = Math.floor((day / Math.max(1, simDays - 1)) * 24);
    const year = 2023 + Math.floor(span / 12);
    const month = (span % 12) + 1;
    return `回测 ${year}-${String(month).padStart(2, "0")}`;
  }
  const base = new Date(2026, 7, 25); // 2026-08-25
  const d = new Date(base);
  d.setDate(base.getDate() - (simDays - 1 - day));
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const DD = String(d.getDate()).padStart(2, "0");
  const times = ["09:35", "10:15", "11:10", "13:40", "14:02", "09:32", "10:31"];
  return `${MM}-${DD} ${times[day % times.length]}`;
}

function fmtMeta(r: RawDecision, tier: Tier, model: string): string {
  if (r.source === "风控") return "风控引擎 · 自动拦截";
  if (r.source === "规则") return "规则引擎 · 0 tok";
  if (tier === "Backtest") return "回测引擎";
  const up = 360 + ((r.day * 7) % 220);
  const down = 18 + ((r.day * 3) % 60);
  return `${model} · ${up}↑/${down}↓ tok`;
}

function toDecision(r: RawDecision, m: Meta): Decision {
  const name = r.code ? (INSTRUMENT_MAP[r.code]?.name ?? r.code) : "";
  let text = r.reason;
  if (r.action === "BUY" && r.code) {
    const unit = INSTRUMENT_MAP[r.code]?.market === "加密" ? "枚" : "股";
    text = `买入 ${r.qty} ${unit} ${name}：${r.reason}`;
  }
  return {
    action: r.action,
    time: fmtTime(r.day, m.simDays, m.tier),
    text,
    meta: fmtMeta(r, m.tier, m.model),
  };
}

// 每个智能体的仿真参数（与 META 人设一一对应），供压力测试复用
const SIM_SPECS: SimSpec[] = META.map((m) => ({
  id: m.id,
  tier: m.tier as SimTier,
  simDays: m.simDays,
  seed: m.seed,
}));

// 黑天鹅压力测试：在「同一段基础行情」上叠加 3 类历史极端行情，重跑全部智能体
export const stressResults: ScenarioResult[] = runStressTest(market, SIM_SPECS);

export { STRESS_SCENARIOS };

function stressFor(agentId: number): Record<string, AgentStress> {
  const map: Record<string, AgentStress> = {};
  for (const scn of stressResults) {
    const a = scn.agents.find((x) => x.agentId === agentId);
    if (a) map[scn.scenario.id] = a;
  }
  return map;
}

export const agents: Agent[] = META.map((m) => {
  const cfg = STRATEGIES.find((s) => s.id === m.id)!;
  const res = runSimulation(cfg, market, m.simDays, m.seed, m.tier as SimTier);
  const a: Agent = {
    id: m.id,
    emoji: m.emoji,
    name: m.name,
    persona: m.persona,
    creator: m.creator,
    market: m.market,
    style: m.style,
    tier: m.tier,
    totalReturn: res.metrics.totalReturn,
    maxDD: res.metrics.maxDD,
    sharpe: res.metrics.sharpe,
    riskScore: res.metrics.riskScore,
    riskBreakdown: res.metrics.riskBreakdown,
    attribution: attributeReturn(res, market, cfg, m.simDays, m.tier as SimTier, m.seed),
    robustness: certifyRobustness(market, cfg, m.simDays, m.tier as SimTier, m.seed),
    integrityHash: "",
    days: m.days,
    followers: m.followers,
    slogan: m.slogan,
    verified: m.verified,
    prompt: m.prompt,
    guard: m.guard,
    positions: res.positions,
    log: res.decisions.map((r) => toDecision(r, m)).slice(-12),
    stress: stressFor(m.id),
    engine: "local", // 官方基准：平台本地引擎（与沙箱同一份源码、含撮合成本），非隔离沙箱执行
    cfg, // 官方 Agent 同样可重新验证（结果在沙箱中重跑，与档案基准对照）
    simDays: m.simDays, // 引擎模拟天数（重验证基准周期）
  };
  a.integrityHash = computeIntegrityHash(a);
  return a;
});

export function getAgent(id: number): Agent | undefined {
  return agents.find((a) => a.id === id);
}

export function rankBySharpe(): Agent[] {
  return [...agents].sort((a, b) => b.sharpe - a.sharpe);
}
