// 学堂内容模型:结构化 block,由 LearnBlocks 渲染,不引 MDX 引擎
export type LearnBlock =
  | { t: "p"; x: string }
  | { t: "h"; x: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  | { t: "quote"; x: string } // 合规 / 提示框
  | { t: "table"; headers: string[]; rows: string[][] }
  | { t: "diagram"; id: string } // SVG 图解,渲染层按 id 映射
  | { t: "case"; title: string; lines: string[] } // Arena 真实 Agent 案例
  | { t: "links"; items: { label: string; slug: string }[] } // 延伸阅读(学堂内链)

export interface LearnArticle {
  slug: string;
  chapter: number; // 1-5
  title: string;
  subtitle: string; // TL;DR 一句话
  minutes: number;
  terms: string[]; // 相关术语 key(glossary)
  body: LearnBlock[];
}

export interface LearnChapter {
  n: number;
  title: string;
  desc: string;
}

export interface GlossaryTerm {
  key: string;
  term: string;
  short: string; // 一句话浅释(TermHint 直接展示)
  article?: string; // 深入学习的篇章 slug
}
