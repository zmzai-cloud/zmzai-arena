// 沙箱回测入口：在 zmzai-sandbox 隔离环境中执行的确定性回测任务。
//
// 运行方式：本文件由 arena 服务端用 esbuild 打包成单文件 CJS（backtest.cjs），
// 连同 config.json 作为 snapshot 提交给 sandbox 的内部 Agent API，
// 沙箱内执行 `node backtest.cjs`，输出 result.json 作为 deliverable 取回。
//
// 输入 config.json（沙箱工作目录）：
//   { cfg: StrategyConfig, simDays: number, seed: number, tier: Tier }
// 输出 result.json：
//   { nav, positions, decisions, metrics, attribution, robustness, stress, engine: "sandbox" }
//
// 回测链路复用 src/lib/backtest-assemble.ts（与 arena 服务端降级路径同源），
// 保证沙箱回测与本地回测在相同输入下结果一致、数据契约一致。

import { readFileSync, writeFileSync } from "node:fs";

import { assembleBacktestResult, type BacktestInput } from "../src/lib/backtest-assemble";

function loadConfig(): BacktestInput {
  const raw = readFileSync("config.json", "utf8");
  const cfg = JSON.parse(raw) as BacktestInput;
  if (!cfg?.cfg?.style || !Array.isArray(cfg.cfg.universe)) {
    throw new Error("config.json 缺少合法策略配置");
  }
  return cfg;
}

function main() {
  const result = assembleBacktestResult(loadConfig());
  // 沙箱执行路径：结果标记 engine=sandbox（组装函数默认 local）
  const sandboxResult = { ...result, engine: "sandbox" as const };
  writeFileSync("result.json", JSON.stringify(sandboxResult), "utf8");
  // stdout 留一行摘要便于沙箱事件流诊断
  console.log(`backtest done: ret=${result.metrics.totalReturn.toFixed(2)}% risk=${result.metrics.riskScore} decisions=${result.decisions.length}`);
}

main();
