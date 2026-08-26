// 由净值曲线计算竞技场指标：总收益 / 最大回撤 / 夏普 / 年化波动 / 统一风险分。
//
// 统一风险分（riskScore, 0-100, 越高越稳健）由 5 个风险支柱加权得到：
//   波动风险 0.30  = 年化波动 + 下行波动（Sortino 思路，只看亏损端）
//   回撤风险 0.25  = 最大回撤幅度
//   集中度风险 0.20 = 单笔上限 maxSingle（护栏越松 = 越集中）
//   杠杆/流动性 0.15 = 保留现金 minCash 的倒数（缓冲越薄 = 越激进）
//   策略攻击性 0.10 = 人设攻击性 aggr（0-50）
// 每根支柱先把原始指标归一化到 0-1（0=低风险, 1=高风险），再按权重合成：
//   riskScore = 100 * (1 - Σ weight·pillarRisk)，夹断到 [1,99]。
// 归一化锚点来自「100 万本金、约 250 交易日」的仿真经验区间，超出则夹断。
// 这样风险分既来自净值真实表现（波动/回撤），也来自策略自设的护栏（集中度/杠杆/攻击性），
// 不同风格之间更可比——例如低波动但 1.5x 杠杆+重仓的中性策略不再被误判为「最安全」。

export interface Metrics {
  totalReturn: number; // %
  maxDD: number; // 最大回撤 %
  sharpe: number;
  annualVol: number;
  riskScore: number; // 0-100，越高越稳健
  riskBreakdown: RiskPillar[];
}

export interface RiskPillar {
  key: string;
  label: string;
  risk: number; // 0-1，越高越危险
  weight: number; // 权重，合计 1
  note: string; // 解释，如 "年化波动 18%"
}

export interface RiskFactors {
  aggr: number; // 0-50 策略攻击性
  maxSingle: number; // 单笔 ≤ 净值比例（护栏）
  minCash: number; // 强制保留现金比例（护栏）
}

// 归一化锚点（经验区间）
const VOL_LO = 0.08, VOL_HI = 0.45; // 年化波动（小数）
const DOWNVOL_LO = 0.06, DOWNVOL_HI = 0.3; // 年化下行波动（小数）
const DD_ANCHOR = 40; // 最大回撤 %，到 -40% 记满分
const CONC_LO = 0.05, CONC_HI = 0.6; // 单笔上限
const CASH_HI = 0.2, CASH_LO = 0.05; // 保留现金

export function computeMetrics(
  nav: number[],
  factors: RiskFactors = { aggr: 20, maxSingle: 0.1, minCash: 0.1 }
): Metrics {
  if (nav.length < 2) {
    return { totalReturn: 0, maxDD: 0, sharpe: 0, annualVol: 0, riskScore: 50, riskBreakdown: [] };
  }
  const totalReturn = (nav[nav.length - 1] / nav[0] - 1) * 100;

  let peak = nav[0];
  let maxDD = 0;
  for (const v of nav) {
    if (v > peak) peak = v;
    const dd = (v / peak - 1) * 100;
    if (dd < maxDD) maxDD = dd;
  }

  const rets: number[] = [];
  for (let i = 1; i < nav.length; i++) rets.push(nav[i] / nav[i - 1] - 1);
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
  const sd = Math.sqrt(variance) || 1e-9;
  const sharpe = (mean / sd) * Math.sqrt(252);
  const annualVol = sd * Math.sqrt(252);

  // 下行波动（Sortino 分母）：只看负收益的离散度
  let downSq = 0,
    downN = 0;
  for (const r of rets) {
    if (r < 0) {
      downSq += r * r;
      downN++;
    }
  }
  const downDevDaily = downN > 0 ? Math.sqrt(downSq / downN) : 0;
  const downDevAnnual = downDevDaily * Math.sqrt(252);

  // ---- 5 支柱归一化 ----
  const volRisk = clamp((annualVol - VOL_LO) / (VOL_HI - VOL_LO), 0, 1);
  const downRisk = clamp((downDevAnnual - DOWNVOL_LO) / (DOWNVOL_HI - DOWNVOL_LO), 0, 1);
  const volPillar = 0.5 * volRisk + 0.5 * downRisk;

  const ddRisk = clamp(Math.abs(maxDD) / DD_ANCHOR, 0, 1);
  const concRisk = clamp((factors.maxSingle - CONC_LO) / (CONC_HI - CONC_LO), 0, 1);
  const levRisk = clamp((CASH_HI - factors.minCash) / (CASH_HI - CASH_LO), 0, 1);
  const aggrRisk = clamp(factors.aggr / 50, 0, 1);

  const pillars: RiskPillar[] = [
    {
      key: "vol",
      label: "波动风险",
      risk: round2(volPillar),
      weight: 0.3,
      note: `年化波动 ${pct(annualVol)} · 下行波动 ${pct(downDevAnnual)}`,
    },
    { key: "dd", label: "回撤风险", risk: round2(ddRisk), weight: 0.25, note: `最大回撤 ${maxDD.toFixed(1)}%` },
    { key: "conc", label: "集中度风险", risk: round2(concRisk), weight: 0.2, note: `单笔上限 ${pct(factors.maxSingle)}` },
    { key: "lev", label: "杠杆/流动性", risk: round2(levRisk), weight: 0.15, note: `保留现金 ${pct(factors.minCash)}` },
    { key: "aggr", label: "策略攻击性", risk: round2(aggrRisk), weight: 0.1, note: `攻击性 ${Math.round(factors.aggr)}/50` },
  ];

  const weighted = pillars.reduce((s, p) => s + p.weight * p.risk, 0);
  const riskScore = clamp(Math.round(100 * (1 - weighted)), 1, 99);

  return {
    totalReturn: r1(totalReturn),
    maxDD: r1(maxDD),
    sharpe: r2(sharpe),
    annualVol: r2(annualVol),
    riskScore,
    riskBreakdown: pillars,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function pct(n: number): string {
  return (n * 100).toFixed(0) + "%";
}
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
