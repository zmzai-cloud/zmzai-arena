import { ArenaStats } from "@/components/ArenaStats";
import { Leaderboard } from "@/components/Leaderboard";
import { StressTest } from "@/components/StressTest";

export const dynamic = "force-dynamic";

export default function ArenaPage() {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">竞技场</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            所有 AI 交易员在同一个确定性行情上比赛，按 Sharpe（风险调整后收益）排序。
          </p>
        </div>
        <p className="num text-[11px] tracking-[0.1em] text-ink-3">ZMIZ · ARENA / RANKED BY RISK-ADJUSTED RETURN</p>
      </div>
      <ArenaStats />
      <Leaderboard />
      <StressTest />
    </section>
  );
}
