// 用户策略云存储：登录用户的策略上云（SSO user:<id> 绑定），跨设备可读。
// 匿名用户仍走 localStorage（无账号可绑定），登录后由前端同步层自动迁移合并。
//
// 与 billing-store 同模式：ARENA_DATA_DIR 下文件 + 内存缓存 + 原子写（tmp + rename）。
// 单实例 pm2 部署足够；多实例时需换共享存储（Redis/Mongo），届时仅改本文件。

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import type { Agent } from "@/data/agents";
import { computeIntegrityHash } from "@/lib/integrity";

const FILE = "user-agents.json";
const MAX_AGENTS_PER_USER = 100; // 防滥用：每用户策略上限
const MAX_AGENT_BYTES = 256 * 1024; // 单个 Agent 序列化上限（含持仓/日志/压测）

declare global {
  var __arenaUserAgentsDir: string | undefined;
  var __arenaUserAgentsCache: Map<string, Agent[]> | undefined;
}

const GLOBAL = globalThis as typeof globalThis & {
  __arenaUserAgentsDir?: string;
  __arenaUserAgentsCache?: Map<string, Agent[]>;
};

function dataDir(): string {
  if (GLOBAL.__arenaUserAgentsDir) return GLOBAL.__arenaUserAgentsDir;
  const dir =
    process.env.ARENA_DATA_DIR?.trim() ||
    (process.env.NODE_ENV === "production"
      ? join(process.cwd(), "..", "arena-data")
      : join(process.cwd(), ".data"));
  mkdirSync(dir, { recursive: true });
  GLOBAL.__arenaUserAgentsDir = dir;
  return dir;
}

function filePath(): string {
  return join(dataDir(), FILE);
}

function loadAll(): Map<string, Agent[]> {
  if (!GLOBAL.__arenaUserAgentsCache) {
    const map = new Map<string, Agent[]>();
    const p = filePath();
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, Agent[]>;
        for (const [k, v] of Object.entries(raw)) {
          if (k && Array.isArray(v)) map.set(k, v);
        }
      } catch {
        // 损坏时从空账本重建（下一笔写覆盖），不崩溃
      }
    }
    GLOBAL.__arenaUserAgentsCache = map;
  }
  return GLOBAL.__arenaUserAgentsCache;
}

function persist(): void {
  const map = loadAll();
  const tmp = `${filePath()}.tmp`;
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(map), null, 2));
  renameSync(tmp, filePath()); // 原子替换
}

/** 存储层不可用（磁盘只读 / 权限缺失）时抛出，调用方应返回 503。 */
export class UserAgentStoreError extends Error {
  constructor(cause: unknown) {
    super("用户策略存储不可写（存储层不可用）");
    this.name = "UserAgentStoreError";
    this.cause = cause;
  }
}

function persistSafe(): void {
  try {
    persist();
  } catch (e) {
    throw new UserAgentStoreError(e);
  }
}

// ---------- Agent 白名单校验：防伪造 / 防超大对象 / 防篡改 ----------

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

function validPositions(v: unknown): v is Agent["positions"] {
  return (
    Array.isArray(v) &&
    v.every(
      (p) =>
        !!p &&
        typeof p === "object" &&
        isStr((p as Record<string, unknown>).code) &&
        isStr((p as Record<string, unknown>).name) &&
        isStr((p as Record<string, unknown>).qty) &&
        isStr((p as Record<string, unknown>).price) &&
        isStr((p as Record<string, unknown>).mv)
    )
  );
}

function validLog(v: unknown): v is Agent["log"] {
  return (
    Array.isArray(v) &&
    v.every(
      (d) =>
        !!d &&
        typeof d === "object" &&
        isStr((d as Record<string, unknown>).action) &&
        isStr((d as Record<string, unknown>).time) &&
        isStr((d as Record<string, unknown>).text) &&
        isStr((d as Record<string, unknown>).meta)
    )
  );
}

function validRiskBreakdown(v: unknown): v is Agent["riskBreakdown"] {
  return (
    Array.isArray(v) &&
    v.every(
      (p) =>
        !!p &&
        typeof p === "object" &&
        isStr((p as Record<string, unknown>).key) &&
        isStr((p as Record<string, unknown>).label) &&
        isNum((p as Record<string, unknown>).weight) &&
        isNum((p as Record<string, unknown>).risk) &&
        isStr((p as Record<string, unknown>).note)
    )
  );
}

function validAttribution(v: unknown): v is Agent["attribution"] {
  return (
    !!v &&
    typeof v === "object" &&
    isNum((v as Record<string, unknown>).total) &&
    isNum((v as Record<string, unknown>).luckShare) &&
    isStr((v as Record<string, unknown>).note) &&
    Array.isArray((v as Record<string, unknown>).byBucket)
  );
}

