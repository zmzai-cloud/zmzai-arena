"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { agents, STRESS_SCENARIOS, type Agent } from "@/data/agents";
import { fmtPct, riskColor, tierBadge, tierDesc } from "@/lib/format";
import { useIsFollowed, toggleFollow } from "@/lib/follows";
import type { StressStatus } from "@/sim/stress";

export function AgentDetail({ agent }: { agent: Agent }) {
  const router = useRouter();
  const followed = useIsFollowed(agent.id);
  const tb = tierBadge(agent.tier);
  const rank =
    [...agents].sort((a, b) => b.sharpe - a.sharpe).findIndex((x) => x.id === agent.id) + 1;

  return (
    <div>
      <button onClick={() => router.back()} className="mt-5 font-semibold text-accent">
        ← 返回排行榜
      </button>

      {/* header */}
      <div className="mt-3 flex items-center gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm">
        <span className="flex h-16 w-16 flex-none items-center justify-center rounded-xl bg-surface-2 text-[34px]">
          {agent.emoji}
        </span>
        <div>
          <h2 className="text-[21px] font-extrabold">
            {agent.name} {agent.verified && <span className="text-accent">✔ 已验证</span>}
          </h2>
          <div className="mt-1 text-[13px] text-ink-2">
            by {agent.creator} · {agent.market} · {agent.style} · {agent.persona}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            className={`rounded-lg border px-3 py-2 text-[13px] font-semibold ${
              followed ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-ink"
            }`}
            onClick={() => toggleFollow(agent.id)}
          >
            {followed ? "✔ 已关注" : "+ 关注"} ({agent.followers + (followed ? 1 : 0)})
          </button>
          <Link
            href="/create"
            className="rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-accent-ink"
          >
            ⑂ Fork 策略
          </Link>
        </div>
      </div>

      {/* stats */}
      <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-5">
        <Stat v={fmtPct(agent.totalReturn)} l="总收益" cls={agent.totalReturn >= 0 ? "up" : "down"} />
        <Stat v={fmtPct(agent.maxDD)} l="最大回撤" cls={agent.maxDD >= 0 ? "up" : "down"} />
        <Stat v={agent.sharpe.toFixed(2)} l="夏普比率" />
        <Stat
          v={String(agent.riskScore)}
          l="风险分 / 100"
          style={{ color: riskColor(agent.riskScore) }}
        />
        <Stat v={`#${rank}`} l="竞技场排名" />
      </div>

      <div className="mt-1 grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        {/* left */}
        <div className="flex flex-col gap-4">
          <Section title="⚙ 策略逻辑（公开 Prompt）">
            <pre className="overflow-x-auto rounded-lg bg-dark-bg p-4 font-mono text-[12.5px] leading-relaxed text-dark-ink">
              {agent.prompt}
            </pre>
            <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-[12.5px] text-warning">
              <b>⚠ 风控护栏：</b>
              {agent.guard}
            </div>
          </Section>

          <Section title="🧠 AI 决策日志（全透明）">
            <div className="flex flex-col">
              {agent.log.map((d, i) => (
                <div key={i} className="flex gap-3 border-b border-line/70 py-3 last:border-0">
                  <span
                    className={`flex w-16 flex-none items-center justify-center rounded-md text-[12px] font-extrabold ${actCls(
                      d.action
                    )}`}
                  >
                    {d.action}
                  </span>
                  <div>
                    <div className="text-[11.5px] text-ink-2">{d.time}</div>
                    <div>{d.text}</div>
                    <div className="mt-0.5 text-[11.5px] text-ink-3">{d.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* right */}
        <div className="flex flex-col gap-4">
          <Section title={`🛡 风险分构成（${agent.riskScore}/100）`}>
            <div className="flex flex-col gap-2.5">
              {agent.riskBreakdown.map((p) => (
                <div key={p.key}>
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="font-semibold">{p.label}</span>
                    <span className="text-ink-2">
                      权重 {(p.weight * 100).toFixed(0)}% · 风险 {(p.risk * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p.risk * 100}%`, background: riskColor(100 - p.risk * 100) }}
                    />
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-3">{p.note}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
              风险分 = 100 × (1 − Σ 权重×支柱风险)。支柱越红越危险，综合分越低越稳健；既看净值真实表现，也看策略自设护栏。
            </p>
          </Section>

          <Section title="💼 实时持仓">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-ink-2">
                  <th className="py-2 text-left font-semibold">代码</th>
                  <th className="py-2 text-left font-semibold">名称</th>
                  <th className="py-2 text-left font-semibold">数量</th>
                  <th className="py-2 text-left font-semibold">现价</th>
                  <th className="py-2 text-left font-semibold">市值</th>
                </tr>
              </thead>
              <tbody>
                {agent.positions.map((p, i) => (
                  <tr key={i} className="border-t border-line/70">
                    <td className="py-2 font-bold">{p.code}</td>
                    <td className="py-2">{p.name}</td>
                    <td className="py-2">{p.qty}</td>
                    <td className="py-2">{p.price}</td>
                    <td className="py-2">{p.mv}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="📡 验证协议">
            <div className="text-[13px] text-ink-2">
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${tb.className}`}>
                {tb.label}
              </span>
              <div className="mt-3">
                <b>说明：</b>
                {tierDesc[agent.tier]}
              </div>
              <div className="mt-1">
                <b>反前瞻：</b>策略仅可访问≤当前时间的行情，杜绝偷看未来。
              </div>
            </div>
            <button
              className="mt-3.5 w-full rounded-lg border border-line bg-surface py-2.5 text-[13px] font-semibold"
              onClick={() => alert(`Fork ${agent.name} 策略`)}
            >
              ⑂ Fork 这个策略
            </button>
          </Section>

          <Section title="🌪 黑天鹅抗压">
            <div className="flex flex-col gap-3">
              {STRESS_SCENARIOS.map((scn) => {
                const s = agent.stress[scn.id];
                if (!s) return null;
                return (
                  <div key={scn.id} className="rounded-lg border border-line bg-surface-2 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold">{scn.name}</div>
                        <div className="text-[11.5px] text-ink-2">{scn.period}</div>
                      </div>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11.5px] font-bold ${stressCls(s.status)}`}
                      >
                        {s.status}
                        {s.survived ? " · 存活" : " · 出局"}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-4 text-[13px]">
                      <div>
                        <span className="text-ink-2">压力收益 </span>
                        <b className={s.totalReturn >= 0 ? "up" : "down"}>{fmtPct(s.totalReturn)}</b>
                      </div>
                      <div>
                        <span className="text-ink-2">最大回撤 </span>
                        <b className="down">{fmtPct(s.maxDD)}</b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      </div>

      <p className="mt-6 text-center text-[12px] text-ink-2">数据为模拟演示，仅用于产品原型展示</p>
    </div>
  );
}

function Stat({
  v,
  l,
  cls,
  style,
}: {
  v: string;
  l: string;
  cls?: string;
  style?: CSSProperties;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className={`text-[20px] font-extrabold ${cls ?? ""}`} style={style}>
        {v}
      </div>
      <div className="mt-0.5 text-[12px] text-ink-2">{l}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h3 className="mb-3 text-[15px] font-extrabold">{title}</h3>
      {children}
    </div>
  );
}

function actCls(a: string) {
  if (a === "BUY") return "bg-danger/10 text-danger";
  if (a === "SELL") return "bg-success/10 text-success";
  if (a === "REJECT") return "bg-warning/15 text-warning";
  return "bg-surface-2 text-ink-2";
}

function stressCls(s: StressStatus): string {
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
}
