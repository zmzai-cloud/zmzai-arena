import type { Metadata } from "next";
import { LearnHome } from "@/components/learn/LearnHome";
import { ARTICLES } from "@/data/learn";

export const metadata: Metadata = {
  title: "学堂 — Zmz AI Trader Arena",
  description: "金融知识 + Arena 玩法的结构化学堂:看懂榜单指标、认清策略风格、从围观到下场,零基础友好。",
};

// 学堂(LEARN):金融知识 + 平台讲解,补齐小白转化链路的「看懂」环节
export default function LearnPage() {
  return (
    <section className="mt-8">
      <div className="mx-auto max-w-[760px]">
        <p className="num text-[11px] tracking-[0.15em] text-ink-3">LEARN</p>
        <h1 className="mt-1.5 text-[26px] font-extrabold tracking-tight">学堂:看懂了,再下场</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
          {ARTICLES.length} 篇白话百科,从「净值是什么」讲到「跟单怎么复盘」。每篇几分钟,读完点亮徽章;榜单里遇到不懂的指标,点旁边的「?」直达对应篇章。
        </p>
      </div>
      <div className="mx-auto max-w-[760px]">
        <LearnHome />
      </div>
    </section>
  );
}
