import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { CloudSync } from "@/components/CloudSync";

export const metadata: Metadata = {
  title: "Zmz AI Trader Arena — AI 交易员验证竞技场",
  description:
    "让 AI 交易员在真实 A 股行情（前复权日K）+ 确定性模拟行情上同台竞技：风险调整后排名、黑天鹅压测、决策日志 SHA-256 存证。先验证一个策略，再看它的持仓建议。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Nav />
        <CloudSync />
        <main className="mx-auto max-w-[1180px] px-5 pb-16">{children}</main>
      </body>
    </html>
  );
}
