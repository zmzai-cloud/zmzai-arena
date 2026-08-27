import type { Metadata } from "next";
import { MatchWizard } from "@/components/MatchWizard";

export const metadata: Metadata = {
  title: "风险偏好匹配 — Zmz AI Trader Arena",
  description: "4 道题测出你的风险档位，匹配最适合你的 AI 交易员（基于真实回测指标，零编造）。",
};

// 风险偏好匹配（P4）：问卷 → 风险档位 → 推荐 Agent（路线图「风险偏好匹配」项）
export default function MatchPage() {
  return (
    <section className="mt-8">
      <div className="mx-auto max-w-[760px]">
        <p className="num text-[11px] tracking-[0.15em] text-ink-3">RISK MATCHING</p>
        <h1 className="mt-1.5 text-[26px] font-extrabold tracking-tight">
          30 秒测一测，哪个 AI 交易员适合你
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
          不看名字看指标：按你的回撤容忍、期限与目标，从真实回测档案里挑出风险气质最接近的三位。
        </p>
      </div>
      <MatchWizard />
    </section>
  );
}
