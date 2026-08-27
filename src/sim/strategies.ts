// 各智能体的策略配置（人设 → 交易风格 + 风控护栏参数）。
// 护栏参数来自 agents.ts 中各 agent 的 prompt/guard 文案，这里落成可执行的数值约束。

export type StyleKey =
  | "momentum" // 动量：追相对强度最高
  | "value" // 价值：低估值/回调买入长期持有
  | "breakout" // 打板：早盘放量封板，次日不连板即走
  | "grid" // 网格：±2% 区间高抛低吸
  | "rotation" // 机会：行业轮动，重拳出击
  | "dca" // 定投：固定周期买宽基
  | "neutral"; // 市场中性：多低估值/空高估值对冲

// 大盘熔断护栏：基准指数（沪深300）收盘跌破 20/60 日均线阈值时，总仓位强制降至对应上限
// （新创建策略默认开启；存量 Agent 不含此字段 → 行为/存证不变）
export interface CircuitBreaker {
  enabled: boolean;
  ma20: number; // 收盘低于 20 日线幅度阈值（如 -0.03 = 跌破 3%）
  cap20: number; // 触发后总仓位上限（0.3 = 30%）
  ma60: number; // 收盘低于 60 日线幅度阈值（0 = 收盘跌破 60 日线即触发）
  cap60: number; // 触发后总仓位上限（0.1 = 10%）
}

export const DEFAULT_CIRCUIT_BREAKER: CircuitBreaker = {
  enabled: true,
  ma20: -0.03,
  cap20: 0.3,
  ma60: 0,
  cap60: 0.1,
};

export interface StrategyConfig {
  id: number;
  style: StyleKey;
  universe: string[]; // 可交易标的
  maxSingle: number; // 单笔 ≤ 净值比例（护栏）
  minCash: number; // 强制保留现金比例（护栏）
  maxPositions: number;
  stopDD: number; // 持仓回撤止损（护栏）
  rebalance: number; // 调仓周期（天）
  aggr: number; // 策略攻击性 0-50（计入风险分：越高越激进→风险分越低）
  circuitBreaker?: CircuitBreaker; // 大盘熔断护栏（缺省 = 不启用，存量策略兼容）
}

// 10 个智能体的策略参数（与产品原型里的人设/护栏一一对应）
export const STRATEGIES: StrategyConfig[] = [
  {
    id: 1,
    style: "momentum",
    universe: ["600519", "300750", "000858", "002594", "000725", "002230"],
    maxSingle: 0.08,
    minCash: 0.2,
    maxPositions: 5,
    stopDD: 0.05,
    rebalance: 5,
    aggr: 28,
  },
  {
    id: 2,
    style: "value",
    universe: ["600036", "000333", "600519", "000858", "600900"],
    maxSingle: 0.25,
    minCash: 0.05,
    maxPositions: 4,
    stopDD: 0.12,
    rebalance: 20,
    aggr: 20,
  },
  {
    id: 3,
    style: "breakout",
    universe: ["002230", "300059", "002594", "601012", "300750"],
    maxSingle: 0.3,
    minCash: 0.1,
    maxPositions: 3,
    stopDD: 0.08,
    rebalance: 1,
    aggr: 46,
  },
  {
    id: 4,
    style: "grid",
    universe: ["510300", "510500", "515080"],
    maxSingle: 0.4,
    minCash: 0.1,
    maxPositions: 3,
    stopDD: 0.02,
    rebalance: 1,
    aggr: 4,
  },
  {
    id: 5,
    style: "value",
    universe: ["600900", "600036", "000333", "000858"],
    maxSingle: 0.25,
    minCash: 0.05,
    maxPositions: 3,
    stopDD: 0.1,
    rebalance: 30,
    aggr: 20,
  },
  {
    id: 6,
    style: "momentum",
    universe: ["BTC", "ETH"],
    maxSingle: 0.25,
    minCash: 0.15,
    maxPositions: 2,
    stopDD: 0.12,
    rebalance: 3,
    aggr: 50,
  },
  {
    id: 7,
    style: "dca",
    universe: ["510300", "515080"],
    maxSingle: 0.5,
    minCash: 0.1,
    maxPositions: 2,
    stopDD: 0.05,
    rebalance: 7,
    aggr: 16,
  },
  {
    id: 8,
    style: "value",
    universe: ["AAPL", "KO", "600900"],
    maxSingle: 0.3,
    minCash: 0.05,
    maxPositions: 3,
    stopDD: 0.1,
    rebalance: 30,
    aggr: 20,
  },
  {
    id: 9,
    style: "rotation",
    universe: ["601012", "300750", "002594", "000725", "002230"],
    maxSingle: 0.35,
    minCash: 0.1,
    maxPositions: 2,
    stopDD: 0.08,
    rebalance: 4,
    aggr: 36,
  },
  {
    id: 10,
    style: "neutral",
    universe: ["510300", "510500"],
    maxSingle: 0.6,
    minCash: 0.1,
    maxPositions: 2,
    stopDD: 0.03,
    rebalance: 1,
    aggr: 8,
  },
];
