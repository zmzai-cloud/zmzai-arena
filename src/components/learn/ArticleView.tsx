"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ARTICLES, articleBySlug, chapterOf, glossaryTerm, neighborsOf } from "@/data/learn";
import { markRead, getReadSlugs } from "@/lib/learn-progress";
import { LearnBlocks } from "./LearnBlocks";

// 学堂篇章视图:进入即计已读(localStorage),术语卡片 + 上下篇导航
export function ArticleView({ slug }: { slug: string }) {
  const article = articleBySlug(slug);
  const [readCount, setReadCount] = useState(0);

  useEffect(() => {
    markRead(slug);
    setReadCount(getReadSlugs().length);
  }, [slug]);

  if (!article) return null;
  const ch = chapterOf(article.chapter);
  const { prev, next } = neighborsOf(slug);

  return (
    <article className="mx-auto max-w-[760px]">
      <div className="mb-1 flex items-center gap-2 text-[12px] text-ink-3">
        <Link href="/learn" className="hover:text-accent">
          学堂
        </Link>
        <span>/</span>
        <span>
          第 {article.chapter} 章 · {ch?.title}
        </span>
      </div>
      <h1 className="text-[24px] font-extrabold leading-snug tracking-tight text-ink">{article.title}</h1>
      <p className="mt-2 text-[14px] text-ink-2">{article.subtitle}</p>
      <div className="mt-2 text-[12px] text-ink-3">
        约 {article.minutes} 分钟 · 全站第 {readCount} / {ARTICLES.length} 篇已读
      </div>

      <div className="mt-6">
        <LearnBlocks body={article.body} />
      </div>

      {/* 相关术语:与 glossary 单源 */}
      {article.terms.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-3">本篇术语</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {article.terms.map((k) => {
              const g = glossaryTerm(k);
              if (!g) return null;
              return (
                <div key={k} className="rounded-lg border border-line bg-surface px-3 py-2">
                  <span className="text-[13px] font-bold text-ink">{g.term}</span>
                  <span className="ml-2 text-[12.5px] text-ink-2">{g.short}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-between gap-3 border-t border-line pt-4 pb-2 text-[13.5px]">
        {prev ? (
          <Link href={`/learn/${prev.slug}`} className="text-ink-2 hover:text-accent">
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/learn/${next.slug}`} className="text-right font-medium text-accent hover:underline">
            {next.title} →
          </Link>
        ) : (
          <Link href="/learn" className="text-right font-medium text-accent hover:underline">
            回学堂总览 →
          </Link>
        )}
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-3">
        学堂内容仅用于学习交流,不构成任何证券投资建议;提及的平台功能均为模拟环境,历史数据不代表未来表现。
      </p>
    </article>
  );
}
