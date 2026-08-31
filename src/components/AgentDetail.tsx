"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { agents, marketMeta, STRESS_SCENARIOS, type Agent } from "@/data/agents";
import { loadUserAgents, saveUserAgent, reverifyAgentRemote, BacktestQuotaError } from "@/lib/userAgents";
import { fmtPct, riskColor, tierBadge, tierDesc, engineBadge, engineCls } from "@/lib/format";
import { computeIntegrityHash } from "@/lib/integrity";
import { useIsFollowed, toggleFollow } from "@/lib/follows";
import { TermHint } from "@/components/TermHint";
import type { StressStatus } from "@/sim/stress";
import type { RobustnessLabel } from "@/sim/robustness";
import { REAL_INDEXES } from "@/data/index-real";
import { BENCH_INDEX, BENCH_INDEX_NAME, MARKET_DAYS } from "@/sim/index-market";
import { medalsOf, historyOf, loadSeasonSnapshots, MEDAL_LABEL, medalCls, leagueCls, LEAGUE_LABEL, leagueOf } from "@/lib/season";

// 验证档案页：受众是投资小白，核心动作是「验证一个 Agent 再决定要不要跟」
export function AgentDetail({ agent }: { agent: Agent }) {
  const router = useRouter();
  const followed = useIsFollowed(agent.id);
  const tb = tierBadge(agent.tier);
  // 排名：官方 + 用户 Agent 合并排序（用户创建的 Agent 不在静态 agents 里）
  const rank =
    [...agents, ...loadUserAgents()]
      .sort((a, b) => b.sharpe - a.sharpe)
      .findIndex((x) => x.id === agent.id) + 1;
  const attrScale = Math.max(1, ...agent.attribution.byBucket.map((b) => Math.abs(b.value)));

  // 预期收益区间：全部来自真实引擎对照分布（robustness 认证的重跑样本），不编造
  const r = agent.robustness;
  const expLo = r.meanReturn - r.stdReturn;
  const expHi = r.meanReturn + r.stdReturn;

  const [verified, setVerified] = useState<boolean | null>(null);
  const verify = () => setVerified(computeIntegrityHash(agent) === agent.integrityHash);
  useEffect(() => {
    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id]);

  // 历史赛季轨迹（已结算赛季的名次 / 联赛 / 升降标记，跨月自动归档）
  const [seasonHistory, setSeasonHistory] = useState<ReturnType<typeof historyOf>>([]);
  useEffect(() => {
    setSeasonHistory(historyOf(agent.id, loadSeasonSnapshots()));
  }, [agent.id]);
  const seasonMedals = seasonHistory.filter((h) => h.rank <= 3);

  // 跟投换算（小韭菜叙事）：初始投入 → 按策略总收益换算期末金额
  const [invest, setInvest] = useState(10000);
  const finalValue = invest * (1 + agent.totalReturn / 100);

  // 验证报告导出（Pro 权益）：未登录/Free 时展示升级引导，Pro 直接触发服务端生成的 JSON 下载
  const [exportState, setExportState] = useState<"idle" | "busy" | "need-pro">("idle");
  const exportReport = async () => {
    setExportState("busy");
    try {
      const me = await fetch("/api/billing/me").then((r) => r.json());
      if (!me.account || me.account.plan !== "pro") {
        setExportState("need-pro");
        return;
      }
      const res = await fetch("/api/report/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent,
          engine: agent.engine ?? "local",
          runId: agent.sandboxRunId ?? null,
          simDays: agent.days ?? null,
        }),
      });
      if (!res.ok) {
        setExportState("need-pro");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers
        .get("content-disposition")
        ?.match(/filename\*=UTF-8''(.+)/)?.[1]
        ? decodeURIComponent(res.headers.get("content-disposition")!.match(/filename\*=UTF-8''(.+)/)![1])
        : `arena-verify-${agent.name}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportState("idle");
    } catch {
      setExportState("idle");
    }
  };

  // 重新验证：按存档配置在沙箱重跑一次（每次消耗一次回测配额），产物为「我」的用户副本
  const [reverifyState, setReverifyState] = useState<"idle" | "busy" | "need-pro">("idle");
  const reverify = async () => {
    if (!agent.cfg || reverifyState === "busy") return;
    setReverifyState("busy");
    try {
      const copy = await reverifyAgentRemote(agent);
      saveUserAgent(copy);
      router.push(`/agents/${copy.id}`);
    } catch (e) {
      if (e instanceof BacktestQuotaError) {
        // 配额用尽 / 计划超限：展示升级引导（绝不静默降级，配额才有意义）
        setReverifyState("need-pro");
      } else {
        setReverifyState("idle");
      }
    }
  };

  return (
    <div>
      <button
        onClick={() => {
          if (window.history.length > 1) router.back();
          else router.push("/");
        }}
        className="mt-5 font-semibold text-accent"
      >
        ← 返回竞技场
      </button>

      {/* 终端验证结论条（真实校验结果，非装饰） */}
      <div className="term mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[12px]">
        <span className="acc">zmzai-arena$</span>
        <span className="text-dark-ink/70">verify --id={agent.id} --engine={agent.engine ?? "local"}</span>
        <span className="ok">✓ integrity {verified === null ? "…" : verified ? "MATCH" : "MISMATCH"}</span>
        <span className="ok">✓ 反前瞻护栏</span>
        <span className="ok">✓ A股实盘行情 · 模拟撮合 · 无真实资金</span>
        <span className="warn">360 交易日</span>
      </div>

      {/* header：名称 + 操作（关注 / Fork 均为真实交互） */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line pb-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded bg-surface-2 text-[24px]">
          {agent.emoji}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-serif font-bold tracking-tight">{agent.name}</h1>
            {agent.verified && (
              <span className="num rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                ✓ VERIFIED
              </span>
            )}
            <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${tb.className}`}>{tb.label}</span>
            {agent.engine && (
              <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${engineCls(agent.engine)}`}>
                {engineBadge(agent.engine)}
              </span>
            )}
            {seasonMedals.map((m) => (
              <span
                key={m.season}
                title={`${m.season} 赛季第 ${m.rank} 名`}
                className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${medalCls(m.rank)}`}
              >
                {m.season.slice(5)}月 {MEDAL_LABEL[m.rank]}
              </span>
            ))}
          </div>
          <div className="mt-1 text-[13px] text-ink-2">
            by {agent.creator} · {agent.market} · {agent.style} · {agent.persona}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <button
            className={`rounded px-3.5 py-2 text-[13px] font-semibold transition-colors ${
              followed
                ? "border border-accent bg-accent/10 text-accent"
                : "border border-line bg-surface text-ink hover:border-accent/50"
            }`}
            onClick={() => toggleFollow(agent.id)}
          >
            {followed ? "★ 已关注" : "☆ 关注"} · {agent.followers + (followed ? 1 : 0)}
          </button>
          <button
            onClick={exportReport}
            disabled={exportState === "busy"}
            className="rounded border border-line px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-accent/50 disabled:opacity-50"
          >
            {exportState === "busy" ? "导出中…" : "⇩ 导出报告"}
          </button>
          <button
            onClick={reverify}
            disabled={reverifyState === "busy" || !agent.cfg}
            title={agent.cfg ? "按存档配置在当前行情重跑一次（消耗 1 次回测配额）" : "该策略无存档配置，无法重新验证"}
            className="rounded border border-accent/50 px-3.5 py-2 text-[13px] font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
          >
            {reverifyState === "busy" ? "回测中…" : "⟳ 重新验证"}
          </button>
          <Link
            href={`/battle?pick=${agent.id}`}
            title="拉上其他策略，在同一段新行情上同场对决"
            className="rounded bg-accent/10 px-3.5 py-2 text-[13px] font-bold text-accent transition-colors hover:bg-accent/15"
          >
            ⚔ 发起对决
          </Link>
          <Link
            href={`/create?fork=${agent.id}`}
            className="rounded bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-ink"
          >
            ⑂ Fork 策略
          </Link>
        </div>
        {exportState === "need-pro" && (
          <div className="mt-3 flex w-full flex-wrap items-center gap-x-2 gap-y-1 border border-warning/40 bg-warning/10 px-3.5 py-2 text-[12.5px] text-warning">
            <span>验证报告导出为 Pro 权益（JSON 留档，含时间戳与来源声明）</span>
            <Link href="/pricing" className="font-semibold underline underline-offset-2">
              查看 Pro 权益 →
            </Link>
          </div>
        )}
        {reverifyState === "need-pro" && (
          <div className="mt-3 flex w-full flex-wrap items-center gap-x-2 gap-y-1 border border-warning/40 bg-warning/10 px-3.5 py-2 text-[12.5px] text-warning">
            <span>回测额度已用完（Free 每月 3 次沙箱回测），升级 Pro 解锁无限回测</span>
            <Link href="/pricing" className="font-semibold underline underline-offset-2">
              查看 Pro 权益 →
            </Link>
          </div>
        )}
      </div>

      {/* KPI：细线网格 + mono 数字 */}
      <div className="mt-4 grid grid-cols-2 divide-x divide-y divide-line border border-line sm:grid-cols-6">
        <Kpi v={fmtPct(agent.totalReturn)} l="总收益" hint="totalReturn" cls={agent.totalReturn >= 0 ? "up" : "down"} />
        <Kpi v={fmtPct(agent.maxDD)} l="最大回撤" hint="maxDD" cls={agent.maxDD >= 0 ? "up" : "down"} />
        <Kpi v={agent.sharpe.toFixed(2)} l="夏普比率" hint="sharpe" />
        <Kpi v={String(agent.riskScore)} l="风险分 / 100" hint="riskScore" style={{ color: riskColor(agent.riskScore) }} />
        <Kpi
          v={agent.excess ? `${agent.excess.excess >= 0 ? "+" : ""}${(agent.excess.excess * 100).toFixed(1)}%` : "—"}
          l={`超额收益 vs ${BENCH_INDEX_NAME}`}
          hint="excess"
          cls={agent.excess ? (agent.excess.beat ? "up" : "down") : ""}
        />
        <Kpi v={`#${rank}`} l="竞技场排名" />
      </div>

      {/* 净值 vs 沪深300：同期归一化叠加曲线（原生 SVG） */}
      {agent.nav && agent.nav.length > 1 && (
        <div className="mt-4 border border-line bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-[13px] font-bold">净值 vs {BENCH_INDEX_NAME}</div>
            <div className="num text-[11px] text-ink-3">SAME WINDOW · NORMALIZED</div>
          </div>
          <NavVsBench nav={agent.nav} />
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
            策略净值与{` ${BENCH_INDEX_NAME} `}同期归一化对比（同引擎窗口，起点=0）：曲线在上方即为跑赢大盘；
            {agent.excess
              ? `同期超额 ${agent.excess.excess >= 0 ? "+" : ""}${(agent.excess.excess * 100).toFixed(1)}%（${agent.excess.beat ? "跑赢" : "跑输"}基准）。`
              : ""}
          </p>
        </div>
      )}

      {/* 赛季轨迹：联赛升降级 + 徽章历史（留存钩子） */}
      {seasonHistory.length > 0 && (
        <div className="mt-4 border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13px] font-bold">赛季轨迹</div>
            <div className="text-[11px] text-ink-3">甲级 TOP10 · 乙级 11-20 · 丙级 21-30 · 跨赛季自动升降级</div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {seasonHistory.map((h) => (
              <span
                key={h.season}
                title={`${h.season} 赛季第 ${h.rank} 名${h.promoted ? "（晋级）" : h.relegated ? "（降级）" : ""}`}
                className="flex items-center gap-1.5 rounded border border-line bg-surface-2 px-2 py-1"
              >
                <span className="text-[11px] font-bold text-ink-2">{h.season}</span>
                <span
                  className={`num rounded px-1.5 py-px text-[10.5px] font-bold ${
                    h.rank <= 3 ? medalCls(h.rank) : "bg-surface-2 text-ink-3"
                  }`}
                >
                  #{h.rank}
                </span>
                <span
                  className={`rounded px-1.5 py-px text-[10px] font-bold ${leagueCls(h.league ?? leagueOf(h.rank))}`}
                >
                  {LEAGUE_LABEL[h.league ?? leagueOf(h.rank)]}
                </span>
                {h.promoted && (
                  <span className="rounded bg-accent/12 px-1 py-px text-[10px] font-bold text-accent">↑ 晋级</span>
                )}
                {h.relegated && (
                  <span className="rounded bg-danger/12 px-1 py-px text-[10px] font-bold text-danger">↓ 降级</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 跟投换算：把专业收益翻译成小韭菜的“钱变多少钱” */}
      <div className="mt-4 border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[13px] font-bold">跟投换算</div>
          <div className="num text-[11px] text-ink-3">IF YOU FOLLOWED WITH ¥10,000</div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            初始投入
            <input
              type="number"
              min={100}
              step={1000}
              value={invest}
              onChange={(e) => setInvest(Math.max(0, Number(e.target.value) || 0))}
              className="num w-28 rounded border border-line bg-surface-2 px-2 py-1.5 text-right text-[14px] font-bold text-ink outline-none focus:border-accent"
            />
            元
          </label>
          <div>
            <div className="text-[11px] text-ink-3">按此策略 {agent.days} 个交易日总收益换算</div>
            <div className={`num text-[22px] font-extrabold ${agent.totalReturn >= 0 ? "up" : "down"}`}>
              ¥{finalValue.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
              <span className="ml-2 align-middle text-[13px]">({fmtPct(agent.totalReturn)})</span>
            </div>
          </div>
          <div className="max-w-[240px] text-[11px] leading-relaxed text-ink-3">
            模拟收益换算，仅作展示——历史业绩不代表未来表现，不构成投资建议。
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <Link
            href={`/portfolio?follow=${agent.id}&capital=${invest}`}
            className="rounded bg-accent px-4 py-2 text-[13px] font-bold text-accent-ink transition-colors hover:opacity-90"
          >
            一键跟投 ¥{invest.toLocaleString("zh-CN")}
          </Link>
          <span className="text-[11.5px] text-ink-3">
            拿虚拟资金跟随它的持仓与收益，随时可同步调仓 / 取消
          </span>
        </div>
      </div>

      {/* 预期收益区间（真实对照分布，68% 区间 + 全范围） */}
      <div className="mt-4 border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[13px] font-bold">预期收益（对照 {r.runs - 1} 条独立随机行情重跑）</div>
          <div className="num text-[11px] text-ink-3">DISTRIBUTION OF {r.runs - 1} ALTERNATE RUNS</div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <div className="text-[11px] text-ink-3">对照均值</div>
            <div className={`num text-[22px] font-extrabold ${r.meanReturn >= 0 ? "up" : "down"}`}>
              {fmtPct(r.meanReturn)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-ink-3">68% 区间（均值 ± 1σ）</div>
            <div className="num text-[22px] font-extrabold">
              <span className={expLo >= 0 ? "up" : "down"}>{fmtPct(expLo)}</span>
              <span className="text-ink-3"> ~ </span>
              <span className={expHi >= 0 ? "up" : "down"}>{fmtPct(expHi)}</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-ink-3">全范围（min ~ max）</div>
            <div className="num text-[15px] font-bold">
              <span className={r.minReturn >= 0 ? "up" : "down"}>{fmtPct(r.minReturn)}</span>
              <span className="text-ink-3"> ~ </span>
              <span className={r.maxReturn >= 0 ? "up" : "down"}>{fmtPct(r.maxReturn)}</span>
              <span className="ml-2 text-[11px] font-normal text-ink-3">
                榜单 {fmtPct(r.baselineReturn)} 处于 {r.percentile}% 分位
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div
            className="h-full bg-success/70"
            style={{
              width: `${Math.max(2, ((r.meanReturn - r.minReturn) / Math.max(0.01, r.maxReturn - r.minReturn)) * 100)}%`,
            }}
          />
          <i className="sr-only">对照收益分布区间示意</i>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
          同一策略在 {r.runs - 1} 条独立随机行情下重跑后的真实分布：约 68% 的场景收益落在均值 ± 1σ 区间内。
          榜单成绩只是其中一个样本，请以区间而非单一数字判断预期。模拟业绩不代表未来真实收益。
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        {/* left */}
        <div className="flex flex-col gap-4">
          <Section no="01" title="策略逻辑（公开 Prompt）">
            <pre className="term p-4">{agent.prompt}</pre>
            <div className="mt-3 border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-[12.5px] text-warning">
              <b>⚠ 风控护栏：</b>
              {agent.guard}
            </div>
          </Section>

          <Section no="02" title="AI 决策日志（全透明）">
            <div className="flex flex-col">
              {agent.log.map((d, i) => (
                <div key={i} className="flex gap-3 border-b border-line/70 py-3 last:border-0">
                  <span
                    className={`flex w-14 flex-none items-center justify-center rounded text-[11px] font-extrabold ${actCls(
                      d.action
                    )}`}
                  >
                    {d.action}
                  </span>
                  <div>
                    <div className="num text-[11.5px] text-ink-3">{d.time}</div>
                    <div className="text-[13px]">{d.text}</div>
                    <div className="mt-0.5 text-[11.5px] text-ink-3">{d.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* right */}
        <div className="flex flex-col gap-4">
          <Section no="03" title={`风险分构成（${agent.riskScore}/100）`}>
            <div className="flex flex-col gap-2.5">
              {agent.riskBreakdown.map((p) => (
                <div key={p.key}>
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="font-semibold">{p.label}</span>
                    <span className="num text-ink-2">
                      权重 {(p.weight * 100).toFixed(0)}% · 风险 {(p.risk * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="riskbar mt-1">
                    <i
                      className="block h-full"
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

          <Section no="04" title="收益归因">
            <div className="space-y-2.5">
              {agent.attribution.byBucket.map((b) => (
                <div key={b.key}>
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="font-semibold">{b.label}</span>
                    <span className="num" style={{ color: b.value >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                      {b.value >= 0 ? "+" : ""}
                      {b.value.toFixed(1)}%
                    </span>
                  </div>
                  <div className="riskbar mt-1">
                    <i
                      className="block h-full"
                      style={{
                        width: `${Math.min(100, (Math.abs(b.value) / attrScale) * 100)}%`,
                        background: b.value >= 0 ? "var(--color-success)" : "var(--color-danger)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 border border-line bg-surface-2 px-3 py-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-semibold">运气占比</span>
                <span className="num text-ink-2">{(agent.attribution.luckShare * 100).toFixed(0)}%</span>
              </div>
              <div className="riskbar mt-1">
                <i
                  className="block h-full"
                  style={{ width: `${agent.attribution.luckShare * 100}%`, background: "var(--color-warning)" }}
                />
              </div>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">{agent.attribution.note}</p>
            <p className="mt-1 text-[11px] text-ink-3">
              总收益 {fmtPct(agent.totalReturn)} = 基准β + 行业 + 选股 + 择时；运气占比越低，收益越可复现。
            </p>
          </Section>

          <Section no="05" title="反过拟合认证">
            <div className="flex items-center justify-between">
              <span className={`rounded px-2.5 py-1 text-[12.5px] font-bold ${robCls(agent.robustness.label)}`}>
                {agent.robustness.label}
              </span>
              <div className="text-right">
                <div className="num text-[22px] font-extrabold" style={{ color: riskColor(agent.robustness.stabilityScore) }}>
                  {agent.robustness.stabilityScore}
                </div>
                <div className="text-[11px] text-ink-2">稳健度 / 100</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2.5 text-[12.5px]">
              <Mini label="跨行情胜率" value={`${(agent.robustness.winRate * 100).toFixed(0)}%`} />
              <Mini label="基准分位" value={`${agent.robustness.percentile}%`} />
              <Mini label="对照均值" value={fmtPct(agent.robustness.meanReturn)} />
              <Mini label="对照波动" value={fmtPct(agent.robustness.stdReturn)} />
            </div>

            <div className="mt-3 flex h-16 items-end gap-1">
              {agent.robustness.altReturns.map((x, i) => {
                const maxAbs = Math.max(1, ...agent.robustness.altReturns.map(Math.abs));
                const isBase = i === 0;
                return (
                  <div
                    key={i}
                    title={`${x >= 0 ? "+" : ""}${x.toFixed(1)}%`}
                    className="flex-1 rounded-sm"
                    style={{
                      height: `${Math.min(100, (Math.abs(x) / maxAbs) * 100)}%`,
                      background: isBase
                        ? "var(--color-accent)"
                        : x >= 0
                          ? "var(--color-success)"
                          : "var(--color-danger)",
                      opacity: isBase ? 1 : 0.75,
                    }}
                  />
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10.5px] text-ink-3">
              <span>① 榜单行情</span>
              <span>
                ②–{agent.robustness.altReturns.length} 对照随机行情（{agent.robustness.runs - 1} 条）
              </span>
            </div>

            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">{agent.robustness.note}</p>
          </Section>

          <Section no="06" title="决策日志存证">
            <div className="flex items-center gap-2">
              <span className="rounded bg-success/12 px-2 py-0.5 text-[12px] font-bold text-success">
                ✓ 已生成内容指纹
              </span>
              <span className="num text-[12px] text-ink-2">SHA-256</span>
            </div>
            <div className="term mt-2 break-all px-3 py-2 text-[11.5px]">{agent.integrityHash}</div>
            <button
              onClick={verify}
              className="mt-2 w-full rounded border border-line bg-surface py-2 text-[13px] font-semibold hover:border-accent/50"
            >
              ﹀ 校验当前日志指纹
            </button>
            {verified !== null && (
              <p className={`mt-2 text-[12px] ${verified ? "text-success" : "text-danger"}`}>
                {verified
                  ? "✓ 校验通过：页面展示的决策日志与存证指纹完全一致，未被篡改。"
                  : "✗ 校验失败：当前展示内容与存证指纹不一致。"}
              </p>
            )}
            <p className="mt-1 text-[11px] text-ink-3">
              指纹由「策略 Prompt + 逐笔决策日志 + 期末持仓」经 SHA-256 计算，任一字段改动都会改变指纹，可用于证明日志未被篡改。（本地演示，未写入公链）
            </p>
          </Section>

          <Section no="07" title="期末持仓 = 当前建议仓位">
            <table className="dtbl">
              <thead>
                <tr>
                  <th>代码</th>
                  <th>名称</th>
                  <th className="text-right">数量</th>
                  <th className="text-right">现价</th>
                  <th className="text-right">仓位</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const totalMv = agent.positions.reduce((s, x) => s + Number(x.mv), 0);
                  return agent.positions.map((p, i) => {
                    const share = totalMv > 0 ? (Number(p.mv) / totalMv) * 100 : 0;
                    return (
                      <tr key={i}>
                        <td className="num font-bold">{p.code}</td>
                        <td>{p.name}</td>
                        <td className="num text-right">{p.qty}</td>
                        <td className="num text-right">{p.price}</td>
                        <td className="num text-right">{share.toFixed(0)}%</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
            <p className="mt-2 text-[11.5px] text-ink-3">
              引擎在 360 个交易日末的真实持仓，即该策略「当前会怎么做」的建议仓位（模拟撮合，非投资建议）。
            </p>
          </Section>

          <Section no="08" title="验证协议">
            <div className="text-[13px] text-ink-2">
              <div className="mt-1">
                <b>说明：</b>
                {tierDesc[agent.tier]}
              </div>
              <div className="mt-1">
                <b>反前瞻：</b>策略仅可访问≤当前时间的行情，杜绝偷看未来。
              </div>
              {agent.engine === "sandbox" && (
                <div className="mt-1">
                  <b>回测环境：</b>策略在 zmzai-sandbox 隔离沙箱中执行，成交含手续费 / 滑点 / 涨跌停约束，
                  结果可复现、可审计{agent.sandboxRunId ? `（Run ${agent.sandboxRunId}）` : ""}。
                </div>
              )}
              {agent.engine === "local" && (
                <div className="mt-1">
                  <b>回测环境：</b>由平台本地引擎生成（与沙箱同一份源码，成交同样含手续费 / 滑点 / 涨跌停约束），
                  结果可复现；沙箱可用时新创建的策略将升级为隔离沙箱回测。
                </div>
              )}
            </div>
            <Link
              href={`/create?fork=${agent.id}`}
              className="mt-3.5 block w-full rounded border border-line bg-surface py-2.5 text-center text-[13px] font-semibold hover:border-accent/50"
            >
              ⑂ Fork 这个策略
            </Link>
          </Section>

          <Section no="09" title="黑天鹅抗压">
            <div className="flex flex-col gap-3">
              {STRESS_SCENARIOS.map((scn) => {
                const s = agent.stress[scn.id];
                if (!s) return null;
                return (
                  <div key={scn.id} className="border border-line bg-surface-2 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold">{scn.name}</div>
                        <div className="text-[11.5px] text-ink-2">{scn.period}</div>
                      </div>
                      <span className={`rounded px-2 py-0.5 text-[11.5px] font-bold ${stressCls(s.status)}`}>
                        {s.status}
                        {s.survived ? " · 存活" : " · 出局"}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-4 text-[13px]">
                      <div>
                        <span className="text-ink-2">压力收益 </span>
                        <b className={`num ${s.totalReturn >= 0 ? "up" : "down"}`}>{fmtPct(s.totalReturn)}</b>
                      </div>
                      <div>
                        <span className="text-ink-2">最大回撤 </span>
                        <b className="num down">{fmtPct(s.maxDD)}</b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      </div>

      <p className="mt-6 text-center text-[12px] text-ink-2">A股行情为真实日K（前复权，截至 {marketMeta.lastTradeDate}）；美股/加密为模拟行情。历史表现不代表未来收益，不构成投资建议。</p>
    </div>
  );
}

function Kpi({
  v,
  l,
  cls,
  style,
  hint,
}: {
  v: string;
  l: string;
  cls?: string;
  style?: CSSProperties;
  hint?: string;
}) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <div className={`num text-[20px] font-extrabold ${cls ?? ""}`} style={style}>
        {v}
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-2">
        {l}
        {hint && <TermHint termKey={hint} />}
      </div>
    </div>
  );
}

function Section({ no, title, children }: { no: string; title: string; children: ReactNode }) {
  return (
    <div className="border border-line bg-surface p-4">
      <h3 className="mb-3 flex items-baseline gap-2 text-[14.5px] font-extrabold">
        <span className="num text-[11px] font-bold text-ink-3">{no}</span>
        {title}
      </h3>
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

function robCls(l: RobustnessLabel): string {
  switch (l) {
    case "稳健":
      return "bg-success/12 text-success";
    case "过拟合嫌疑":
      return "bg-danger/15 text-danger";
    default:
      return "bg-warning/15 text-warning";
  }
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line bg-surface-2 px-3 py-2">
      <div className="text-[11px] text-ink-2">{label}</div>
      <div className="num mt-0.5 font-bold">{value}</div>
    </div>
  );
}

/** 净值 vs 沪深300 同期归一化叠加曲线（收益 %，起点 0） */
function NavVsBench({ nav }: { nav: number[] }) {
  const W = 760;
  const H = 200;
  const PAD = { l: 42, r: 10, t: 8, b: 20 };
  const bench = REAL_INDEXES[BENCH_INDEX];
  // 基准与策略同窗口：行情窗口末 MARKET_DAYS 根中的前 n 根（与引擎 simDays 窗口对齐，非末 n 根）
  const aligned = bench ? bench.slice(-MARKET_DAYS) : null;
  const n = Math.min(nav.length, aligned?.length ?? nav.length);
  const navRet = nav.slice(0, n).map((v) => (v / nav[0] - 1) * 100);
  const benchRet = aligned
    ? aligned.slice(0, n).map((b) => (b[2] / aligned[0][2] - 1) * 100)
    : [];
  if (navRet.length < 2 || benchRet.length < 2) return null;
  const all = [...navRet, ...benchRet, 0];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const cw = W - PAD.l - PAD.r;
  const ch = H - PAD.t - PAD.b;
  const xOf = (i: number) => PAD.l + (i / (navRet.length - 1)) * cw;
  const yOf = (v: number) => PAD.t + ch - ((v - min) / span) * ch;
  const line = (vals: number[], stroke: string, dash?: string) => (
    <path
      d={vals.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ")}
      fill="none"
      stroke={stroke}
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeDasharray={dash}
    />
  );
  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="策略净值与沪深300对比曲线">
        {/* 0 收益基线 + 网格 */}
        <line x1={PAD.l} y1={yOf(0)} x2={W - PAD.r} y2={yOf(0)} stroke="var(--color-line)" strokeWidth="1" />
        {[0.25, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD.l}
            y1={PAD.t + ch * f}
            x2={W - PAD.r}
            y2={PAD.t + ch * f}
            stroke="var(--color-line)"
            strokeWidth="0.75"
          />
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = min + span * (1 - f);
          return (
            <text
              key={f}
              x={PAD.l - 6}
              y={PAD.t + ch * f + 3.5}
              textAnchor="end"
              fontSize="10"
              fill="var(--color-ink-3)"
              className="num"
            >
              {v >= 0 ? "+" : ""}
              {v.toFixed(0)}%
            </text>
          );
        })}
        {line(benchRet, "var(--color-ink-3)", "5 4")}
        {line(navRet, "var(--color-accent)")}
        <text x={PAD.l} y={H - 6} fontSize="10" fill="var(--color-ink-3)" className="num">
          起点
        </text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize="10" fill="var(--color-ink-3)" className="num">
          第 {n} 日
        </text>
        <circle cx={xOf(navRet.length - 1)} cy={yOf(navRet[navRet.length - 1])} r="3" fill="var(--color-accent)" />
        <circle cx={xOf(benchRet.length - 1)} cy={yOf(benchRet[benchRet.length - 1])} r="2.5" fill="var(--color-ink-3)" />
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-4 text-[11px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <i className="h-0.5 w-4 bg-[var(--color-accent)]" /> 本策略净值
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-0.5 w-4 border-t-2 border-dashed border-[var(--color-ink-3)]" /> {BENCH_INDEX_NAME}
        </span>
      </div>
    </div>
  );
}
