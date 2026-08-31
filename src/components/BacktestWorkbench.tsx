"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { StrategyConfig } from "@/sim/strategies";
import type { Attribution } from "@/sim/attribution";
import type { Metrics } from "@/sim/metrics";
import type { RobustnessCert } from "@/sim/robustness";
import type { RawDecision } from "@/sim/engine";
import { PageHeader } from "@zmzai/theme";

export interface InstrumentOption {
  code: string;
  name: string;
  market: string;
  board: string;
}

export interface AgentPreset {
  id: number;
  emoji: string;
  name: string;
  style: string;
  market: string;
  simDays: number;
  cfg: StrategyConfig;
}

interface Snapshot {
  symbols: string[];
  days: number;
  from: string | null;
  to: string | null;
}

interface BacktestResponse {
  engine: "sandbox" | "local";
  runId?: string | null;
  note?: string | null;
  dataSource?: "sim" | "real";
  simDays?: number;
  snapshot?: Snapshot | null;
  result: {
    nav: number[];
    positions: { code: string; name: string; qty: string; price: string; mv: string }[];
    decisions: RawDecision[];
    metrics: Metrics;
    attribution: Attribution;
    robustness: RobustnessCert;
  };
}

const SIM_DAYS_OPTIONS = [60, 120, 252];
const MAX_SYMBOLS = 8;

