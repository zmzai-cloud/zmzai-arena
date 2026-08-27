"use client";

// 大盘指数行情面板：5 大指数真实日 K 行情条 + 点击展开交互走势图（原生 SVG，无图表库）。
// 数据来自 src/data/market-real.ts（fetch-market.mjs 每日拉取），SSR 同步渲染，无网络请求。

import { useMemo, useState } from "react";
import { REAL_INDEXES, REAL_INDEX_NAMES } from "@/data/market-real";
import { indexTrend, BENCH_INDEX_NAME } from "@/sim/index-market";
import type { RealRow } from "@/sim/market";

// 展示顺序：上证 → 深成 → 创业板 → 沪深300（基准）→ 中证500
const INDEX_ORDER = ["sh000001", "sz399001", "sz399006", "sh000300", "sh000905"];

const fmt = (n: number) => n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

// 折线 path：values 归一化到 w×h 画布（留 1px 边距）
function pathOf(values: number[], w: number, h: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - 1 - ((v - min) / span) * (h - 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// 简单均线（用于大图叠加）
function maOf(bars: RealRow[], day: number, n: number): number {
  const start = Math.max(0, day - n + 1);
  let s = 0;
  for (let i = start; i <= day; i++) s += bars[i][2];
  return s / (day - start + 1);
}

export function IndexTicker() {
  const [active, setActive] = useState(INDEX_ORDER[0]);

  const rows = useMemo(
    () =>
      INDEX_ORDER.map((code) => ({
        code,
        name: REAL_INDEX_NAMES[code] ?? code,
        bars: REAL_INDEXES[code],
      })),
    []
  );

  const activeBars = rows.find((r) => r.code === active)?.bars ?? [];
  const lastDate = activeBars.length ? activeBars[activeBars.length - 1][0] : "";
  const trend = activeBars.length >= 60 ? indexTrend(activeBars, activeBars.length - 1) : null;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-extrabold tracking-tight">大盘指数</h2>
          <p className="mt-1 text-[12.5px] text-ink-3">
            真实日 K · 数据源：新浪财经 · 截至 {activeBars.length ? lastDate : "—"}
          </p>
        </div>
        <p className="num text-[11px] tracking-[0.1em] text-ink-3">CN INDICES / REAL DAILY K</p>
      </div>

      {/* 指数行情条：点击切换下方走势图 */}
      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
        {rows.map((r) => {
          const bars = r.bars;
          // 指数拉取允许部分失败，缺失时不渲染该卡片（防整页崩溃）
          if (!bars || bars.length < 2) return null;
          const last = bars[bars.length - 1];
          const prev = bars[bars.length - 2];
          const chg = prev ? last[2] / prev[2] - 1 : 0;
          const spark = bars.slice(-30).map((b) => b[2]);
          const up = chg >= 0;
          return (
            <button
              key={r.code}
              onClick={() => setActive(r.code)}
              className={`bg-surface px-3.5 py-3 text-left transition-colors ${
                active === r.code ? "ring-1 ring-inset ring-accent" : "hover:bg-surface-2"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[12px] font-bold">{r.name}</span>
                {r.code === "sh000300" && (
                  <span className="rounded bg-accent/12 px-1 py-px text-[9.5px] font-bold text-accent">基准</span>
                )}
              </div>
              <div className="num mt-1 flex items-baseline gap-1.5">
                <span className="text-[17px] font-extrabold leading-none">{fmt(last[2])}</span>
                <span className={`num text-[10.5px] font-bold ${up ? "up" : "down"}`}>{pct(chg)}</span>
              </div>
              <svg viewBox="0 0 120 28" className="mt-1.5 h-7 w-full" aria-hidden>
                <path
                  d={pathOf(spark, 120, 28)}
                  fill="none"
                  stroke={up ? "var(--color-accent)" : "var(--color-danger)"}
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          );
        })}
      </div>

      {/* 选中指数走势图：收盘 + MA20 + MA60（最近 120 根） */}
      {activeBars.length >= 60 && (
        <div className="mt-3 border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[14px] font-extrabold">{REAL_INDEX_NAMES[active] ?? active}</span>
              {trend && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${
                    trend.phase === "牛"
                      ? "bg-accent/12 text-accent"
                      : trend.phase === "熊"
                        ? "bg-danger/12 text-danger"
                        : "bg-surface-2 text-ink-2"
                  }`}
                >
                  {trend.phase === "牛" ? "牛市形态" : trend.phase === "熊" ? "熊市形态" : "震荡整理"}
                </span>
              )}
              {active === "sh000300" && (
                <span className="text-[11px] text-ink-3">超额对比基准 {BENCH_INDEX_NAME}</span>
              )}
            </div>
            <div className="num flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
              {trend && (
                <>
                  <span className={trend.ddFrom20 >= 0 ? "up" : "down"}>
                    20日线 {trend.ddFrom20 >= 0 ? "上" : "下"} {(Math.abs(trend.ddFrom20) * 100).toFixed(1)}%
                  </span>
                  <span className={trend.ddFrom60 >= 0 ? "up" : "down"}>
                    60日线 {trend.ddFrom60 >= 0 ? "上" : "下"} {(Math.abs(trend.ddFrom60) * 100).toFixed(1)}%
                  </span>
                </>
              )}
              <span>收盘 {fmt(activeBars[activeBars.length - 1][2])}</span>
            </div>
          </div>

          <Chart bars={activeBars} />
        </div>
      )}
    </div>
  );
}

/** 指数走势大图：收盘 / MA20 / MA60 三线，最近 120 根，右轴标注最新值 */
function Chart({ bars }: { bars: RealRow[] }) {
  const W = 760;
  const H = 200;
  const PAD = { l: 46, r: 10, t: 8, b: 20 };
  const win = bars.slice(-120);
  const closes = win.map((b) => b[2]);
  const ma20 = win.map((_, i) => maOf(win, i, 20));
  const ma60 = win.map((_, i) => maOf(win, i, 60));
  const all = [...closes, ...ma20, ...ma60];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const cw = W - PAD.l - PAD.r;
  const ch = H - PAD.t - PAD.b;

  const xOf = (i: number) => PAD.l + (i / (closes.length - 1)) * cw;
  const yOf = (v: number) => PAD.t + ch - ((v - min) / span) * ch;

  const line = (vals: number[], stroke: string, dash?: string) => (
    <path
      d={vals.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ")}
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeDasharray={dash}
    />
  );

  const ticks = [0, Math.floor(closes.length / 2), closes.length - 1];
  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="指数收盘价与均线走势">
        {/* 网格基线 */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD.l}
            y1={PAD.t + ch * f}
            x2={W - PAD.r}
            y2={PAD.t + ch * f}
            stroke="var(--color-line)"
            strokeWidth="1"
          />
        ))}
        {/* 左轴刻度 */}
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
              {fmt(v)}
            </text>
          );
        })}
        {line(closes, "var(--color-accent)")}
        {line(ma20, "var(--color-warning)", "3 3")}
        {line(ma60, "var(--color-ink-3)", "5 4")}
        {ticks.map((i) => (
          <text
            key={i}
            x={xOf(i)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === closes.length - 1 ? "end" : "middle"}
            fontSize="10"
            fill="var(--color-ink-3)"
            className="num"
          >
            {i === 0 ? "120 日前" : i === closes.length - 1 ? "最新" : `第 ${i + 1} 日`}
          </text>
        ))}
        {/* 最新收盘点 */}
        <circle cx={xOf(closes.length - 1)} cy={yOf(closes[closes.length - 1])} r="3" fill="var(--color-accent)" />
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-4 text-[11px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <i className="h-0.5 w-4 bg-[var(--color-accent)]" /> 收盘
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-0.5 w-4 border-t-2 border-dashed border-[var(--color-warning)]" /> MA20
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-0.5 w-4 border-t-2 border-dashed border-[var(--color-ink-3)]" /> MA60
        </span>
      </div>
    </div>
  );
}
