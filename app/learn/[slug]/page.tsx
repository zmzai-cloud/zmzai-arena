import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ARTICLES, articleBySlug } from "@/data/learn";
import { ArticleView } from "@/components/learn/ArticleView";

// 学堂篇章:全部 20 篇构建期静态生成(SSG)
export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = articleBySlug(slug);
  if (!a) return { title: "学堂 — Zmz AI Trader Arena" };
  return { title: `${a.title} — Arena 学堂`, description: a.subtitle };
}

export default async function LearnArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!articleBySlug(slug)) notFound();
  return (
    <section className="mt-8">
      <ArticleView slug={slug} />
    </section>
  );
}