export function BacktestWorkbench({
  presets,
  instruments,
}: {
  presets: AgentPreset[];
  instruments: InstrumentOption[];
}) {
  const [dataSource, setDataSource] = useState<"sim" | "real">("sim");
  const [presetId, setPresetId] = useState(presets[0]?.id ?? 1);
  const [simDays, setSimDays] = useState(120);
  const [symbols, setSymbols] = useState<string[]>(["600519", "300750", "BTC"]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needPro, setNeedPro] = useState(false);
  const [data, setData] = useState<BacktestResponse | null>(null);

  const preset = presets.find((p) => p.id === presetId) ?? presets[0];

  // real 模式只支持 A股 + 加密（美股/港股源二期）
  const pool = useMemo(
    () => instruments.filter((i) => i.market === "A股" || i.market === "加密"),
    [instruments],
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    const hit = q
      ? pool.filter((i) => i.code.includes(q) || i.name.includes(q) || i.name.toLowerCase().includes(q.toLowerCase()))
      : pool;
    return hit.slice(0, 60);
  }, [pool, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, InstrumentOption[]>();
    for (const i of filtered) {
      const key = i.market === "A股" ? i.board : i.market;
      const list = map.get(key) ?? [];
      list.push(i);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const toggleCode = (code: string) => {
    setSymbols((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : prev.length >= MAX_SYMBOLS
          ? prev
          : [...prev, code],
    );
  };

  async function run() {
    if (!preset) return;
    if (dataSource === "real" && symbols.length === 0) {
      setError("实盘回测请先选择至少 1 个标的");
      return;
    }
    setBusy(true);
    setError(null);
    setNeedPro(false);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cfg: preset.cfg,
          simDays,
          dataSource,
          ...(dataSource === "real" ? { symbols } : {}),
        }),
        cache: "no-store",
      });
      const json = (await res.json()) as BacktestResponse & { code?: string; error?: string };
      if (res.status === 402) {
        setNeedPro(true);
        setError(json.error ?? "回测额度不足");
        return;
      }
      if (!res.ok) {
        setError(json.error ?? `回测失败（${res.status}）`);
        return;
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络异常，请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  const real = data?.dataSource === "real";

  return (
    <div className="py-10">
      <PageHeader
        eyebrow="arena · backtest"
        icon="activity"
        title="回测工作台"
        description={
          <>
            用官方智能体的策略配置跑一次回测。<b>仿真</b>用本地种子化行情（可复现，与竞技场同口径）；
            <b>实盘</b>用 zmzai-data 拉真实日线冻结成快照后跑同一套引擎（含手续费 / 滑点 / 涨跌停约束）。
          </>
        }
      />

      {/* ---- 配置区 ---- */}
      <section className="mt-6 border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold">数据源</span>
          {(["sim", "real"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setDataSource(k)}
              className={`rounded border px-3 py-1.5 text-[13px] transition-colors ${
                dataSource === k
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-line text-ink-2 hover:border-line-strong"
              }`}
            >
              {k === "sim" ? "仿真行情" : "实盘行情"}
            </button>
          ))}
          <span className="ml-auto text-[11.5px] text-ink-3">
            {dataSource === "sim"
              ? "默认模式：结果与竞技场榜单同口径，多次运行完全一致"
              : "真实日线（A股 Tushare / 加密 Binance），一次回测一份冻结快照"}
          </span>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <div className="text-[13px] font-semibold">策略（官方智能体）</div>
            <select
              value={preset?.id ?? ""}
              onChange={(e) => setPresetId(Number(e.target.value))}
              className="mt-2 w-full rounded border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink"
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.name} · {p.style}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11.5px] text-ink-3">
              沿用该智能体的风格与风控护栏；v1 实盘回测只支持官方智能体（用户智能体存在本地，服务端无法还原）。
            </p>
          </div>

          <div>
            <div className="text-[13px] font-semibold">回测周期（交易日）</div>
            <div className="mt-2 flex gap-2">
              {SIM_DAYS_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setSimDays(d)}
                  className={`rounded border px-3 py-1.5 text-[13px] transition-colors ${
                    simDays === d ? "border-accent bg-accent text-accent-ink" : "border-line text-ink-2 hover:border-line-strong"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-3">Free 计划最长 120 交易日，Pro 最长 500。</p>
          </div>
        </div>

        {dataSource === "real" && (
          <div className="mt-5 border-t border-line pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-[13px] font-semibold">
                标的（已选 <span className="num">{symbols.length}</span> / {MAX_SYMBOLS}）
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索代码或名称"
                className="w-48 rounded border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink placeholder:text-ink-3"
              />
            </div>
            <div className="mt-3 max-h-56 overflow-y-auto rounded border border-line bg-surface-2 p-3">
              {query ? (
                <div className="flex flex-wrap gap-1.5">
                  {filtered.map((i) => (
                    <Chip key={i.code} opt={i} on={symbols.includes(i.code)} onToggle={toggleCode} />
                  ))}
                  {filtered.length === 0 && <span className="text-[12px] text-ink-3">没有匹配的标的</span>}
                </div>
              ) : (
                grouped.map(([group, list]) => (
                  <div key={group} className="mb-3 last:mb-0">
                    <div className="mb-1.5 text-[11px] tracking-wide text-ink-3">
                      {group} · {list.length}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((i) => (
                        <Chip key={i.code} opt={i} on={symbols.includes(i.code)} onToggle={toggleCode} />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-3">
              A股 6 位代码走 Tushare，BTC / ETH 等走 Binance USDT 现货；A股 + 加密可混选（按并集日历对齐）。
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={run}
            disabled={busy}
            className="rounded bg-accent px-5 py-2.5 text-[14px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "回测中…" : dataSource === "real" ? "▶ 实盘回测" : "▶ 开始回测"}
          </button>
          <span className="text-[11.5px] text-ink-3">实盘与仿真共用同一份 Free / Pro 回测额度</span>
        </div>

        {error && (
          <div className="mt-4 border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-[12.5px] text-warning">
            <span>{error}</span>
            {needPro && (
              <Link href="/pricing" className="ml-2 font-semibold underline underline-offset-2">
                查看 Pro 权益 →
              </Link>
            )}
          </div>
        )}
      </section>

      {/* ---- 结果区 ---- */}
      {data && (
        <ResultView data={data} real={real} />
      )}
    </div>
  );
}

function Chip({
  opt,
  on,
  onToggle,
}: {
  opt: InstrumentOption;
  on: boolean;
  onToggle: (code: string) => void;
}) {
  return (
    <button
      onClick={() => onToggle(opt.code)}
      className={`rounded border px-2 py-1 text-[12px] transition-colors ${
        on ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong"
      }`}
    >
      {opt.name}
      <span className="num ml-1 text-[10.5px] opacity-60">{opt.code}</span>
    </button>
  );
}

function ResultView({ data, real }: { data: BacktestResponse; real: boolean }) {
  const m = data.result.metrics;
  const attr = data.result.attribution;
  const rob = data.result.robustness;
  const snap = data.snapshot;

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold">
          回测结果
          <span className="ml-2 rounded-sm border border-line px-1.5 py-0.5 text-[11px] font-normal text-ink-3">
            {real ? "真实行情快照" : "仿真行情"} · engine={data.engine}
          </span>
        </h2>
        {snap && (
          <p className="num text-[11.5px] text-ink-3">
            {snap.from && snap.to ? `${snap.from} → ${snap.to}` : "快照"} · {snap.days} 交易日 ·{" "}
            {snap.symbols.join(" / ")}
          </p>
        )}
      </div>

      {data.note && <p className="mt-2 text-[12px] text-ink-3">{data.note}</p>}

      <div className="mt-3 grid grid-cols-2 divide-x divide-y divide-line border border-line sm:grid-cols-4">
        <Kpi v={fmtPct(m.totalReturn)} l="总收益" cls={m.totalReturn >= 0 ? "up" : "down"} />
        <Kpi v={fmtPct(m.maxDD)} l="最大回撤" cls={m.maxDD >= 0 ? "up" : "down"} />
        <Kpi v={m.sharpe.toFixed(2)} l="夏普比率" />
        <Kpi v={String(m.riskScore)} l="风险分 / 100" />
      </div>

      {data.result.nav.length > 1 && (
        <div className="mt-4 border border-line bg-surface p-4">
          <div className="text-[13px] font-bold">净值曲线</div>
          <NavCurve nav={data.result.nav} />
        </div>
      )}

      <div className="mt-4 border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[13px] font-bold">收益归因</div>
          <div className="num text-[11px] text-ink-3">运气占比 {(attr.luckShare * 100).toFixed(0)}%</div>
        </div>
        <div className="mt-3 space-y-2">
          {attr.byBucket.map((b) => (
            <div key={b.key} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-[12px] text-ink-2">{b.label}</span>
              <div className="riskbar flex-1">
                <div
                  className={`h-full ${b.value >= 0 ? "bg-danger" : "bg-success"}`}
                  style={{ width: `${Math.min(100, Math.abs(b.value) * 4)}%` }}
                />
              </div>
              <span className={`num w-16 text-right text-[12px] ${b.value >= 0 ? "up" : "down"}`}>
                {b.value >= 0 ? "+" : ""}
                {b.value.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">{attr.note}</p>
      </div>

      <div className="mt-4 border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[13px] font-bold">反过拟合认证</div>
          <span className="num text-[11px] text-ink-3">
            {rob.label} · 稳健度 {rob.stabilityScore}
          </span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{rob.note}</p>
        {real && (
          <p className="mt-2 border border-line bg-surface-2 px-3 py-2 text-[11.5px] leading-relaxed text-ink-3">
            ⚠ 基于真实行情快照：认证中的 {rob.runs - 1} 条对照行情仍是<b>随机生成</b>的替代路径，
            因此本项只能说明「同一策略在这段真实行情上的收益，在随机行情分布中的位置」，
            <b>不等于</b>穿越不同历史区间的稳健性。压测（黑天鹅）结论同理，均基于这一段快照。
          </p>
        )}
      </div>

      <div className="mt-4 border border-line bg-surface p-4">
        <div className="text-[13px] font-bold">最近决策</div>
        <ul className="mt-2 space-y-1.5">
          {data.result.decisions.slice(-12).reverse().map((d, i) => (
            <li key={`${d.day}-${i}`} className="flex gap-2 text-[12px] leading-relaxed">
              <span className={`num w-12 shrink-0 ${d.action === "BUY" ? "up" : d.action === "SELL" ? "down" : "text-ink-3"}`}>
                D{d.day} {d.action}
              </span>
              <span className="text-ink-2">{d.reason}</span>
            </li>
          ))}
          {data.result.decisions.length === 0 && <li className="text-[12px] text-ink-3">本区间没有产生决策</li>}
        </ul>
      </div>

      <p className="mt-6 text-[12px] text-ink-3">
        回测结果由引擎在{real ? "真实行情快照" : "模拟行情"}上重放得出，含手续费与滑点，历史表现不代表未来收益，不构成投资建议。
      </p>
    </section>
  );
}

function Kpi({ v, l, cls }: { v: string; l: string; cls?: string }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <div className={`num text-[20px] font-extrabold ${cls ?? ""}`}>{v}</div>
      <div className="mt-0.5 text-[12px] text-ink-2">{l}</div>
    </div>
  );
}

function NavCurve({ nav }: { nav: number[] }) {
  const w = 640;
  const h = 160;
  const min = Math.min(...nav);
  const max = Math.max(...nav);
  const span = max - min || 1;
  const pts = nav
    .map((v, i) => `${(i / (nav.length - 1)) * w},${h - ((v - min) / span) * (h - 16) - 8}`)
    .join(" ");
  const up = nav[nav.length - 1] >= nav[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-40 w-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={up ? "var(--color-danger)" : "var(--color-success)"} strokeWidth={1.6} />
    </svg>
  );
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
