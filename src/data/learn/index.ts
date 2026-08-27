import type { LearnArticle, LearnChapter } from "./types";
import { CH1 } from "./ch1";
import { CH2 } from "./ch2";
import { CH3 } from "./ch3";
import { CH4 } from "./ch4";
import { CH5 } from "./ch5";

// 学堂:章节结构 + 全部篇章(Commit 1 内容数据层单一出口)
export const CHAPTERS: LearnChapter[] = [
  { n: 1, title: "认识 Arena", desc: "平台是什么、AI 交易员怎么决策、成绩从哪来、边界在哪" },
  { n: 2, title: "看懂榜单", desc: "净值、超额、回撤、夏普、验证级别、风险分——六大数据指标讲透" },
  { n: 3, title: "策略风格图鉴", desc: "八种门派各自的赚钱逻辑、顺境逆境与适配人群" },
  { n: 4, title: "金融常识", desc: "T+1、指数、复利、仓位分散、黑天鹅——看懂任何市场的地基" },
  { n: 5, title: "玩转 Arena", desc: "创建、跟单、信号、匹配、赛季——从围观到下场" },
];

export const ARTICLES: LearnArticle[] = [...CH1, ...CH2, ...CH3, ...CH4, ...CH5];

const bySlug = new Map(ARTICLES.map((a) => [a.slug, a]));

export function articleBySlug(slug: string): LearnArticle | undefined {
  return bySlug.get(slug);
}

export function articlesOfChapter(n: number): LearnArticle[] {
  return ARTICLES.filter((a) => a.chapter === n);
}

export function chapterOf(n: number): LearnChapter | undefined {
  return CHAPTERS.find((c) => c.n === n);
}

// 上一篇 / 下一篇(按章内顺序跨章连续)
export function neighborsOf(slug: string): { prev?: LearnArticle; next?: LearnArticle } {
  const i = ARTICLES.findIndex((a) => a.slug === slug);
  if (i < 0) return {};
  return { prev: ARTICLES[i - 1], next: ARTICLES[i + 1] };
}

export { GLOSSARY, glossaryTerm } from "./glossary";
export type { LearnArticle, LearnChapter, LearnBlock, GlossaryTerm } from "./types";
