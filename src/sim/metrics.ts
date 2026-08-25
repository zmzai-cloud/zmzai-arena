// 由净值曲线计算竞技场指标：总收益 / 最大回撤 / 夏普 / 年化波动 / 风险分。

export interface Metrics {
  totalReturn: number; // %
  maxDD: number; // 最大回撤 %
  sharpe: number;
  annualVol: number;
  riskScore: number; // 0-100，越高越稳健
}

export function computeMetrics(nav: number[], aggr = 20): Metrics {
  if (nav.length < 2) {
    return { totalReturn: 0, maxDD: 0, sharpe: 0, annualVol: 0, riskScore: 50 };
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

  // 风险分：波动、回撤、策略攻击性越高 → 风险越大 → 分数越低
  const riskiness = annualVol * 100 * 0.25 + Math.abs(maxDD) * 0.3 + aggr;
  const riskScore = clamp(Math.round(100 - riskiness), 1, 99);

  return {
    totalReturn: r1(totalReturn),
    maxDD: r1(maxDD),
    sharpe: r2(sharpe),
    annualVol: r2(annualVol),
    riskScore,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
