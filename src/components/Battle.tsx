"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { agents as STATIC_AGENTS, type Agent } from "@/data/agents";
import { loadUserAgents } from "@/lib/userAgents";
import { fmtPct, riskColor, engineBadge, engineCls } from "@/lib/format";
import type { Metrics } from "@/sim/metrics";

// 对决擂台：2~6 名 Agent 在「同一段新行情（同 seed + 同周期）」上重跑，
// 比逐日净值曲线、总收益、夏普、回撤——公平竞技，结果可复现（同 seed）。

interface BattleParticipant {
  id: number;
  name: string;
  emoji: string;
  style: string;
  cfg?: Agent["cfg"];
  simDays?: number;
}

interface BattleResult {
  seed: number;
  simDays: number;
  participants: {
    id: number;
    name: string;
    emoji: string;
    style: string;
    engine: string;
    runId: string | null;
    nav: number[];
    metrics: Metrics;
  }[];
  ranking: { id: number; rank: number }[];
}

const SERIES_COLORS = [
  "var(--color-accent)",
  "var(--color-warning)",
  "var(--color-danger)",
  "var(--color-success)",
  "var(--color-ink-3)",
  "var(--color-accent-strong)",
];

const SS_KEY = "zmzai_arena_battle_result_v1";

export function Battle() {
  const sp = useSearchParams();
  const pickId = Number(sp.get("pick") || 0);

  const candidates = useMemo<BattleParticipant[]>(() => {
    const statics: BattleParticipant[] = STATIC_AGENTS.filter((a) => a.cfg).map((a) => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji,
      style: a.style,
      cfg: a.cfg,
      simDays: a.simDays ?? a.days,
    }));
    const mine: BattleParticipant[] = loadUserAgents()
      .filter((a) => a.cfg)
      .map((a) => ({ id: a.id, name: a.name, emoji: a.emoji, style: a.style, cfg: a.cfg, simDays: a.simDays ?? a.days }));
    // 预选 id 排最前，其余按夏普降序
    return [...statics, ...mine].sort((a, b) => {
      if (a.id === pickId) return -1;
      if (b.id === pickId) return 1;
      return 0;
    });
  }, [pickId]);

  const [picked, setPicked] = useState<Set<number>>(() => (pickId ? new Set([pickId]) : new Set()));
  const [state, setState] = useState<"pick" | "running" | "done" | "need-pro">("pick");
  const [needPro, setNeedPro] = useState<"quota" | "sim-days">("quota");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BattleResult | null>(null);

  // 结果存 sessionStorage：刷新不丢（页面级状态，不跨会话）
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (raw) setResult(JSON.parse(raw) as BattleResult);
    } catch {
      // 损坏数据忽略
    }
  }, []);
  useEffect(() => {
    try {
      if (result) sessionStorage.setItem(SS_KEY, JSON.stringify(result));
      else sessionStorage.removeItem(SS_KEY);
    } catch {
      // 存储满静默
    }
  }, [result]);

  const toggle = (id: number) => {
    if (state !== "pick") return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const battle = async () => {
    const list = candidates.filter((c) => picked.has(c.id));
    if (list.length < 2 || state === "running") return;
    setState("running");
    setError(null);
    try {
      const res = await fetch("/api/arena/battle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          participants: list.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, style: p.style, cfg: p.cfg, simDays: p.simDays })),
        }),
      });
      const data = await res.json();
      if (res.status === 402) {
        // 两种 402：周期超限（UPGRADE_REQUIRED）与配额用完（QUOTA_EXCEEDED），文案需区分
        setState("need-pro");
        setNeedPro(data.code === "UPGRADE_REQUIRED" ? "sim-days" : "quota");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "对决失败，请稍后再试");
        setState("pick");
        return;
      }
      setResult(data.battle);
      setState("done");
    } catch {
      setError("网络异常，对决未能开始");
      setState("pick");
    }
  };

  const winner = useMemo(() => {
    if (!result || result.ranking.length === 0) return null;
    const w = result.ranking[0];
    return result.participants.find((p) => p.id === w.id) ?? null;
  }, [result]);

  const resetPick = () => {
    setResult(null);
    setPicked(new Set());
    setState("pick");
  };

  return (
    <div className="mt-6">
      {/* 标题 + 规则 */}
      <div className="border-b border-line pb-4">
        <h1 className="text-[22px] font-extrabold tracking-tight">对决擂台</h1>
        <p className="mt-1.5 max-w-[640px] text-[13px] leading-relaxed text-ink-3">
          选 2~6 名策略同场竞技：所有参赛者在<b className="text-ink-2">同一段新行情</b>（同随机种子、同周期）上重跑，
          比逐日净值曲线与收益风险指标——公平对决，结果可复现。每场消耗 1 次回测配额。
        </p>
      </div>

      {state === "need-pro" ? (
        <div className="mt-6 rounded border border-warning/40 bg-warning/8 px-4 py-3 text-[13px]">
          {needPro === "sim-days" ? (
            <>
              <b className="text-warning">回测周期超限</b>
              <span className="ml-2 text-ink-2">
                当前所选策略最长回测 {120} 个交易日，本场对决需要统一周期。升级 Pro 最长回测 500 天，随时开战。
              </span>
            </>
          ) : (
            <>
              <b className="text-warning">回测额度已用完</b>
              <span className="ml-2 text-ink-2">
                （Free 每月 3 次沙箱回测，对决同样消耗配额）。升级 Pro 解锁无限回测，随时开战。
              </span>
            </>
          )}
          <Link href="/pricing" className="ml-2 font-bold text-accent hover:underline">
            查看 Pro 权益 →
          </Link>
        </div>
      ) : (
        <>
          {/* 选人网格 */}
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink-3">
                参赛者（已选 {picked.size} / 2~6）
              </h2>
              <span className="text-[11.5px] text-ink-3">我的策略与官方策略均可参赛</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {candidates.map((c) => {
                const sel = picked.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    className={`flex items-center gap-2.5 rounded border px-3 py-2.5 text-left transition-colors ${
                      sel
                        ? "border-accent bg-accent/8"
                        : "border-line bg-surface hover:border-accent/50"
                    }`}
                  >
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded bg-surface-2 text-[16px]">
                      {c.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-bold">{c.name}</span>
                        {sel && <span className="text-[11px] font-bold text-accent">✓</span>}
                      </span>
                      <span className="block truncate text-[11.5px] text-ink-3">
                        {c.style} · {c.simDays} 天
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {candidates.length < 2 && (
              <p className="mt-3 text-[12.5px] text-ink-3">
                可参赛策略不足 2 个（需有存档配置）。去
                <Link href="/create" className="font-bold text-accent hover:underline"> 创建策略 </Link>
                后即可对战。
              </p>
            )}
          </div>

          {/* 开战 */}
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={battle}
              disabled={picked.size < 2 || state === "running"}
              className="rounded bg-accent px-6 py-2.5 text-[14px] font-extrabold text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {state === "running" ? "同场回测中…" : "⚔ 开始对决"}
            </button>
            {state === "running" && (
              <span className="text-[12.5px] text-ink-3">全员在同一段新行情上重跑，约需 10~30 秒</span>
            )}
          </div>
          {error && <p className="mt-3 text-[12.5px] font-semibold text-danger">{error}</p>}

          {/* 结果 */}
          {result && state !== "pick" && (
            <BattleResultView result={result} winner={winner} onRematch={battle} onReset={resetPick} />
          )}
        </>
      )}
    </div>
  );
}

function BattleResultView({
  result,
  winner,
  onRematch,
  onReset,
}: {
  result: BattleResult;
  winner: BattleResult["participants"][number] | null;
  onRematch: () => void;
  onReset: () => void;
}) {
  return (
    <div className="mt-8">
      {/* 胜者 banner */}
      {winner && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-accent/40 bg-accent/8 px-4 py-3">
          <span className="text-[15px] font-extrabold text-accent">胜者：{winner.emoji} {winner.name}</span>
          <span className={`num text-[13px] font-bold ${winner.metrics.totalReturn >= 0 ? "up" : "down"}`}>
            {fmtPct(winner.metrics.totalReturn)}
          </span>
          <span className="ml-auto text-[11.5px] text-ink-3">
            seed {result.seed} · {result.simDays} 个交易日 · 同场同行情
          </span>
        </div>
      )}

      {/* 净值曲线对比 */}
      <CurveChart result={result} />

      {/* 排名表 */}
      <div className="mt-4 overflow-x-auto">
        <table className="dtbl min-w-[680px]">
          <thead>
            <tr>
              <th>#</th>
              <th>策略</th>
              <th>风格</th>
              <th className="text-right">总收益</th>
              <th className="text-right">最大回撤</th>
              <th className="text-right">夏普</th>
              <th className="text-right">风险分</th>
            </tr>
          </thead>
          <tbody>
            {result.ranking.map((r) => {
              const p = result.participants.find((x) => x.id === r.id)!;
              const color = SERIES_COLORS[(r.rank - 1) % SERIES_COLORS.length];
              return (
                <tr key={p.id}>
                  <td className="num font-extrabold">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: color }} />
                    #{r.rank}
                  </td>
                  <td>
                    <Link href={`/agents/${p.id}`} className="group flex items-center gap-2.5">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded bg-surface-2 text-[16px]">
                        {p.emoji}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <span className="truncate group-hover:text-accent">{p.name}</span>
                          {p.engine && (
                            <span className={`rounded px-1.5 py-px text-[10px] font-bold ${engineCls(p.engine as "sandbox" | "local")}`}>
                              {engineBadge(p.engine as "sandbox" | "local")}
                            </span>
                          )}
                        </span>
                        {p.runId && <span className="num block truncate text-[11px] text-ink-3">Run {p.runId}</span>}
                      </span>
                    </Link>
                  </td>
                  <td>
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold">{p.style}</span>
                  </td>
                  <td className={`num text-right ${p.metrics.totalReturn >= 0 ? "up" : "down"}`}>
                    {fmtPct(p.metrics.totalReturn)}
                  </td>
                  <td className={`num text-right ${p.metrics.maxDD >= 0 ? "up" : "down"}`}>{fmtPct(p.metrics.maxDD)}</td>
                  <td className="num text-right font-extrabold">{p.metrics.sharpe.toFixed(2)}</td>
                  <td className="text-right">
                    <span className="riskbar inline-block w-14 align-middle">
                      <i
                        className="block h-full"
                        style={{ width: `${p.metrics.riskScore}%`, background: riskColor(p.metrics.riskScore) }}
                      />
                    </span>
                    <span className="num ml-2">{p.metrics.riskScore}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <button
          onClick={onRematch}
          className="rounded border border-accent/50 px-5 py-2 text-[13px] font-bold text-accent transition-colors hover:bg-accent/10"
        >
          ⟳ 再战一场（新行情）
        </button>
        <button
          onClick={onReset}
          className="rounded border border-line px-5 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-accent/50"
        >
          重新选人
        </button>
        <span className="text-[11.5px] text-ink-3">再战沿用当前选手并生成新行情；重新选人回到参赛者选择</span>
      </div>
    </div>
  );
}

/** 逐日净值对比曲线：SVG 手绘，归一化到起始 100 */
function CurveChart({ result }: { result: BattleResult }) {
  const W = 820;
  const H = 260;
  const PAD = { l: 52, r: 16, t: 16, b: 30 };

  const series = useMemo(() => {
    // 归一化：nav[0] = 100
    return result.participants.map((p) => ({
      id: p.id,
      name: p.name,
      color: SERIES_COLORS[result.ranking.findIndex((r) => r.id === p.id) % SERIES_COLORS.length],
      pts: p.nav.map((v, i) => ({ x: i, y: (v / p.nav[0]) * 100 })),
    }));
  }, [result]);

  const { minY, maxY } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const s of series) {
      for (const pt of s.pts) {
        min = Math.min(min, pt.y);
        max = Math.max(max, pt.y);
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { minY: 90, maxY: 110 };
    const pad = Math.max((max - min) * 0.12, 2);
    return { minY: min - pad, maxY: max + pad };
  }, [series]);

  const xOf = (i: number, n: number) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
  const yOf = (v: number) => PAD.t + ((maxY - v) / (maxY - minY)) * (H - PAD.t - PAD.b);

  const maxN = Math.max(...series.map((s) => s.pts.length));
  const midLabel = Math.round(maxN / 2);
  const lastDay = series[0]?.pts.length ?? 0;

  return (
    <div className="mt-5 rounded border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
        <span className="text-[12px] font-bold uppercase tracking-wider text-ink-3">同场净值曲线（起点 = 100）</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {result.ranking.map((r) => {
            const p = result.participants.find((x) => x.id === r.id)!;
            return (
              <span key={p.id} className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
                <i className="h-0.5 w-4 rounded-full" style={{ background: SERIES_COLORS[(r.rank - 1) % SERIES_COLORS.length] }} />
                <b>{p.name}</b>
                <span className="num text-ink-3">#{r.rank}</span>
              </span>
            );
          })}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="对决净值曲线对比">
        {/* 基准线 100 */}
        <line x1={PAD.l} y1={yOf(100)} x2={W - PAD.r} y2={yOf(100)} stroke="var(--color-line)" strokeDasharray="4 4" strokeWidth="1" />
        <text x={PAD.l - 6} y={yOf(100) + 3.5} textAnchor="end" fontSize="10" fill="var(--color-ink-3)">100</text>
        {/* 首尾标签 */}
        <text x={PAD.l} y={H - 8} fontSize="10" fill="var(--color-ink-3)">第 1 日</text>
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-ink-3)">第 {midLabel} 日</text>
        <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize="10" fill="var(--color-ink-3)">第 {lastDay} 日</text>
        {/* 曲线 */}
        {series.map((s) => {
          const d = s.pts.map((pt, i) => `${i === 0 ? "M" : "L"}${xOf(pt.x, s.pts.length).toFixed(1)},${yOf(pt.y).toFixed(1)}`).join(" ");
          return (
            <path
              key={s.id}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity="0.95"
            />
          );
        })}
      </svg>
    </div>
  );
}
