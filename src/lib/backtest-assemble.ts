// 回测结果组装：给定策略配置与行情参数，跑完整回测链路并输出统一数据契约。
//
// 本模块同时被两条执行路径使用，保证结果口径一致：
// 1. zmzai-sandbox 沙箱执行（scripts/backtest-entry.ts 打包后提交沙箱运行）
// 2. arena 服务端本地降级（sandbox 不可达 / 限流 / 失败时直接同步执行）
// 纯函数、无外部依赖，可被 esbuild 打包进沙箱单文件。

import { generateMarket, type PriceSeries } from "../sim/market";
import { REAL_INDEXES } from "../data/index-real";
import { runSimulation, type SimResult, type Tier } from "../sim/engine";
import { MARKET_DAYS } from "../sim/index-market";
import { attributeReturn, type Attribution } from "../sim/attribution";
import { certifyRobustness, type RobustnessCert } from "../sim/robustness";
import { stressForConfig, type AgentStress, type SimSpec } from "../sim/stress";
import type { StrategyConfig } from "../sim/strategies";

// 与 src/data/agents.ts 的 GLOBAL_SEED / MARKET_DAYS 保持一致（同一段可复现行情）；
// MARKET_DAYS 唯一常量源在 sim/index-market.ts
export { MARKET_DAYS };
export const GLOBAL_SEED = 20260825;

export interface BacktestInput {
  cfg: StrategyConfig;
  simDays: number;
  seed: number;
  tier: Tier;
  marketDays?: number;
  marketSeed?: number;
  /**
   * 实盘行情快照（dataSource=real，由 loadRealMarket 冻结产出）。
   * 缺省 = 走 generateMarket 生成种子化行情——**行为与引入 real 模式前逐字节一致**。
   */
  market?: PriceSeries;
}

export interface BacktestResult {
  engine: "sandbox" | "local";
  nav: number[];
  positions: SimResult["positions"];
  decisions: SimResult["decisions"];
  metrics: SimResult["metrics"];
  attribution: Attribution;
  robustness: RobustnessCert;
  stress: Record<string, AgentStress>;
}

export function assembleBacktestResult(input: BacktestInput): BacktestResult {
  // real 模式：用外部加载并冻结的真实行情快照；sim 模式：种子化生成（与改动前完全一致）
  const realSnapshot = Boolean(input.market);
  const market = input.market ?? generateMarket(input.marketDays ?? MARKET_DAYS, input.marketSeed ?? GLOBAL_SEED);
  // 第 6 参 indexMarket：注入真实指数行情，大盘状态事件 + 熔断护栏仅在 cfg.circuitBreaker 启用时生效。
  // real 模式不注入——指数窗口与真实行情快照时间轴不同源，强行对齐会产生误导性信号。
  const res = runSimulation(
    input.cfg,
    market,
    input.simDays,
    input.seed,
    input.tier,
    realSnapshot ? undefined : REAL_INDEXES,
  );
  const spec: SimSpec = { id: input.cfg.id, tier: input.tier, simDays: input.simDays, seed: input.seed };
  return {
    engine: "local",
    nav: res.nav,
    positions: res.positions,
    decisions: res.decisions,
    metrics: res.metrics,
    attribution: attributeReturn(res, market, input.cfg, input.simDays, input.tier, input.seed),
    robustness: certifyRobustness(market, input.cfg, input.simDays, input.tier, input.seed),
    stress: stressForConfig(market, input.cfg, spec),
  };
}

/** 供测试/诊断：打印一次回测摘要 */
export function summarizeResult(r: BacktestResult): string {
  return `engine=${r.engine} ret=${r.metrics.totalReturn.toFixed(2)}% dd=${r.metrics.maxDD.toFixed(2)}% risk=${r.metrics.riskScore} decisions=${r.decisions.length}`;
}
