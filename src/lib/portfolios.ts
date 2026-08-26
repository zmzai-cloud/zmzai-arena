"use client";

// 模拟跟单（组合）数据层：纯客户端 localStorage，与关注列表同一模式。
// 跟单组合 = 「我拿 1 万块跟随某 AI 交易员」的虚拟账户：
//   - 只存元信息（跟了谁、本金、时间戳），组合价值/持仓由被跟 Agent 实时推导
//   - 跟单数量限制：Free 1 个组合 / Pro 5 个（订阅付费点，Pro 状态由 billing 判断）
// 通过 window 自定义事件实现跨组件（详情 / 我的 / 组合页）实时同步。

import { useEffect, useState } from "react";

const LS_KEY = "zmzai_arena_portfolios_v1";
const EVENT = "zmzai-portfolios-changed";

export const FREE_MAX_PORTFOLIOS = 1;
export const PRO_MAX_PORTFOLIOS = 5;

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

/** 创建跟单组合。超过上限返回 null（调用方引导升级）。 */
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
  return p;
}

/** 移除组合。返回是否实际移除。 */
export function removePortfolio(id: string): boolean {
  const list = loadPortfolios();
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  persist(next);
  return true;
}

/** 同步持仓：更新时间戳（模拟拉取被跟 AI 最新调仓）。 */
export function touchPortfolio(id: string): void {
  const list = loadPortfolios();
  const next = list.map((p) =>
    p.id === id ? { ...p, syncedAt: new Date().toISOString() } : p,
  );
  persist(next);
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
