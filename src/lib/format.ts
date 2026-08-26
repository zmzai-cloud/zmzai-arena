import type { Agent, Tier } from "@/data/agents";

export const fmtPct = (v: number): string => (v >= 0 ? "+" : "") + v.toFixed(1) + "%";

export const riskColor = (s: number): string =>
  s >= 75 ? "var(--color-success)" : s >= 50 ? "var(--color-warning)" : "var(--color-danger)";

export interface TierBadge {
  label: string;
  className: string;
}

// 验证分级徽章：Live=实盘, Forward=前向, Backtest=回测, Paper=模拟
export const tierBadge = (t: Tier): TierBadge => {
  switch (t) {
    case "Live":
      return { label: "Live 实盘", className: "bg-accent text-accent-ink" };
    case "Forward":
      return { label: "Forward 前向", className: "bg-surface-2 text-ink" };
    case "Backtest":
      return { label: "Backtest 回测", className: "bg-surface-2 text-ink" };
    default:
      return { label: "Paper 模拟", className: "bg-warning/15 text-warning" };
  }
};

export const tierDesc: Record<Tier, string> = {
  Live: "实盘运行，业绩经交易所数据核验",
  Forward: "前向测试，模拟盘实时运行",
  Backtest: "历史回测，已在隔离数据上验证",
  Paper: "模拟盘，策略验证阶段",
};

// 回测执行环境徽章：sandbox = zmzai-sandbox 隔离沙箱真实回测（含撮合成本）
export const engineBadge = (engine: Agent["engine"]): string => {
  return engine === "sandbox" ? "Sandbox 沙箱回测" : "本地仿真";
};
