import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "zmzai 投研竞技场",
  description: "AI 投研智能体竞技场 — 信任层 + 风险调整后排行榜 + Agent 全透明详情",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Nav />
        <main className="mx-auto max-w-[1180px] px-5 pb-16">{children}</main>
      </body>
    </html>
  );
}
