"use client";

// 关注（订阅）数据层：纯客户端 localStorage，与「我创建的 Agent」同一思路。
// 没有按用户分桶（arena 无用户库），关注列表为浏览器本地单例，符合原型定位。
// 通过 window 自定义事件实现跨组件（排行榜 / 详情 / 我的）实时同步。

import { useEffect, useState } from "react";

const LS_KEY = "zmzai_arena_follows_v1";
const EVENT = "zmzai-follows-changed";

export function loadFollows(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

export function isFollowed(id: number): boolean {
  return loadFollows().includes(id);
}

export function toggleFollow(id: number): boolean {
  const list = loadFollows();
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...new Set([...list, id])];
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  }
  return next.includes(id);
}

// 单个 Agent 的关注态（响应式）
export function useIsFollowed(id: number): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const sync = () => setV(isFollowed(id));
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [id]);
  return v;
}

// 全部关注（响应式）
export function useFollows(): number[] {
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    const sync = () => setIds(loadFollows());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return ids;
}
