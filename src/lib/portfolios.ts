"use client";

// 模拟跟单（组合）数据层：纯客户端 localStorage + 登录用户云端同步，与关注列表同一模式。
// 跟单组合 = 「我拿 1 万块跟随某 AI 交易员」的虚拟账户：
//   - 只存元信息（跟了谁、本金、时间戳），组合价值/持仓由被跟 Agent 实时推导
//   - 跟单数量限制：Free 1 个组合 / Pro 5 个（订阅付费点，客户端与服务端双校验）
//   - 登录用户组合上云（/api/portfolios，user:<id> 绑定，跨设备），匿名纯本地零请求
// 通过 window 自定义事件实现跨组件（详情 / 我的 / 组合页）实时同步。

import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
// 数量上限来自纯共享文件（服务端也会 import，不能放本 "use client" 文件）
export { FREE_MAX_PORTFOLIOS, PRO_MAX_PORTFOLIOS } from "@/lib/portfolio-plan";

const LS_KEY = "zmzai_arena_portfolios_v1";
const EVENT = "zmzai-portfolios-changed";

export interface FollowPortfolio {
  id: string; // 组合唯一 id（时间戳 + 随机）
  agentId: number; // 被跟 AI
  capital: number; // 本金（元）
  createdAt: string; // ISO
  syncedAt: string; // 最近一次「同步持仓」时间（模拟调仓跟随）
}

export function newPortfolioId(): string {
  return `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadPortfolios(): FollowPortfolio[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? (JSON.parse(raw) as FollowPortfolio[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(list: FollowPortfolio[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

/** 创建跟单组合。超过上限返回 null（调用方引导升级）。登录用户同时上传云端。 */
export function createPortfolio(agentId: number, capital: number, maxAllowed: number): FollowPortfolio | null {
  const list = loadPortfolios();
  if (list.length >= maxAllowed) return null;
  const p: FollowPortfolio = {
    id: newPortfolioId(),
    agentId,
    capital,
    createdAt: new Date().toISOString(),
    syncedAt: new Date().toISOString(),
  };
  persist([...list, p]);
  void uploadIfLoggedIn(p);
  return p;
}

/** 移除组合。返回是否实际移除。登录用户同时删除云端。 */
export function removePortfolio(id: string): boolean {
  const list = loadPortfolios();
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  persist(next);
  void deleteIfLoggedIn(id);
  return true;
}

/** 同步持仓：更新时间戳（模拟拉取被跟 AI 最新调仓）。登录用户同时上传云端。 */
export function touchPortfolio(id: string): void {
  const list = loadPortfolios();
  const next = list.map((p) =>
    p.id === id ? { ...p, syncedAt: new Date().toISOString() } : p,
  );
  persist(next);
  const hit = next.find((p) => p.id === id);
  if (hit) void uploadIfLoggedIn(hit);
}

// 全部组合（响应式）
export function usePortfolios(): FollowPortfolio[] {
  const [list, setList] = useState<FollowPortfolio[]>([]);
  useEffect(() => {
    const sync = () => setList(loadPortfolios());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return list;
}

// ---------- 云端同步（登录用户跨设备；匿名纯本地，零请求） ----------
// 与 userAgents.ts 同模式：/api/me 登录态缓存 + 单客户端串行队列，避免删除/同步竞态。

let cachedUser: { user: SessionUser | null; at: number } | null = null;
const USER_TTL = 5 * 60_000; // 登录态缓存 5 分钟

async function currentUser(): Promise<SessionUser | null> {
  if (cachedUser && Date.now() - cachedUser.at < USER_TTL) return cachedUser.user;
  try {
    const r = await fetch("/api/me", { cache: "no-store" });
    if (!r.ok) {
      cachedUser = { user: null, at: Date.now() };
      return null;
    }
    const d = (await r.json()) as { user: SessionUser | null };
    cachedUser = { user: d.user ?? null, at: Date.now() };
    return cachedUser.user;
  } catch {
    cachedUser = { user: null, at: Date.now() };
    return null;
  }
}

let opChain: Promise<unknown> = Promise.resolve();
function chained<T>(fn: () => Promise<T>): Promise<T> {
  const p = opChain.then(fn, fn);
  opChain = p.catch(() => undefined);
  return p;
}

function notifySynced(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("zmzai:portfolios-synced"));
}

async function uploadIfLoggedIn(p: FollowPortfolio): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  try {
    await fetch("/api/portfolios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p),
    });
  } catch {
    // 失败静默，下次同步会补传
  }
}

async function deleteIfLoggedIn(id: string): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  try {
    await fetch(`/api/portfolios?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // 失败静默，下次同步按云端权威覆盖
  }
}

/**
 * 登录后静默同步：云端 ↔ 本地双向合并（按 id 去重，云端为权威）。
 * 本地独有的组合自动上传（登录前创建的组合迁移上云），云端独有的下载（跨设备恢复）。
 * 匿名 / 网络失败静默返回，不打扰用户。
 */
export function syncPortfolios(): Promise<void> {
  return chained(async () => {
    const user = await currentUser();
    if (!user) return;
    try {
      const r = await fetch("/api/portfolios", { cache: "no-store" });
      if (!r.ok) return;
      const data = (await r.json()) as { portfolios: FollowPortfolio[] };
      const cloud = data.portfolios ?? [];
      const local = loadPortfolios();
      const cloudIds = new Set(cloud.map((p) => p.id));

      // 本地独有 → 上传（登录前创建的组合迁移上云）
      for (const p of local.filter((x) => !cloudIds.has(x.id))) {
        try {
          await fetch("/api/portfolios", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(p),
          });
        } catch {
          // 单条失败不影响整体，下次同步重试
        }
      }

      // 云端独有 → 下载；合并写回本地（云端为权威，按 id 去重）
      const byId = new Map<string, FollowPortfolio>();
      for (const p of cloud) byId.set(p.id, p);
      for (const p of local) if (!byId.has(p.id)) byId.set(p.id, p);
      if (typeof window !== "undefined") {
        localStorage.setItem(LS_KEY, JSON.stringify([...byId.values()]));
        window.dispatchEvent(new Event(EVENT));
      }
      notifySynced();
    } catch {
      // 网络失败静默
    }
  });
}
