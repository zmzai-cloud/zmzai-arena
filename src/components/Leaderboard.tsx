"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { agents as STATIC_AGENTS, type Agent } from "@/data/agents";
import { loadUserAgents } from "@/lib/userAgents";
import { useIsFollowed, toggleFollow } from "@/lib/follows";
import { fmtPct, riskColor, tierBadge, engineBadge, engineCls } from "@/lib/format";
import type { RobustnessLabel } from "@/sim/robustness";

type SortKey = "totalReturn" | "maxDD" | "sharpe" | "riskScore";

const markets = ["全部", ...Array.from(new Set(STATIC_AGENTS.map((a) => a.market)))];

// 终端式行情表：mono 表头 + 数字右对齐 + 细线，无圆角无阴影
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
  const arrow = (k: SortKey) => (k === sortKey ? (dir === -1 ? "↓" : "↑") : "⇅");

  return (
    <div className="mt-6">
      {/* 市场筛选：下划线 tab，直角金融风 */}
      <div className="flex items-center gap-1 border-b border-line">
        {markets.map((m) => (
          <button
            key={m}
            onClick={() => setFilter(m)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors ${
              filter === m
                ? "border-accent text-ink"
                : "border-transparent text-ink-3 hover:text-ink"
            }`}
          >
            {m}
          </button>
        ))}
        <span className="ml-auto hidden pb-2 text-[11.5px] text-ink-3 sm:block">
          点表头「总收益 / 回撤 / 夏普 / 风险分」排序
        </span>
      </div>

      {/* 榜单表格：移动端横向滚动，不撑破视口 */}
      <div className="mt-1 overflow-x-auto">
        <table className="dtbl min-w-[720px]">
        <thead>
          <tr>
            <th>#</th>
            <th>交易员 / 策略</th>
            <th>市场 · 风格</th>
            <th className="cursor-pointer" onClick={() => toggleSort("totalReturn")}>
              总收益{sortKey === "totalReturn" && <span className="ml-1 text-accent">{arrow("totalReturn")}</span>}
            </th>
            <th className="cursor-pointer" onClick={() => toggleSort("maxDD")}>
              最大回撤{sortKey === "maxDD" && <span className="ml-1 text-accent">{arrow("maxDD")}</span>}
            </th>
            <th className="cursor-pointer" onClick={() => toggleSort("sharpe")}>
              夏普{sortKey === "sharpe" && <span className="ml-1 text-accent">{arrow("sharpe")}</span>}
            </th>
            <th className="cursor-pointer" onClick={() => toggleSort("riskScore")}>
              风险分{sortKey === "riskScore" && <span className="ml-1 text-accent">{arrow("riskScore")}</span>}
            </th>
            <th>稳健度</th>
            <th className="text-center">关注</th>
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
    <tr>
      <td className="num text-ink-3">{rank}</td>
      <td>
        <Link href={`/agents/${a.id}`} className="group flex items-center gap-2.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded bg-surface-2 text-[16px]">
            {a.emoji}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="truncate">{a.name}</span>
              {a.verified && (
                <span className="num text-[10px] font-bold text-accent">✓VERIFIED</span>
              )}
              {a.engine && (
                <span className={`rounded px-1.5 py-px text-[10px] font-bold ${engineCls(a.engine)}`}>
                  {engineBadge(a.engine)}
                </span>
              )}
            </span>
            <span className="block truncate text-[12px] text-ink-3">{a.slogan}</span>
          </span>
        </Link>
      </td>
      <td>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold">{a.market}</span>
        <span className="ml-1.5 text-[12px] text-ink-3">{a.style}</span>
      </td>
      <td className={`num text-right ${a.totalReturn >= 0 ? "up" : "down"}`}>{fmtPct(a.totalReturn)}</td>
      <td className={`num text-right ${a.maxDD >= 0 ? "up" : "down"}`}>{fmtPct(a.maxDD)}</td>
      <td className="num text-right font-extrabold">{a.sharpe.toFixed(2)}</td>
      <td className="text-right">
        <span className="riskbar inline-block w-14 align-middle">
          <i
            className="block h-full"
            style={{ width: `${a.riskScore}%`, background: riskColor(a.riskScore) }}
          />
        </span>
        <span className="num ml-2">{a.riskScore}</span>
      </td>
      <td>
        <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${robCls(a.robustness.label)}`}>
          {a.robustness.label}
        </span>
        <span className="num ml-1.5 text-[12px] text-ink-3">{a.robustness.stabilityScore}</span>
      </td>
      <td className="text-center">
        <FollowStar id={a.id} />
      </td>
    </tr>
  );
}

function robCls(l: RobustnessLabel): string {
  if (l === "稳健") return "bg-success/12 text-success";
  if (l === "过拟合嫌疑") return "bg-danger/15 text-danger";
  return "bg-warning/15 text-warning";
}

function FollowStar({ id }: { id: number }) {
  const followed = useIsFollowed(id);
  return (
    <button
      onClick={() => toggleFollow(id)}
      title={followed ? "取消关注" : "关注"}
      aria-label={followed ? "取消关注" : "关注"}
      className={`inline-flex h-7 w-7 items-center justify-center rounded text-[15px] transition ${
        followed ? "bg-accent/10 text-accent" : "bg-surface-2 text-ink-3 hover:text-accent"
      }`}
    >
      {followed ? "★" : "☆"}
    </button>
  );
}
