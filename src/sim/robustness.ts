// 反过拟合认证：判断一个智能体的「榜单收益」是否可复现，还是"恰好撞上某段行情"。
//
// 方法：同一套策略参数（cfg）在 N 条**独立随机行情**下重跑（只换行情路径，不改策略），
// 得到一个收益分布。再把榜单展示的那条收益（基准）放进这个分布里看它的位置：
//   - 跨行情胜率高 + 基准处于分布中部 → 稳健（收益由策略/技能驱动，可复现）
//   - 跨行情胜率低 / 基准处于分布极端尾部 → 过拟合嫌疑（榜单数字很可能是"撞大运"）
//
// 关键：本引擎策略决策完全由行情决定（seed 不参与策略逻辑），所以"换种子重跑同配置"
// 收益不变——必须用多种子**重新生成行情**才能度量对行情路径的敏感度。与 attribution 同理。

import { generateMarket, type PriceSeries } from "./market";
import { runSimulation, type Tier } from "./engine";
import type { StrategyConfig } from "./strategies";

export type RobustnessLabel = "稳健" | "中性" | "过拟合嫌疑";

export interface RobustnessCert {
  runs: number; // 总样本数（基准 + 对照）
  baselineReturn: number; // 榜单展示的收益率 %
  meanReturn: number; // 对照行情均值 %
  stdReturn: number; // 对照行情标准差 %
  minReturn: number; // 对照最小值 %
  maxReturn: number; // 对照最大值 %
  winRate: number; // 0-1，跨对照行情盈利占比
  percentile: number; // 0-100，基准在对照分布中的位置
  stabilityScore: number; // 0-100，稳健度评分（越高越可复现）
  label: RobustnessLabel;
  altReturns: number[]; // 含基准在内的全部样本收益（%），用于分布可视化
  note: string;
}

// 对照行情种子偏移（11 条替代随机行情，与 attribution 同量级但更多样本以稳定分布）
const ROBUST_SEEDS = [13, 71, 137, 211, 307, 419, 521, 613, 919, 1031, 1157];

export function certifyRobustness(
  baseMarket: PriceSeries,
  cfg: StrategyConfig,
  simDays: number,
  tier: Tier,
  baseSeed: number
): RobustnessCert {
  const codes = Object.keys(baseMarket);
  if (codes.length === 0) return emptyCert(0);

  const days = baseMarket[codes[0]].length;

  // 基准（榜单展示的）收益：与 Agent.totalReturn 同源
  const baseline = runSimulation(cfg, baseMarket, simDays, baseSeed, tier).metrics.totalReturn;

  // 多种子重跑同一策略（仅替换随机行情路径）
  const alts: number[] = [];
  for (const off of ROBUST_SEEDS) {
    const altMarket = generateMarket(days, baseSeed + off * 1000 + 7);
    alts.push(runSimulation(cfg, altMarket, simDays, baseSeed, tier).metrics.totalReturn);
  }

  const n = alts.length;
  const mean = avg(alts);
  const std = stddev(alts, mean);
  const min = Math.min(...alts);
  const max = Math.max(...alts);
  const wins = alts.filter((x) => x > 0).length;
  const winRate = wins / n;

  // 基准在对照分布中的位置（分位）
  const below = alts.filter((x) => x <= baseline).length;
  const percentile = Math.round((below / n) * 100);

  // 代表性：基准偏离随机均值的程度（单位 %，带 3% 缓冲，std≈0 也稳定）
  //   dev=0 → 代表性 1；dev >= 1.5σ+3% → 代表性 0
  const dev = Math.abs(baseline - mean);
  const represent = 1 - clamp(dev / (std * 1.5 + 3), 0, 1);
  const tailSigma = std > 1e-6 ? (baseline - mean) / std : 0;

  let label: RobustnessLabel;
  if (winRate >= 0.6 && represent >= 0.6) label = "稳健";
  else if (winRate < 0.4 || represent < 0.15) label = "过拟合嫌疑";
  else label = "中性";

  const stabilityScore = Math.round(100 * (0.6 * winRate + 0.4 * represent));

  return {
    runs: n + 1,
    baselineReturn: round1(baseline),
    meanReturn: round1(mean),
    stdReturn: round1(std),
    minReturn: round1(min),
    maxReturn: round1(max),
    winRate: round2(winRate),
    percentile,
    stabilityScore,
    label,
    altReturns: [round1(baseline), ...alts.map(round1)],
    note: buildNote(label, n, wins, winRate, percentile, tailSigma),
  };
}

function buildNote(
  label: RobustnessLabel,
  n: number,
  wins: number,
  winRate: number,
  percentile: number,
  tailSigma: number
): string {
  const wr = (winRate * 100).toFixed(0);
  if (label === "稳健") {
    return `在 ${n} 条独立随机行情下盈利 ${wins} 次（胜率 ${wr}%），榜单收益处于分布 ${percentile}% 分位，表现稳定、可复现，过拟合风险低。`;
  }
  if (label === "过拟合嫌疑") {
    if (winRate < 0.4) {
      return `在 ${n} 条随机行情下仅盈利 ${wins} 次（胜率 ${wr}%），榜单收益大概率是"恰好撞上的那段行情"，过拟合嫌疑高。`;
    }
    return `榜单收益处于分布 ${percentile}% 分位（高于均值约 ${tailSigma.toFixed(1)}σ），属较极端样本，代表性不足、过拟合嫌疑。`;
  }
  if (percentile <= 25) {
    return `在 ${n} 条随机行情下盈利 ${wins} 次（胜率 ${wr}%），榜单收益处于分布 ${percentile}% 分位（偏低），未夸大策略能力。`;
  }
  if (percentile >= 75) {
    return `在 ${n} 条随机行情下盈利 ${wins} 次（胜率 ${wr}%），榜单收益处于分布 ${percentile}% 分位（偏高），结合较大波动，需谨慎看待。`;
  }
  return `在 ${n} 条随机行情下盈利 ${wins} 次（胜率 ${wr}%），表现中等，榜单收益处于分布 ${percentile}% 分位。`;
}

function emptyCert(total: number): RobustnessCert {
  return {
    runs: 1,
    baselineReturn: round1(total),
    meanReturn: round1(total),
    stdReturn: 0,
    minReturn: round1(total),
    maxReturn: round1(total),
    winRate: 1,
    percentile: 50,
    stabilityScore: 50,
    label: "中性",
    altReturns: [round1(total)],
    note: "行情数据缺失，认证不可用。",
  };
}

function avg(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
function stddev(xs: number[], mean: number): number {
  const v = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(v);
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
