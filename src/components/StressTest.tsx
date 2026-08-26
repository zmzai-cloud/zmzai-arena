"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { stressResults, STRESS_SCENARIOS, agents, type Agent } from "@/data/agents";
import { loadUserAgents } from "@/lib/userAgents";
import { fmtPct } from "@/lib/format";
import type { AgentStress, StressStatus } from "@/sim/stress";

const statusCls = (s: StressStatus): string => {
  switch (s) {
    case "稳健":
      return "bg-success/12 text-success";
    case "承压":
      return "bg-warning/15 text-warning";
    case "重创":
      return "bg-danger/15 text-danger";
    case "爆仓":
      return "bg-danger text-white";
  }
};

export function StressTest() {
  const [sel, setSel] = useState(STRESS_SCENARIOS[0].id);
  const [userAgents, setUserAgents] = useState<Agent[]>([]);
  useEffect(() => setUserAgents(loadUserAgents()), []);

  // 官方 stressResults（模块级静态）+ 用户创建的 Agent（localStorage）合并为同一张表
  const userMap = useMemo(() => new Map(userAgents.map((a) => [a.id, a])), [userAgents]);
  const allAgents = useMemo(() => [...agents, ...userAgents], [userAgents]);

  const byScenario = useMemo(() => {
    const map = new Map<string, AgentStress[]>();
    for (const r of stressResults) map.set(r.scenario.id, [...r.agents]);
    for (const ua of userAgents) {
      for (const scn of STRESS_SCENARIOS) {
        const s = ua.stress[scn.id];
        if (s) (map.get(scn.id) ?? map.set(scn.id, []).get(scn.id)!).push(s);
      }
    }
    for (const list of map.values()) list.sort((a, b) => b.totalReturn - a.totalReturn);
    return map;
  }, [userAgents]);

  const result = useMemo(() => {
    const rows = byScenario.get(sel) ?? [];
    return {
      scenario: stressResults.find((r) => r.scenario.id === sel)!.scenario,
      agents: rows,
      total: rows.length,
      survivedCount: rows.filter((a) => a.survived).length,
    };
  }, [sel, byScenario]);

  const nameOf = (id: number) => allAgents.find((a) => a.id === id)?.name ?? `#${id}`;
  const emojiOf = (id: number) => allAgents.find((a) => a.id === id)?.emoji ?? "🤖";
  const marketOf = (id: number) => allAgents.find((a) => a.id === id)?.market ?? "";
  const styleOf = (id: number) => allAgents.find((a) => a.id === id)?.style ?? "";

  const blown = result.agents.filter((a) => a.status === "爆仓").length;
  const resilient = result.agents.filter((a) => a.status === "稳健").length;

  return (
    <div className="mt-10">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[19px] font-extrabold">
            🌪 黑天鹅压力测试
          </h2>
          <p className="mt-1 text-[13px] text-ink-2">
            一键让全部智能体重跑历史极端行情，看清谁扛得住、谁爆仓。
          </p>
        </div>
        <div className="text-[12.5px] text-ink-2">
          存活 <b className="text-success">{result.survivedCount}/{result.total}</b>
          {" · "}爆仓 <b className="text-danger">{blown}</b>
          {" · "}稳健 <b className="text-success">{resilient}</b>
        </div>
      </div>

      {/* 场景选择 */}
      <div className="mt-3 flex flex-wrap gap-2">
        {STRESS_SCENARIOS.map((scn) => {
          const rows = byScenario.get(scn.id) ?? [];
          const active = scn.id === sel;
          return (
            <button
              key={scn.id}
              onClick={() => setSel(scn.id)}
              className={`rounded-xl border px-4 py-2.5 text-left transition-colors ${
                active
                  ? "border-accent bg-accent/10"
                  : "border-line bg-surface hover:border-accent/50"
              }`}
            >
              <div className="font-bold">{scn.name}</div>
              <div className="text-[11.5px] text-ink-2">{scn.period}</div>
              <div className="mt-0.5 text-[11.5px] text-ink-2">
                存活 {rows.filter((a) => a.survived).length}/{rows.length}
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[12.5px] text-ink-2">{result.scenario.desc}</p>

      {/* 抗压排行表 */}
      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-surface-2 text-ink-2">
              <th className="px-3.5 py-3 text-left font-bold">抗压排名</th>
              <th className="px-3.5 py-3 text-left font-bold">智能体</th>
              <th className="px-3.5 py-3 text-left font-bold">市场 · 风格</th>
              <th className="px-3.5 py-3 text-left font-bold">压力收益</th>
              <th className="px-3.5 py-3 text-left font-bold">最大回撤</th>
              <th className="px-3.5 py-3 text-left font-bold">状态</th>
            </tr>
          </thead>
          <tbody>
            {result.agents.map((a, i) => (
              <tr
                key={`${a.agentId}-${a.scenarioId}`}
                className="border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2"
              >
                <td className="px-3.5 py-3 font-bold text-ink-2">{i + 1}</td>
                <td className="px-3.5 py-3">
                  <Link href={`/agents/${a.agentId}`} className="flex items-center gap-2.5">
                    <span className="text-[18px]">{emojiOf(a.agentId)}</span>
                    <span className="font-bold">{nameOf(a.agentId)}</span>
                    {userMap.has(a.agentId) && (
                      <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10.5px] font-bold text-accent">
                        用户
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-3.5 py-3 text-ink-2">
                  <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11.5px] font-bold text-accent">
                    {marketOf(a.agentId)}
                  </span>
                  <span className="ml-1">{styleOf(a.agentId)}</span>
                </td>
                <td className={`px-3.5 py-3 font-bold ${a.totalReturn >= 0 ? "up" : "down"}`}>
                  {fmtPct(a.totalReturn)}
                </td>
                <td className={`px-3.5 py-3 font-bold ${a.maxDD >= 0 ? "up" : "down"}`}>
                  {fmtPct(a.maxDD)}
                </td>
                <td className="px-3.5 py-3">
                  <span className={`rounded-md px-2 py-0.5 text-[11.5px] font-bold ${statusCls(a.status)}`}>
                    {a.status}
                    {a.survived ? " · 存活" : " · 出局"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-center text-[12px] text-ink-2">
        压力测试为基于历史行情形态的模拟演示，仅用于产品原型展示 · 投资有风险，本平台不参与任何真实交易
      </p>
    </div>
  );
}
