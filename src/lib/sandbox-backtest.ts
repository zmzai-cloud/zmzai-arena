// 服务端：arena 回测执行器 —— 优先提交 zmzai-sandbox 隔离沙箱真实回测，
// 失败 / 限流 / 未配置时自动降级为服务端本地引擎（与沙箱同一份源码，口径一致）。
//
// 沙箱协议（zmzai-sandbox 内部 Agent API，见其 docs/）：
//   POST /api/internal/agent/runs   提交结构化执行（Bearer 服务密钥 + requestId 幂等）
//   GET  /api/internal/agent/runs/:runId        轮询状态
//   GET  /api/internal/agent/runs/:runId/artifacts/result.json   取回产物
// 回测脚本 = esbuild 打包 scripts/backtest-entry.ts（含 src/sim 全部引擎，单文件 CJS），
// 作为 snapshot 文件 backtest.cjs 提交；沙箱内 node backtest.cjs 读取 config.json 输出 result.json。

import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { assembleBacktestResult, type BacktestInput, type BacktestResult } from "./backtest-assemble";
import type { PriceSeries } from "../sim/market";

const sandboxUrl = () => (process.env.SANDBOX_URL?.trim() || "https://z.zmzai.cloud").replace(/\/$/, "");
const sandboxSecret = () => process.env.SANDBOX_AGENT_SERVICE_SECRET?.trim() ?? "";

// ---------- esbuild 打包（结果缓存，避免每个请求重复打包） ----------

type BundleCache = { text: string } | null;
const globalCache = globalThis as typeof globalThis & { __arenaBacktestBundle?: BundleCache };

function bundleBacktestScript(): string {
  if (globalCache.__arenaBacktestBundle) return globalCache.__arenaBacktestBundle.text;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const esbuild = require("esbuild") as typeof import("esbuild");
  const built = esbuild.buildSync({
    entryPoints: [join(process.cwd(), "scripts/backtest-entry.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    write: false,
  });
  const text = built.outputFiles[0].text;
  globalCache.__arenaBacktestBundle = { text };
  return text;
}

// ---------- 沙箱运行 ----------

interface SandboxRunState {
  status: string;
  exitCode?: number;
  failure?: { code: string; error: string };
}

async function submitRun(userId: string, taskRunId: string, script: string, config: BacktestInput): Promise<string> {
  const requestId = `arena-bt-${randomUUID()}`;
  const body = {
    userId,
    taskRunId,
    requestId,
    snapshot: {
      revisionId: null,
      files: [
        { path: "backtest.cjs", content: script },
        { path: "config.json", content: JSON.stringify(config) },
      ],
    },
    command: { program: "node", args: ["backtest.cjs"], cwd: "." },
    limits: { timeoutMs: 60_000, cpuMillis: 2_000, memoryMiB: 256 },
  };
  const res = await fetch(`${sandboxUrl()}/api/internal/agent/runs`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${sandboxSecret()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sandbox submit ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { run: { id: string } };
  return data.run.id;
}

async function waitForRun(runId: string, timeoutMs: number): Promise<SandboxRunState> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${sandboxUrl()}/api/internal/agent/runs/${runId}`, {
      headers: { authorization: `Bearer ${sandboxSecret()}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`sandbox poll ${res.status}`);
    const data = (await res.json()) as { run: SandboxRunState };
    if (data.run.status === "succeeded" || data.run.status === "failed" || data.run.status === "cancelled") {
      return data.run;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("sandbox 回测超时");
}

async function fetchResultArtifact(runId: string): Promise<BacktestResult> {
  const res = await fetch(`${sandboxUrl()}/api/internal/agent/runs/${runId}/artifacts/result.json`, {
    headers: { authorization: `Bearer ${sandboxSecret()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`sandbox artifact ${res.status}`);
  const raw = await res.text();
  const parsed = JSON.parse(raw) as BacktestResult;
  parsed.engine = "sandbox";
  return parsed;
}

// ---------- 对外入口 ----------

export interface BacktestOutcome {
  engine: "sandbox" | "local";
  result: BacktestResult;
  runId?: string;
  note?: string;
}

export interface RunBacktestOptions {
  /**
   * 实盘行情快照（dataSource=real）。传入时强制本地引擎执行：
   * 快照由 arena 服务端向 zmzai-data 拉取，沙箱内既无网络也无 service-key。
   */
  market?: PriceSeries;
}

/**
 * 执行一次完整回测：优先沙箱，失败自动降级本地。
 * userId 用于沙箱并发配额归属（SSO 用户 id；未登录用 arena-public）。
 */
export async function runBacktest(
  input: BacktestInput,
  userId: string,
  opts: RunBacktestOptions = {},
): Promise<BacktestOutcome> {
  // 实盘行情快照：本地引擎执行（沙箱拿不到快照，也不该让它去调行情服务）
  if (opts.market) {
    return {
      engine: "local",
      result: assembleBacktestResult({ ...input, market: opts.market }),
      note: "实盘回测：zmzai-data 真实行情快照 + arena 本地引擎执行",
    };
  }
  // 未配置服务密钥（本地调试 / 环境未同步）时直接走本地引擎
  if (!sandboxSecret()) {
    return { engine: "local", result: assembleBacktestResult(input), note: "sandbox 未配置" };
  }

  try {
    const script = bundleBacktestScript();
    const taskRunId = `arena-bt-${input.cfg.id}`;
    const runId = await submitRun(userId || "arena-public", taskRunId, script, input);
    const state = await waitForRun(runId, 50_000);
    if (state.status !== "succeeded") {
      throw new Error(state.failure?.error || `sandbox 回测失败（${state.status}）`);
    }
    const result = await fetchResultArtifact(runId);
    return { engine: "sandbox", result, runId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[arena backtest] sandbox 回测失败，降级本地引擎：${msg}`);
    return { engine: "local", result: assembleBacktestResult(input), note: `sandbox 不可用（${msg.slice(0, 120)}）` };
  }
}
