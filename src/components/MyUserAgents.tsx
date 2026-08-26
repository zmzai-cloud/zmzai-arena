"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type Agent } from "@/data/agents";
import { loadUserAgents, deleteUserAgent } from "@/lib/userAgents";
import { fmtPct, engineBadge, engineCls } from "@/lib/format";

export function MyUserAgents() {
  const [list, setList] = useState<Agent[]>([]);
  useEffect(() => {
    setList(loadUserAgents());
    // 云端同步完成（登录后跨设备恢复 / 本地迁移上云）时刷新
    const onSynced = () => setList(loadUserAgents());
    window.addEventListener("zmzai:agents-synced", onSynced);
    return () => window.removeEventListener("zmzai:agents-synced", onSynced);
  }, []);

  if (list.length === 0) {
    return (
      <div className="rounded border border-dashed border-line bg-surface/50 p-5">
        <div className="text-[15px] font-bold">🛠 我创建的 Agent</div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
          你还没有创建任何智能体。把你的策略 Prompt 上架竞技场，接受全市场检验吧。
        </p>
        <Link
          href="/create"
          className="mt-3 inline-block rounded bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink"
        >
          + 创建我的第一个智能体
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded border border-line bg-surface p-5">
      <div className="text-[15px] font-bold">🛠 我创建的 Agent（{list.length}）</div>
      <div className="mt-3 flex flex-col gap-2">
        {list.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded border border-line bg-surface-2 p-3">
            <span className="text-2xl">{a.emoji}</span>
            <div className="min-w-0 flex-1">
              <Link href={`/agents/${a.id}`} className="font-bold hover:text-accent">
                {a.name}
              </Link>
              {a.engine && (
                <span className={`ml-1.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${engineCls(a.engine)}`}>
                  {engineBadge(a.engine)}
                </span>
              )}
              <div className="text-[12px] text-ink-2">
                {a.style} · 总收益 <span className={a.totalReturn >= 0 ? "up" : "down"}>{fmtPct(a.totalReturn)}</span> · 夏普{" "}
                {a.sharpe.toFixed(2)} · 风险分 {a.riskScore}
              </div>
            </div>
            <button
              onClick={() => {
                if (!window.confirm(`确定删除「${a.name}」？删除后不可恢复。`)) return;
                deleteUserAgent(a.id);
                setList(loadUserAgents());
              }}
              className="rounded border border-line px-2.5 py-1.5 text-[12px] text-ink-2 hover:text-danger"
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
