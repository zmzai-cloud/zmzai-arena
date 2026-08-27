"use client";

// 学堂学习进度:localStorage,未登录可用。Commit 3 的徽章/进度环共用。
import { ARTICLES } from "@/data/learn";

const KEY = "arena-learn-progress";

export function getReadSlugs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function markRead(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    const cur = new Set(getReadSlugs());
    cur.add(slug);
    window.localStorage.setItem(KEY, JSON.stringify([...cur]));
    window.dispatchEvent(new CustomEvent("arena-learn-progress"));
  } catch {
    // 隐私模式等场景静默失败
  }
}

export const BADGES = [
  { key: "novice", label: "入门", need: "读完第 1 章(认识 Arena)" },
  { key: "steady", label: "进阶", need: "读完第 1-3 章(含全部指标与风格)" },
  { key: "master", label: "毕业", need: "读完全部 20 篇" },
] as const;

export type Badge = (typeof BADGES)[number]["key"];

export function earnedBadges(read: Set<string>): Badge[] {
  const ch = (n: number) => ARTICLES.filter((a) => a.chapter === n).every((a) => read.has(a.slug));
  const out: Badge[] = [];
  if (ch(1)) out.push("novice");
  if (ch(1) && ch(2) && ch(3)) out.push("steady");
  if (out.includes("steady") && ch(4) && ch(5)) out.push("master");
  return out;
}
