"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { tierOf, type ConsensusTier, type ConsensusSignal, type SignalsResponse } from "@/lib/signals";

const TIER_META: Record<ConsensusTier, { label: string; bar: string; chip: string }> = {
  high: { label: "高共识", bar: "bg-accent", chip: "bg-accent/12 text-accent" },
  mid: { label: "中共识", bar: "bg-warning", chip: "bg-warning/15 text-warning" },
  low: { label: "观察", bar: "bg-ink-3", chip: "bg-surface-2 text-ink-3" },
};

// AI 共识信号：聚合全体 AI 的当前真实持仓，回答「AI 们集体在看什么」。
// 免费用户可见 TOP3（引流），Pro 解锁全部（付费点）。
export function Signals() {
  const [data, setData] = useState<SignalsResponse | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/signals")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: SignalsResponse) => alive && setData(d))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, []);

  if (err) {
    return (
      <div className="rounded border border-danger/30 bg-danger/5 p-6 text-[13px] text-danger">
        信号加载失败，请稍后重试
      </div>
    );
  }
  if (!data) {
    return <div className="py-10 text-center text-[13px] text-ink-3">信号聚合中…</div>;
  }

  const markets = Array.from(new Set(data.signals.map((s) => s.market)));
  const byMarket: Record<string, number> = {};
  for (const s of data.signals) byMarket[s.market] = (byMarket[s.market] ?? 0) + 1;

  return (
    <div className="space-y-5">
      {/* 概览 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <div className="text-2xl font-black text-ink">{data.total}</div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">个 AI 参与共识</div>
        </div>
        <div>
          <div className="text-2xl font-black text-ink">{data.signals.length + data.locked}</div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">个共识标的</div>
        </div>
        <div className="flex flex-1 flex-wrap justify-end gap-1.5">
          {markets.map((m) => (
            <span key={m} className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink-2">
              {m} ×{byMarket[m]}
            </span>
          ))}
        </div>
      </div>

      {/* 信号列表 */}
      <div className="space-y-2">
        {data.signals.map((s, i) => (
          <SignalRow key={s.code} s={s} rank={i + 1} />
        ))}
      </div>

      {/* 免费锁定卡 */}
      {data.locked > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-dashed border-accent/40 bg-accent/5 px-4 py-3.5">
          <div className="text-[13px]">
            <span className="font-bold text-accent">🔒 {data.locked} 个信号已锁定</span>
            <span className="text-ink-2"> — 升级 Pro 解锁全部共识信号与完整持有者名单</span>
          </div>
          <Link
            href="/pricing"
            className="rounded bg-accent px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-accent/90"
          >
            解锁全部信号 →
          </Link>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-ink-3">
        信号由全体 AI 交易员的当前真实持仓聚合生成，展示市场共识而非投资建议。持仓会随回测结果与市场行情变化而更新。
      </p>
    </div>
  );
}

function SignalRow({ s, rank }: { s: ConsensusSignal; rank: number }) {
  const t = tierOf(s.ratio);
  const meta = TIER_META[t];
  return (
    <div className="rounded-lg border border-surface-2 bg-surface p-3.5">
      <div className="flex items-center gap-3">
        <div className={`w-7 flex-none text-center text-[15px] font-black ${rank <= 3 ? "text-accent" : "text-ink-3"}`}>
          {rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[14px] font-bold text-ink">{s.name}</span>
            <span className="font-mono text-[11px] text-ink-3">{s.code}</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-bold text-ink-2">{s.market}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${meta.chip}`}>{meta.label}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-surface-2">
              <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${Math.round(s.ratio * 100)}%` }} />
            </div>
            <span className="flex-none text-[12px] font-bold text-ink">
              {s.holders}/{s.total} AI
            </span>
          </div>
          <div className="mt-1 truncate text-[11.5px] text-ink-2">
            持有者：{s.topHolders.join("、")}
            {s.holders > s.topHolders.length && ` 等 ${s.holders} 位`}
          </div>
        </div>
      </div>
    </div>
  );
}
