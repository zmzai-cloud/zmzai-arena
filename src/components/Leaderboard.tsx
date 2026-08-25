"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { agents as STATIC_AGENTS, type Agent } from "@/data/agents";
import { loadUserAgents } from "@/lib/userAgents";
import { fmtPct, riskColor, tierBadge } from "@/lib/format";

type SortKey = "totalReturn" | "maxDD" | "sharpe" | "riskScore";

const markets = ["全部", ...Array.from(new Set(STATIC_AGENTS.map((a) => a.market)))];

export function Leaderboard() {
  const [filter, setFilter] = useState("全部");
  const [sortKey, setSortKey] = useState<SortKey>("sharpe");
  const [dir, setDir] = useState<-1 | 1>(-1);
  const [userAgents, setUserAgents] = useState<Agent[]>([]);
  useEffect(() => setUserAgents(loadUserAgents()), []);

  const list = useMemo(() => {
    const all = [...STATIC_AGENTS, ...userAgents];
    const f = all.filter((a) => filter === "全部" || a.market === filter);
    return [...f].sort((a, b) => (a[sortKey] - b[sortKey]) * dir);
  }, [filter, sortKey, dir, userAgents]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === -1 ? 1 : -1));
    else {
      setSortKey(k);
      setDir(-1);
    }
  };
  const arrow = (k: SortKey) => (k === sortKey ? (dir === -1 ? " ↓" : " ↑") : " ⇅");

  return (
    <div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {markets.map((m) => (
          <button
            key={m}
            onClick={() => setFilter(m)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${
              filter === m
                ? "border-accent bg-accent text-accent-ink"
                : "border-line bg-surface text-ink-2"
            }`}
          >
            {m}
          </button>
        ))}
        <span className="ml-auto text-[12.5px] text-ink-2">
          点表头「总收益 / 回撤 / 夏普 / 风险分」可排序
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-surface-2 text-ink-2">
              <th className="px-3.5 py-3 text-left font-bold">#</th>
              <th className="px-3.5 py-3 text-left font-bold">智能体 / 人设</th>
              <th className="px-3.5 py-3 text-left font-bold">创建者</th>
              <th className="px-3.5 py-3 text-left font-bold">市场 · 风格</th>
              <th className="cursor-pointer px-3.5 py-3 text-left font-bold" onClick={() => toggleSort("totalReturn")}>
                总收益{arrow("totalReturn")}
              </th>
              <th className="cursor-pointer px-3.5 py-3 text-left font-bold" onClick={() => toggleSort("maxDD")}>
                最大回撤{arrow("maxDD")}
              </th>
              <th className="cursor-pointer px-3.5 py-3 text-left font-bold" onClick={() => toggleSort("sharpe")}>
                夏普{arrow("sharpe")}
              </th>
              <th className="cursor-pointer px-3.5 py-3 text-left font-bold" onClick={() => toggleSort("riskScore")}>
                风险分{arrow("riskScore")}
              </th>
              <th className="px-3.5 py-3 text-left font-bold">天数</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a, i) => (
              <Row key={a.id} a={a} rank={i + 1} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-center text-[12px] text-ink-2">
        数据为模拟演示，仅用于产品原型展示 · 投资有风险，本平台不参与任何真实交易
      </p>
    </div>
  );
}

function Row({ a, rank }: { a: Agent; rank: number }) {
  const tb = tierBadge(a.tier);
  return (
    <tr className="border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2">
      <td className="px-3.5 py-3 font-bold text-ink-2">{rank}</td>
      <td className="px-3.5 py-3">
        <Link href={`/agents/${a.id}`} className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-surface-2 text-[20px]">
            {a.emoji}
          </span>
          <span>
            <span className="font-bold">
              {a.name} {a.verified && <span className="text-accent">✔ 已验证</span>}
            </span>
            <span className="block text-[12px] text-ink-2">{a.slogan}</span>
          </span>
        </Link>
      </td>
      <td className="px-3.5 py-3 text-ink-2">{a.creator}</td>
      <td className="px-3.5 py-3">
        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11.5px] font-bold text-accent">
          {a.market}
        </span>
        <span className="ml-1 text-ink-2">· {a.style}</span>
        <div className="mt-1">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${tb.className}`}>
            {tb.label}
          </span>
        </div>
      </td>
      <td className={`px-3.5 py-3 font-bold ${a.totalReturn >= 0 ? "up" : "down"}`}>
        {fmtPct(a.totalReturn)}
      </td>
      <td className={`px-3.5 py-3 font-bold ${a.maxDD >= 0 ? "up" : "down"}`}>{fmtPct(a.maxDD)}</td>
      <td className="px-3.5 py-3 font-extrabold">{a.sharpe.toFixed(2)}</td>
      <td className="px-3.5 py-3">
        <span className="riskbar align-middle">
          <i
            className="block h-full"
            style={{ width: `${a.riskScore}%`, background: riskColor(a.riskScore) }}
          />
        </span>
        <span className="ml-2">{a.riskScore}</span>
      </td>
      <td className="px-3.5 py-3 text-ink-2">{a.days || "—"}</td>
    </tr>
  );
}
