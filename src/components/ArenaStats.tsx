"use client";

// 竞技场顶部 KPI：官方 + 用户 Agent 合并真实计算（替代原静态 KpiCards）
import { useEffect, useState } from "react";
import { agents as STATIC_AGENTS } from "@/data/agents";
import { loadUserAgents } from "@/lib/userAgents";

export function ArenaStats() {
  const [userAgents, setUserAgents] = useState<typeof STATIC_AGENTS>([]);
  useEffect(() => setUserAgents(loadUserAgents()), []);

  const all = [...STATIC_AGENTS, ...userAgents];
  const avgSharpe = all.length ? (all.reduce((s, a) => s + a.sharpe, 0) / all.length).toFixed(2) : "—";
  const maxRisk = all.length ? String(Math.max(...all.map((a) => a.riskScore))) : "—";
  const stable = all.length
    ? all.filter((a) => a.robustness.label === "稳健").length
    : 0;

  const items = [
    { v: avgSharpe, l: "平均夏普（风险调整后）" },
    { v: maxRisk, l: "最高风险分 / 100" },
    { v: String(all.length), l: "在榜 Agent" },
    { v: `${stable}/${all.length}`, l: "反过拟合「稳健」认证" },
  ];

  return (
    <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.l} className="bg-surface px-5 py-4">
          <div className="num text-[24px] font-bold leading-none">{it.v}</div>
          <div className="mt-2 text-[12px] text-ink-2">{it.l}</div>
        </div>
      ))}
    </div>
  );
}
