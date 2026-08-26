// 计费数据层：服务端文件持久化（单实例 pm2 部署，原子写安全）。
// 数据目录 = ARENA_DATA_DIR（生产 /opt/zmzai/arena-data，部署目录之外，跨版本保留）。
// 账户键：登录用户 = userId；匿名 = "anon:<ip>"（匿名同样有免费额度，防 IP 绕过后端仍可审计）。
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PLAN, PLANS, QUOTA_WINDOW_DAYS, type Plan } from "./billing";

export interface Account {
  userId: string;
  plan: Plan;
  planSince: string | null; // ISO
  planSource: "paddle" | "grant" | null;
  expiresAt: string | null; // Pro 到期时间（ISO），到期自动降级 free；null = 永久
  quota: { windowEnd: string; used: number }; // 滚动 30 天窗口（到 windowEnd 过期重置）
  createdAt: string;
}

const FILE = "accounts.json";
const GLOBAL = globalThis as typeof globalThis & {
  __arenaBillingDir?: string;
  __arenaBillingCache?: Map<string, Account>;
};

function dataDir(): string {
  if (GLOBAL.__arenaBillingDir) return GLOBAL.__arenaBillingDir;
  const dir =
    process.env.ARENA_DATA_DIR?.trim() ||
    (process.env.NODE_ENV === "production"
      ? join(process.cwd(), "..", "arena-data")
      : join(process.cwd(), ".data"));
  mkdirSync(dir, { recursive: true });
  GLOBAL.__arenaBillingDir = dir;
  return dir;
}

function filePath(): string {
  return join(dataDir(), FILE);
}

function loadAll(): Map<string, Account> {
  if (!GLOBAL.__arenaBillingCache) {
    const map = new Map<string, Account>();
    const p = filePath();
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, Account>;
        for (const [k, v] of Object.entries(raw)) {
          if (v && typeof v.userId === "string") map.set(k, v);
        }
      } catch {
        // 损坏时从空账本重建（下一笔写覆盖），不崩溃
      }
    }
    GLOBAL.__arenaBillingCache = map;
  }
  return GLOBAL.__arenaBillingCache;
}

function persist(): void {
  const map = loadAll();
  const tmp = `${filePath()}.tmp`;
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(map), null, 2));
  renameSync(tmp, filePath()); // 原子替换
}

/** 存储层不可用（磁盘只读 / 权限缺失 / 目录不可建）时抛出，调用方应返回 503。 */
export class BillingStoreError extends Error {
  constructor(cause: unknown) {
    super("计费账本不可写（存储层不可用）");
    this.name = "BillingStoreError";
    this.cause = cause;
  }
}

function persistSafe(): void {
  try {
    persist();
  } catch (e) {
    throw new BillingStoreError(e);
  }
}

function windowEnd(): string {
  return new Date(Date.now() + QUOTA_WINDOW_DAYS * 86_400_000).toISOString();
}

function defaultAccount(userId: string): Account {
  return {
    userId,
    plan: "free",
    planSince: null,
    planSource: null,
    expiresAt: null,
    quota: { windowEnd: windowEnd(), used: 0 },
    createdAt: new Date().toISOString(),
  };
}

export function getAccount(userId: string): Account {
  const map = loadAll();
  let acc = map.get(userId);
  if (!acc) {
    acc = defaultAccount(userId);
    map.set(userId, acc);
    try {
      persistSafe();
    } catch (e) {
      map.delete(userId); // 回滚内存，避免未落盘的账户被误用
      throw e;
    }
  } else if (acc.plan !== "free" && acc.expiresAt && new Date(acc.expiresAt).getTime() <= Date.now()) {
    // Pro 已到期：自动降级 free 并保留额度记录
    acc.plan = "free";
    acc.planSince = null;
    acc.planSource = null;
    acc.expiresAt = null;
    try {
      persistSafe();
    } catch (e) {
      // 降级失败不致命：内存已降级，下次请求重试落盘
      console.error("[billing] 到期降级落盘失败：", e);
    }
  }
  return acc;
}

export function accountKey(user: { id: string } | null, ip: string): string {
  return user ? `user:${user.id}` : `anon:${ip}`;
}

export interface QuotaResult {
  ok: boolean;
  plan: Plan;
  used: number;
  limit: number; // Pro = Infinity
  remaining: number; // Pro = Infinity
  reason?: "QUOTA_EXCEEDED";
}

/** 消费一次配额。窗口过期自动重置。Free 超限返回 ok:false；Pro 恒通过。 */
export function consumeQuota(userId: string): QuotaResult {
  const map = loadAll();
  let acc = map.get(userId);
  if (!acc) {
    acc = defaultAccount(userId);
    map.set(userId, acc);
  }
  const plan = PLANS[acc.plan];
  const now = new Date().toISOString();
  if (now > acc.quota.windowEnd) {
    // 窗口已过期：重置为新的 30 天窗口
    acc.quota = { windowEnd: windowEnd(), used: 0 };
  }
  const limit = plan.monthlyQuota;
  const used = acc.quota.used;
  const remaining = limit === Infinity ? Infinity : Math.max(0, limit - used);

  if (limit !== Infinity && used >= limit) {
    try {
      persistSafe();
    } catch (e) {
      throw e;
    }
    return { ok: false, plan: acc.plan, used, limit, remaining: 0, reason: "QUOTA_EXCEEDED" };
  }
  acc.quota.used += 1;
  try {
    persistSafe();
  } catch (e) {
    acc.quota.used -= 1; // 回滚：写入失败不消耗配额
    throw e;
  }
  return {
    ok: true,
    plan: acc.plan,
    used: acc.quota.used,
    limit,
    remaining: limit === Infinity ? Infinity : Math.max(0, limit - acc.quota.used),
  };
}

/** 查询额度（不消费）。 */
export function peekQuota(userId: string): QuotaResult {
  const acc = getAccount(userId);
  const plan = PLANS[acc.plan];
  const limit = plan.monthlyQuota;
  const used = acc.quota.used;
  return {
    ok: limit === Infinity || used < limit,
    plan: acc.plan,
    used,
    limit,
    remaining: limit === Infinity ? Infinity : Math.max(0, limit - used),
  };
}

/** 设置计划（支付 webhook / 管理员发放共用）。expiresAt 仅 Pro 可设，到期自动降级。 */
export function setPlan(
  userId: string,
  plan: Plan,
  source: "paddle" | "grant",
  expiresAt: string | null = null
): Account {
  const map = loadAll();
  let acc = map.get(userId);
  if (!acc) {
    acc = defaultAccount(userId);
    map.set(userId, acc);
  }
  const prev = { plan: acc.plan, planSince: acc.planSince, planSource: acc.planSource, expiresAt: acc.expiresAt };
  acc.plan = plan;
  acc.planSince = plan === "free" ? null : new Date().toISOString();
  acc.planSource = plan === "free" ? null : source;
  acc.expiresAt = plan === "pro" ? expiresAt : null;
  try {
    persistSafe();
  } catch (e) {
    // 回滚内存变更
    acc.plan = prev.plan;
    acc.planSince = prev.planSince;
    acc.planSource = prev.planSource;
    acc.expiresAt = prev.expiresAt;
    throw e;
  }
  return acc;
}

export { PLAN };
