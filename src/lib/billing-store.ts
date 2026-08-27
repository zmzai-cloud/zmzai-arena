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
  planSource: "paddle" | "afdian" | "xorpay" | "grant" | null; // paddle/afdian 为历史数据兼容
  expiresAt: string | null; // Pro 到期时间（ISO），到期自动降级 free；null = 永久
  quota: { windowEnd: string; used: number }; // 滚动 30 天窗口（到 windowEnd 过期重置）
  createdAt: string;
}

export interface PendingOrder {
  key: string; // user:<userId>，回调时直接关联，无需留言对账
  period: "monthly" | "yearly";
  amount: number; // 元
  method: "native" | "alipay";
  createdAt: string;
  expiresAt: string; // XorPay 订单 30 分钟有效
}

const FILE = "accounts.json";
const ORDERS_FILE = "orders.json";
const PENDING_FILE = "pending.json"; // 待支付订单（upgrade 创建，webhook 落账后移除）
const GLOBAL = globalThis as typeof globalThis & {
  __arenaBillingDir?: string;
  __arenaBillingCache?: Map<string, Account>;
  __arenaOrdersCache?: Map<string, { key: string; period: string; ts: string }>;
  __arenaPendingCache?: Map<string, PendingOrder>;
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

function loadOrders(): Map<string, { key: string; period: string; ts: string }> {
  if (!GLOBAL.__arenaOrdersCache) {
    const map = new Map<string, { key: string; period: string; ts: string }>();
    const p = join(dataDir(), ORDERS_FILE);
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf8")) as Record<
          string,
          { key: string; period: string; ts: string }
        >;
        for (const [k, v] of Object.entries(raw)) {
          if (v && typeof v.key === "string" && typeof v.period === "string") map.set(k, v);
        }
      } catch {
        // 损坏时重建（下一笔写覆盖），不崩溃
      }
    }
    GLOBAL.__arenaOrdersCache = map;
  }
  return GLOBAL.__arenaOrdersCache;
}

function loadPending(): Map<string, PendingOrder> {
  if (!GLOBAL.__arenaPendingCache) {
    const map = new Map<string, PendingOrder>();
    const p = join(dataDir(), PENDING_FILE);
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, PendingOrder>;
        for (const [k, v] of Object.entries(raw)) {
          if (v && typeof v.key === "string" && typeof v.expiresAt === "string") map.set(k, v);
        }
      } catch {
        // 损坏时重建（下一笔写覆盖），不崩溃
      }
    }
    GLOBAL.__arenaPendingCache = map;
  }
  return GLOBAL.__arenaPendingCache;
}

function persistPending(): void {
  const map = loadPending();
  const tmp = `${join(dataDir(), PENDING_FILE)}.tmp`;
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(map), null, 0));
  renameSync(tmp, join(dataDir(), PENDING_FILE)); // 原子替换
}

/** 记录待支付订单（upgrade 创建订单成功后调用）。存储不可写时抛 BillingStoreError（返回 503，不展示不可支付）。 */
export function createPendingOrder(orderId: string, order: PendingOrder): void {
  if (!orderId) return;
  const map = loadPending();
  map.set(orderId, order);
  while (map.size > 500) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
  try {
    persistPending();
  } catch (e) {
    map.delete(orderId);
    throw new BillingStoreError(e);
  }
}

/** 查找未过期的待支付订单（webhook 落账校验用）。过期即删，返回 null。 */
export function findPendingOrder(orderId: string): PendingOrder | null {
  if (!orderId) return null;
  const map = loadPending();
  const order = map.get(orderId);
  if (!order) return null;
  if (new Date(order.expiresAt).getTime() <= Date.now()) {
    map.delete(orderId);
    try {
      persistPending();
    } catch {
      // 清理失败不致命：过期订单即使残留也会被下次读取判过期
    }
    return null;
  }
  return order;
}

/** 落账成功后移除待支付订单（幂等：不存在不报错）。 */
export function removePendingOrder(orderId: string): void {
  const map = loadPending();
  if (!map.delete(orderId)) return;
  try {
    persistPending();
  } catch {
    // 删除失败不致命：残留订单不影响幂等（orders.json 已去重）
  }
}

function persistOrders(): void {
  const map = loadOrders();
  const tmp = `${join(dataDir(), ORDERS_FILE)}.tmp`;
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(map), null, 0));
  renameSync(tmp, join(dataDir(), ORDERS_FILE)); // 原子替换
}

/**
 * 标记支付回调已处理（幂等）：同商户订单号重复回调（网关重试）返回 false，不重复落账。
 * 保留最近 500 条，防止无限增长。存储不可写时抛 BillingStoreError（回调方应返回 503 让网关重试）。
 */
export function markOrderProcessed(orderId: string, key: string, period: string): boolean {
  if (!orderId) return true; // 无订单号不拦截（防御：交给落账层处理）
  const orders = loadOrders();
  if (orders.has(orderId)) return false;
  orders.set(orderId, { key, period, ts: new Date().toISOString() });
  while (orders.size > 500) {
    const first = orders.keys().next().value;
    if (first === undefined) break;
    orders.delete(first);
  }
  try {
    persistOrders();
  } catch (e) {
    orders.delete(orderId); // 回滚内存，避免未落盘的订单被误判为已处理
    throw new BillingStoreError(e);
  }
  return true;
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

/** 查询订单是否已处理（幂等确认用：pending 已移除但订单已落账的重复回调应返回 200，而非拒绝）。 */
export function isOrderProcessed(orderId: string): boolean {
  if (!orderId) return false;
  return loadOrders().has(orderId);
}

/** 设置计划（支付 webhook / 管理员发放共用）。expiresAt 仅 Pro 可设，到期自动降级。 */
export function setPlan(
  userId: string,
  plan: Plan,
  source: "paddle" | "afdian" | "xorpay" | "grant",
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

/** 全量账户列表（运营后台用）。返回 key（user:<id> / anon:<ip>）与账户快照。 */
export function listAccounts(): Array<{ key: string; account: Account }> {
  return [...loadAll().entries()].map(([key, account]) => ({ key, account }));
}

export { PLAN };
