// 服务端：zmzai-data 行情客户端（实盘回测的唯一取数入口）。
//
// 设计原则：
//   - 只在服务端调用（含 service-key，绝不下发浏览器）
//   - 一次回测只拉一次行情 → 冻结为快照（loadRealMarket），保证多次运行结果一致
//   - 上游错误原样上抛（DataServiceError 带 status + code），由 API 层映射响应，
//     例如 A股缺 TUSHARE_TOKEN 时 zmzai-data 返回 503，这里不吞掉也不改写
//
// 注意：本模块不能被 esbuild 打进沙箱回测 bundle（沙箱内无网络/无密钥）。
// 实盘回测只在 arena 服务端本地引擎执行，见 lib/sandbox-backtest.ts。

import { getDataEnv } from "@/config/env";
import { traceHeaders } from "@/lib/telemetry";

/** zmzai-data /api/v1/bars 返回的单根日线 */
export interface DataBar {
  date: string; // yyyy-mm-dd
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class DataServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "DataServiceError";
    this.code = code;
    this.status = status;
  }
}

/** 调 zmzai-data 失败（网络/超时/解析）时的兜底错误 */
function unavailable(err: unknown): DataServiceError {
  const msg = err instanceof Error ? err.message : String(err);
  return new DataServiceError("DATA_UNREACHABLE", `行情服务不可达：${msg}`, 503);
}

export type BarRange = "1m" | "3m" | "6m" | "1y";

/**
 * 需要 N 根日线 → 该向 zmzai-data 请求多大的自然日窗口。
 * A股一年约 243 个交易日（372 自然日，比例≈1.53）；加密每天都有 K 线。
 * 混合组合的并集日历按加密口径（≈1 根/自然日），但纯 A股组合按 1.53 折算，
 * 因此统一按更保守的 A股比例选窗口；仍不够时由调用方裁剪 simDays。
 */
export function rangeForDays(days: number): BarRange {
  if (days <= 20) return "1m"; // 31 自然日
  if (days <= 60) return "3m"; // 93
  if (days <= 120) return "6m"; // 186
  return "1y"; // 372（≈243 交易日 / ≈365 加密日）
}

/** 拉取单个标的的日线（升序）。按 days 自动选 range，再截取最近 days 根。 */
export async function fetchBars(code: string, days: number): Promise<DataBar[]> {
  const env = getDataEnv();
  if (!env.DATA_SERVICE_KEY) {
    throw new DataServiceError(
      "DATA_KEY_MISSING",
      "arena 未配置 DATA_SERVICE_KEY，无法调用 zmzai-data 行情服务",
      503,
    );
  }
  const range = rangeForDays(days);
  const url = `${env.DATA_ORIGIN.replace(/\/$/, "")}/api/v1/bars/${encodeURIComponent(code)}?range=${range}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        authorization: `Bearer ${env.DATA_SERVICE_KEY ?? ""}`,
        "x-zmzai-caller": "arena",
        ...traceHeaders(), // arena→zmzai-data 透传链：x-trace-id（入口绑定或新生成）
      },
      cache: "no-store",
      signal: AbortSignal.timeout(env.DATA_TIMEOUT_MS),
    });
  } catch (err) {
    throw unavailable(err);
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let code2 = "DATA_ERROR";
    let message = text.slice(0, 300) || `行情服务 ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { code?: string; error?: string };
      if (parsed.code) code2 = parsed.code;
      if (parsed.error) message = parsed.error;
    } catch {
      // 非 JSON 响应，沿用原始文本
    }
    throw new DataServiceError(code2, message, res.status);
  }

  try {
    const data = JSON.parse(text) as { bars?: DataBar[] };
    const bars = Array.isArray(data.bars) ? data.bars : [];
    return bars.filter((b) => Number.isFinite(b.close)).slice(-days);
  } catch {
    throw new DataServiceError("BAD_UPSTREAM", "行情服务返回无法解析的日线数据", 502);
  }
}
