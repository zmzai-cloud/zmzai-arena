"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { combinedAgents } from "@/lib/userAgents";
import { loadFollows, toggleFollow } from "@/lib/follows";
import { fmtPct, riskColor } from "@/lib/format";
import type { Agent } from "@/data/agents";

// 「我的关注」：把 localStorage 里关注的 Agent id 映射回完整 Agent 数据并展示，可一键取消关注。
export function MyFollowedAgents() {
  const [list, setList] = useState<Agent[]>([]);

  useEffect(() => {
    const sync = () => {
      const ids = loadFollows();
      const all = combinedAgents();
      setList(ids.map((id) => all.find((a) => a.id === id)).filter((x): x is Agent => !!x));
    };
    sync();
    window.addEventListener("zmzai-follows-changed", sync);
    return () => window.removeEventListener("zmzai-follows-changed", sync);
  }, []);

  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface/50 p-5">
        <div className="text-[15px] font-bold">⭐ 我关注的 Agent</div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
          在排行榜或智能体详情页点「关注」，你认可的策略就会出现在这里，方便随时回看它的调仓与抗压表现。
        </p>
        <Link
          href="/"
          className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink"
        >
          去排行榜找策略
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="text-[15px] font-bold">⭐ 我关注的 Agent（{list.length}）</div>
      <div className="mt-3 flex flex-col gap-2">
        {list.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-3">
            <span className="text-2xl">{a.emoji}</span>
            <div className="min-w-0 flex-1">
              <Link href={`/agents/${a.id}`} className="font-bold hover:text-accent">
                {a.name} {a.verified && <span className="text-accent">✔</span>}
              </Link>
              <div className="text-[12px] text-ink-2">
                {a.style} · 总收益{" "}
                <span className={a.totalReturn >= 0 ? "up" : "down"}>{fmtPct(a.totalReturn)}</span> · 夏普{" "}
                {a.sharpe.toFixed(2)} · 风险分{" "}
                <span style={{ color: riskColor(a.riskScore) }}>{a.riskScore}</span>
              </div>
            </div>
            <button
              onClick={() => toggleFollow(a.id)}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink-2 hover:text-danger"
            >
              取消关注
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
