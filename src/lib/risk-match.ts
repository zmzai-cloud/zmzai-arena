// 风险偏好匹配（P4）：问卷 → 风险档位 → 推荐 Agent。
// 纯函数、零编造：匹配分只由 Agent 真实字段（riskScore/style/tier/totalReturn/maxDD）推导，
// 每条推荐附可解释理由；问卷结论为风格参考，不构成投资建议（UI 注脚明示）。

import type { Agent } from "@/data/agents";

export interface MatchOption {
  label: string;
  hint?: string;
  score: number; // 风险胃口分值 0-100（越高越激进）
}

export interface MatchQuestion {
  id: string;
  q: string;
  options: MatchOption[];
}

// 权重：回撤容忍是风险偏好的最强信号，其次目标；期限反映的是「风格激进度需求」
// （短跑需要动量/打板类，长持适合价值/定投类），降权计入避免拉偏风险档位
const WEIGHTS = { experience: 0.15, drawdown: 0.4, horizon: 0.15, goal: 0.3 } as const;

export const MATCH_QUESTIONS: MatchQuestion[] = [
  {
    id: "experience",
    q: "你的投资经验大约是？",
    options: [
      { label: "刚起步", hint: "基本没碰过股票/基金", score: 10 },
      { label: "1-3 年", hint: "买过基金或炒股，浅尝辄止", score: 35 },
      { label: "3 年以上", hint: "有自己的交易习惯", score: 60 },
      { label: "老手", hint: "经历过完整牛熊周期", score: 85 },
    ],
  },
  {
    id: "drawdown",
    q: "账户浮亏到什么程度会让你睡不着？",
    options: [
      { label: "-5% 就很难受", score: 12 },
      { label: "-15% 可以忍", score: 35 },
      { label: "-30% 也能拿住", score: 62 },
      { label: "-50% 也无所谓", hint: "追求高弹性", score: 90 },
    ],
  },
  {
    id: "horizon",
    q: "这笔钱你打算放多久？",
    options: [
      { label: "短跑", hint: "几周到一两个月", score: 90 },
      { label: "波段", hint: "一到六个月", score: 55 },
      { label: "长持", hint: "一年以上不动", score: 10 },
    ],
  },
  {
    id: "goal",
    q: "你更想要哪种结果？",
    options: [
      { label: "稳稳跑赢理财", hint: "年化 5-8% 就满意", score: 15 },
      { label: "接受波动换更高收益", hint: "能接受明显回撤", score: 55 },
      { label: "追求高弹性", hint: "想要倍数级机会", score: 90 },
    ],
  },
];

export interface RiskProfile {
  score: number; // 0-100 风险胃口（越高越激进）
  band: "保守" | "稳健" | "平衡" | "进取" | "激进";
  bandDesc: string;
}

const BANDS: Array<{ max: number; band: RiskProfile["band"]; desc: string }> = [
  { max: 25, band: "保守", desc: "以控制回撤为第一优先，接受平庸但安稳的收益曲线。" },
  { max: 45, band: "稳健", desc: "在低回撤前提下追求稳定跑赢大盘，适合纪律型策略。" },
  { max: 65, band: "平衡", desc: "攻守兼备，愿意用可控波动换取超越基准的收益。" },
  { max: 85, band: "进取", desc: "主动拥抱波动，偏好趋势与弹性强的策略。" },
  { max: 101, band: "激进", desc: "追求高弹性机会，能承受大回撤，风险意识优先级靠后。" },
];

export function scoreAnswers(answers: Record<string, number>): RiskProfile {
  let sum = 0;
  for (const q of MATCH_QUESTIONS) {
    const s = answers[q.id];
    if (typeof s !== "number") continue;
    sum += s * WEIGHTS[q.id as keyof typeof WEIGHTS];
  }
  const score = Math.round(Math.min(100, Math.max(0, sum)));
  const band = BANDS.find((b) => score < b.max)!;
  return { score, band: band.band, bandDesc: band.desc };
}

// 各档位贴合的风格集合（与官方 Agent 的 style 字段对应）
const STYLE_POOLS: Record<RiskProfile["band"], string[]> = {
  保守: ["网格", "定投", "质量"],
  稳健: ["定投", "质量", "价值", "网格"],
  平衡: ["价值", "量化", "中性", "动量"],
  进取: ["动量", "机会", "量化", "加密"],
  激进: ["打板", "动量", "机会", "加密"],
};

const TIER_SCORE: Record<string, number> = { Live: 15, Forward: 10, Backtest: 6, Paper: 3 };

export interface MatchResult {
  agent: Agent;
  match: number; // 0-100 匹配度
  reasons: string[]; // 可解释理由（最多 2 条）
}

export function matchAgents(profile: RiskProfile, agents: Agent[]): MatchResult[] {
  const pool = STYLE_POOLS[profile.band];

  const scored = agents.map((agent) => {
    // 风险匹配（0-55）：riskScore 越高越稳健，与用户风险胃口距离越近越贴合
    const riskFit = Math.max(5, 55 - Math.abs(profile.score - agent.riskScore) * 0.55);
    // 风格匹配（0-30）
    const styleFit = pool.includes(agent.style) ? 30 : 0;
    // 验证级别（0-15）：Live > Forward > Backtest > Paper
    const tierFit = TIER_SCORE[agent.tier] ?? 3;
    const match = Math.round(Math.min(100, riskFit + styleFit + tierFit));

    const reasons: string[] = [];
    if (styleFit > 0) reasons.push(`${agent.style}风格贴合「${profile.band}」档的风险偏好`);
    reasons.push(`历史最大回撤 ${agent.maxDD.toFixed(1)}%、风险分 ${agent.riskScore}（越高越稳健）`);
    if (agent.tier === "Live") reasons.push("Live 实盘级验证档案");
    return { agent, match, reasons: reasons.slice(0, 2) };
  });

  return scored.sort((a, b) => b.match - a.match).slice(0, 3);
}