function validRobustness(v: unknown): v is Agent["robustness"] {
  return (
    !!v &&
    typeof v === "object" &&
    isNum((v as Record<string, unknown>).runs) &&
    isNum((v as Record<string, unknown>).meanReturn) &&
    isNum((v as Record<string, unknown>).stdReturn) &&
    isNum((v as Record<string, unknown>).stabilityScore) &&
    isStr((v as Record<string, unknown>).label) &&
    Array.isArray((v as Record<string, unknown>).altReturns)
  );
}

function validStress(v: unknown): v is Agent["stress"] {
  return (
    !!v &&
    typeof v === "object" &&
    Object.values(v as Record<string, unknown>).every(
      (s) =>
        !!s &&
        typeof s === "object" &&
        isNum((s as Record<string, unknown>).totalReturn) &&
        isNum((s as Record<string, unknown>).maxDD) &&
        typeof (s as Record<string, unknown>).survived === "boolean"
    )
  );
}

function validCfg(v: unknown): v is Agent["cfg"] {
  return (
    !!v &&
    typeof v === "object" &&
    isStr((v as Record<string, unknown>).style) &&
    Array.isArray((v as Record<string, unknown>).universe) &&
    isNum((v as Record<string, unknown>).maxSingle) &&
    isNum((v as Record<string, unknown>).stopDD)
  );
}

/** 校验并规整客户端上传的 Agent（返回原对象；拒绝伪造 / 篡改 / 超大） */
export function sanitizeAgent(raw: unknown): { ok: true; agent: Agent } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "请求体必须是对象" };
  const a = raw as Record<string, unknown>;

  if (!isNum(a.id) || !Number.isInteger(a.id) || a.id <= 0) return { ok: false, error: "id 不合法" };
  if (!isStr(a.name) || !a.name.trim()) return { ok: false, error: "name 缺失" };
  if (!isStr(a.style)) return { ok: false, error: "style 缺失" };
  if (!isStr(a.prompt) || !a.prompt.trim()) return { ok: false, error: "prompt 缺失" };
  if (!isNum(a.totalReturn) || !isNum(a.maxDD) || !isNum(a.sharpe) || !isNum(a.riskScore)) {
    return { ok: false, error: "业绩指标缺失" };
  }
  if (!isStr(a.integrityHash) || !/^[0-9a-f]{64}$/.test(a.integrityHash)) {
    return { ok: false, error: "integrityHash 不合法（须为 SHA-256 hex）" };
  }
  if (!validPositions(a.positions)) return { ok: false, error: "positions 结构不合法" };
  if (!validLog(a.log)) return { ok: false, error: "log 结构不合法" };
  if (!validRiskBreakdown(a.riskBreakdown)) return { ok: false, error: "riskBreakdown 结构不合法" };
  if (!validAttribution(a.attribution)) return { ok: false, error: "attribution 结构不合法" };
  if (!validRobustness(a.robustness)) return { ok: false, error: "robustness 结构不合法" };
  if (!validStress(a.stress)) return { ok: false, error: "stress 结构不合法" };
  if (!validCfg(a.cfg)) return { ok: false, error: "cfg 结构不合法（策略存档缺失）" };
  if (a.engine !== undefined && a.engine !== "sandbox" && a.engine !== "local") {
    return { ok: false, error: "engine 不合法" };
  }
  if (JSON.stringify(a).length > MAX_AGENT_BYTES) {
    return { ok: false, error: `Agent 数据过大（>${MAX_AGENT_BYTES / 1024}KB）` };
  }

  // 防篡改：服务端重算内容指纹（id+prompt+log+positions），与存档必须一致
  const agent = a as unknown as Agent;
  if (computeIntegrityHash(agent) !== agent.integrityHash) {
    return { ok: false, error: "内容指纹校验失败（数据疑似被篡改）" };
  }
  return { ok: true, agent };
}

// ---------- 存储 API ----------

export function listUserAgents(userId: string): Agent[] {
  return [...(loadAll().get(userId) ?? [])];
}

/** 全部用户已上云策略（共识信号等聚合场景用；仅需字段子集时避免整仓拷贝） */
export function listAllUserAgents(): Agent[] {
  return [...loadAll().values()].flat();
}

/** 保存（按 id 覆盖）。超限抛 UserAgentStoreError；写失败回滚内存。 */
export function saveUserAgentFor(userId: string, agent: Agent): void {
  const map = loadAll();
  const prev = [...(map.get(userId) ?? [])];
  const idx = prev.findIndex((x) => x.id === agent.id);
  const next = idx >= 0 ? prev.map((x, i) => (i === idx ? agent : x)) : [...prev, agent];
  if (next.length > MAX_AGENTS_PER_USER) {
    throw new UserAgentStoreError(new Error(`每用户策略上限 ${MAX_AGENTS_PER_USER} 个`));
  }
  map.set(userId, next);
  try {
    persistSafe();
  } catch (e) {
    map.set(userId, prev); // 回滚内存，避免未落盘的策略被误读
    throw e;
  }
}

/** 删除。返回是否实际删除；写失败回滚内存。 */
export function removeUserAgentFor(userId: string, id: number): boolean {
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
