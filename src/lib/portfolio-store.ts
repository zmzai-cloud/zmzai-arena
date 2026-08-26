// 跟单组合云存储：登录用户的组合上云（SSO user:<id> 绑定），跨设备可读。
// 与 user-agent-store 同模式：ARENA_DATA_DIR 下文件 + 内存缓存 + 原子写（tmp + rename）。
// 匿名用户仍走 localStorage（无账号可绑定），登录后由前端同步层自动迁移合并。

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import { accountKey, getAccount } from "@/lib/billing-store";
import { FREE_MAX_PORTFOLIOS, PRO_MAX_PORTFOLIOS } from "@/lib/portfolio-plan";
import type { FollowPortfolio } from "@/lib/portfolios";

const FILE = "portfolios.json";
const MAX_PORTFOLIOS_PER_USER = 20; // 防滥用硬上限（业务上限见 plan：Free 1 / Pro 5）

declare global {
  var __arenaPortfoliosDir: string | undefined;
  var __arenaPortfoliosCache: Map<string, FollowPortfolio[]> | undefined;
}

const GLOBAL = globalThis as typeof globalThis & {
  __arenaPortfoliosDir?: string;
  __arenaPortfoliosCache?: Map<string, FollowPortfolio[]>;
};

function dataDir(): string {
  if (GLOBAL.__arenaPortfoliosDir) return GLOBAL.__arenaPortfoliosDir;
  const dir =
    process.env.ARENA_DATA_DIR?.trim() ||
    (process.env.NODE_ENV === "production"
      ? join(process.cwd(), "..", "arena-data")
      : join(process.cwd(), ".data"));
  mkdirSync(dir, { recursive: true });
  GLOBAL.__arenaPortfoliosDir = dir;
  return dir;
}

function filePath(): string {
  return join(dataDir(), FILE);
}

function loadAll(): Map<string, FollowPortfolio[]> {
  if (!GLOBAL.__arenaPortfoliosCache) {
    const map = new Map<string, FollowPortfolio[]>();
    const p = filePath();
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, FollowPortfolio[]>;
        for (const [k, v] of Object.entries(raw)) {
          if (k && Array.isArray(v)) map.set(k, v);
        }
      } catch {
        // 损坏时从空账本重建（下一笔写覆盖），不崩溃
      }
    }
    GLOBAL.__arenaPortfoliosCache = map;
  }
  return GLOBAL.__arenaPortfoliosCache;
}

function persistSafe(): void {
  const p = filePath();
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(loadAll()), null, 0)); // Map → 对象再序列化
  renameSync(tmp, p); // 原子替换：崩溃也不会留半截文件
}

export function listPortfolios(userId: string): FollowPortfolio[] {
  return [...(loadAll().get(userId) ?? [])];
}

/** 当前 plan 允许的最大组合数（业务上限；pro 无限放宽到硬上限） */
export function planPortfolioLimit(userId: string): number {
  const acc = getAccount(accountKey({ id: userId }, ""));
  return acc.plan === "pro" ? PRO_MAX_PORTFOLIOS : FREE_MAX_PORTFOLIOS;
}

/** 保存（按 id 覆盖）。超过 plan 上限抛 PortfolioStoreError；写失败回滚内存。 */
export function savePortfolioFor(userId: string, p: FollowPortfolio): void {
  const map = loadAll();
  const prev = [...(map.get(userId) ?? [])];
  const idx = prev.findIndex((x) => x.id === p.id);
  const next = idx >= 0 ? prev.map((x, i) => (i === idx ? p : x)) : [...prev, p];
  const limit = planPortfolioLimit(userId);
  if (next.length > Math.min(limit, MAX_PORTFOLIOS_PER_USER)) {
    throw new PortfolioStoreError(
      new Error(limit === FREE_MAX_PORTFOLIOS ? "免费最多跟 1 个 AI，升级 Pro 可同时跟 5 个" : "跟单组合已达上限"),
      409,
    );
  }
  map.set(userId, next);
  try {
    persistSafe();
  } catch (e) {
    map.set(userId, prev); // 回滚内存，避免未落盘的组合被误读
    throw e;
  }
}

/** 删除。返回是否实际删除；写失败回滚内存。 */
export function removePortfolioFor(userId: string, id: string): boolean {
  const map = loadAll();
  const prev = map.get(userId);
  if (!prev) return false;
  const next = prev.filter((x) => x.id !== id);
  if (next.length === prev.length) return false;
  map.set(userId, next);
  try {
    persistSafe();
  } catch (e) {
    map.set(userId, prev);
    throw e;
  }
  return true;
}

export class PortfolioStoreError extends Error {
  cause: unknown;
  status: number;
  constructor(cause: unknown, status = 503) {
    super(cause instanceof Error ? cause.message : "跟单存储错误");
    this.name = "PortfolioStoreError";
    this.status = status;
    this.cause = cause;
  }
}
