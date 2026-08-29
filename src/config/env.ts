// arena 服务端环境变量（zod 白名单）。
//
// 只收敛「本次新增的行情服务配置」——其余环境变量（SANDBOX_* / XORPAY_* / AUTH_* 等）
// 仍按原样在各调用点读 process.env，不在此声明，避免一次性改动面过大。
// 未声明的变量会被 zod 忽略，写错名字不会悄悄生效。

import { z } from "zod";

function optionalEnvString() {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional(),
  );
}

const envSchema = z.object({
  /** zmzai-data 行情服务地址（实盘回测数据源）。本地联调默认 3004。 */
  DATA_ORIGIN: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().url().default("http://127.0.0.1:3004"),
  ),
  /** 调 zmzai-data 的 service-key（与 zmzai-data 的 DATA_SERVICE_KEY_CURRENT 一致） */
  DATA_SERVICE_KEY: optionalEnvString(),
  /** 单次取数超时（ms） */
  DATA_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
});

export type DataEnv = z.infer<typeof envSchema>;

let cached: DataEnv | undefined;

/** 读取行情服务配置（进程内缓存；缺省值保证未配置时 sim 模式行为完全不变） */
export function getDataEnv(): DataEnv {
  cached ??= envSchema.parse(process.env);
  return cached;
}

/** 是否具备实盘回测条件（服务地址 + 服务密钥） */
export function realDataConfigured(): boolean {
  const env = getDataEnv();
  return Boolean(env.DATA_ORIGIN && env.DATA_SERVICE_KEY);
}
