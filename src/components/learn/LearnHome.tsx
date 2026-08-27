"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ARTICLES, CHAPTERS, GLOSSARY } from "@/data/learn";
import { BADGES, earnedBadges, getReadSlugs } from "@/lib/learn-progress";

// 学堂首页:进度环 + 徽章墙 + 五章课程目录 + 术语表(全部与 glossary 单源)
export function LearnHome() {
  const [read, setRead] = useState<Set<string>>(new Set());
  const [openGlossary, setOpenGlossary] = useState(false);

  useEffect(() => {
    const sync = () => setRead(new Set(getReadSlugs()));
    sync();
    window.addEventListener("arena-learn-progress", sync);
    return () => window.removeEventListener("arena-learn-progress", sync);
  }, []);

  const total = ARTICLES.length;
  const done = ARTICLES.filter((a) => read.has(a.slug)).length;
  const pct = Math.round((done / total) * 100);
  const badges = earnedBadges(read);

  return (
    <div className="mt-6">
      {/* 学习进度 */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-bold text-ink">我的学习进度</span>
          <span className="num text-[13px] text-ink-2">
            {done} / {total} 篇 · {pct}%
          </span>
        </div>
        <div className="riskbar mt-2.5">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {BADGES.map((b) => {
            const earned = badges.includes(b.key);
            return (
              <span
                key={b.key}
                title={b.need}
                className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${
                  earned ? "border-accent bg-accent/10 text-ink" : "border-line text-ink-3"
                }`}
              >
                {b.label}徽章{earned ? " · 已点亮" : ""}
              </span>
            );
          })}
        </div>
      </div>

      {/* 章节目录 */}
      <div className="mt-4 space-y-4">
        {CHAPTERS.map((c) => {
          const arts = ARTICLES.filter((a) => a.chapter === c.n);
          const chDone = arts.filter((a) => read.has(a.slug)).length;
          return (
            <div key={c.n} className="rounded-xl border border-line bg-surface">
              <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
                <div>
                  <span className="num mr-2 text-[12px] font-bold text-accent">0{c.n}</span>
                  <span className="text-[14.5px] font-bold text-ink">{c.title}</span>
                  <span className="ml-2 hidden text-[12.5px] text-ink-3 sm:inline">{c.desc}</span>
                </div>
                <span className="num text-[12px] text-ink-3">
                  {chDone}/{arts.length}
                </span>
              </div>
              <div className="divide-y divide-line/60">
                {arts.map((a) => {
                  const isRead = read.has(a.slug);
                  return (
                    <Link key={a.slug} href={`/learn/${a.slug}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/60">
                      <span
                        className={`inline-block h-2 w-2 flex-none rounded-full ${isRead ? "bg-accent" : "bg-line"}`}
                        aria-label={isRead ? "已读" : "未读"}
                      />
                      <span className="flex-1 text-[13.5px] text-ink">{a.title}</span>
                      <span className="flex-none text-[12px] text-ink-3">{a.subtitle.slice(0, 28)}…</span>
                      <span className="num flex-none text-[11.5px] text-ink-3">{a.minutes}min</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 术语表 */}
      <div className="mt-4 rounded-xl border border-line bg-surface">
        <button
          onClick={() => setOpenGlossary((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-[14px] font-bold text-ink">术语表({GLOSSARY.length} 条 · 全站指标旁的「?」都指向这里)</span>
          <span className="text-[12px] text-ink-3">{openGlossary ? "收起" : "展开"}</span>
        </button>
        {openGlossary && (
          <div className="grid gap-x-6 gap-y-2.5 border-t border-line px-4 py-3 sm:grid-cols-2">
            {GLOSSARY.map((g) => (
              <div key={g.key} className="text-[12.5px] leading-relaxed">
                {g.article ? (
                  <Link href={`/learn/${g.article}`} className="font-bold text-ink hover:text-accent">
                    {g.term}
                  </Link>
                ) : (
                  <span className="font-bold text-ink">{g.term}</span>
                )}
                <span className="ml-1.5 text-ink-2">{g.short}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-3">
        学堂内容仅用于学习交流,不构成任何证券投资建议;平台为教育性质的模拟竞技环境,市场有风险,真实投资需谨慎。
      </p>
    </div>
  );
}
