"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { agents as STATIC_AGENTS, type Agent } from "@/data/agents";
import { loadUserAgents } from "@/lib/userAgents";
import { fmtPct, tierBadge } from "@/lib/format";
import {
  createPortfolio,
  FREE_MAX_PORTFOLIOS,
  PRO_MAX_PORTFOLIOS,
  removePortfolio,
  touchPortfolio,
  usePortfolios,
  type FollowPortfolio,
} from "@/lib/portfolios";

// 模拟跟单：组合价值/持仓由被跟 AI 的档案实时推导（镜像其当前持仓）。
// 免费 1 个组合 / Pro 5 个（订阅付费点），超限引导升级。
export function Portfolios() {
  const portfolios = usePortfolios();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const [limitWarn, setLimitWarn] = useState(false);

  useEffect(() => {
    setAgents([...STATIC_AGENTS, ...loadUserAgents()]);
    fetch("/api/billing/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { account: { plan: string } }) => setIsPro(d.account.plan === "pro"))
      .catch(() => setIsPro(false));
  }, []);

  // 一键跟投：详情页带 ?follow=<agentId>&capital=<本金> 跳转，这里自动建组合
  const followId = params.get("follow");
  const followCap = Number(params.get("capital")) || 10000;
  const created = useRef(false);
  useEffect(() => {
    if (!followId || isPro === null || created.current) return;
    created.current = true;
    const id = Number(followId);
    const maxAllowed = isPro ? PRO_MAX_PORTFOLIOS : FREE_MAX_PORTFOLIOS;
    if (Number.isInteger(id) && id > 0 && byId.get(id)) {
      const ok = createPortfolio(id, Math.max(100, followCap), maxAllowed);
      if (!ok) {
        setLimitWarn(true);
        window.setTimeout(() => setLimitWarn(false), 4000);
      }
    }
    router.replace("/portfolio");
  }, [followId, isPro, byId, followCap, router]);

  const maxAllowed = isPro ? PRO_MAX_PORTFOLIOS : FREE_MAX_PORTFOLIOS;

  if (isPro === null) {
    return <div className="py-10 text-center text-[13px] text-ink-3">组合加载中…</div>;
  }

  return (
    <div className="space-y-4">
      {limitWarn && (
        <div className="rounded border border-warning/40 bg-warning/10 px-4 py-2.5 text-[12.5px] font-bold text-warning">
          已达免费跟单上限（1 个）——升级 Pro 可同时跟 5 个 AI
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-ink-2">
          已跟 <span className="font-bold text-ink">{portfolios.length}</span> / {maxAllowed} 个 AI
          {!isPro && "（免费限 1 个）"}
        </div>
        <Link
          href="/arena"
          className="rounded bg-accent/10 px-3 py-1.5 text-[12.5px] font-bold text-accent transition-colors hover:bg-accent/15"
        >
          + 去榜单选一个跟
        </Link>
      </div>

      {portfolios.length === 0 ? (
        <div className="rounded border border-dashed border-line bg-surface p-8 text-center">
          <div className="text-[13px] text-ink-2">
            还没有跟单组合。挑一个你看好的 AI 交易员，「一键跟投」拿 1 万块虚拟资金跟随它的持仓。
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {portfolios.map((p) => {
            const a = byId.get(p.agentId);
            if (!a) return null;
            return (
              <PortfolioCard
                key={p.id}
                p={p}
                a={a}
                open={openId === p.id}
                onToggle={() => setOpenId(openId === p.id ? null : p.id)}
              />
            );
          })}
        </div>
      )}

      {portfolios.length >= maxAllowed && !isPro && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-dashed border-accent/40 bg-accent/5 px-4 py-3.5">
          <div className="text-[13px]">
            <span className="font-bold text-accent">🔒 免费最多跟 1 个 AI</span>
            <span className="text-ink-2"> — 升级 Pro 最多同时跟 5 个，多策略分散风险</span>
          </div>
          <Link
            href="/pricing"
            className="rounded bg-accent px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-accent/90"
          >
            升级 Pro →
          </Link>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-ink-3">
        模拟跟单为虚拟账户，收益按被跟 AI 的历史验证结果镜像展示，不构成投资建议，不涉及真实资金。
      </p>
    </div>
  );
}

function PortfolioCard({
  p,
  a,
  open,
  onToggle,
}: {
  p: FollowPortfolio;
  a: Agent;
  open: boolean;
  onToggle: () => void;
}) {
  const finalValue = p.capital * (1 + a.totalReturn / 100);
  const up = a.totalReturn >= 0;
  const holdings = a.positions ?? [];

  // 持仓明细：按被跟 AI 持仓市值占比，把本金分配到每个标的
  const totalMv = holdings.reduce((s, h) => s + mvNum(h.mv), 0) || 1;
  const rows = holdings
    .map((h) => {
      const ratio = mvNum(h.mv) / totalMv;
      return { ...h, value: p.capital * (1 + a.totalReturn / 100) * ratio };
    })
    .sort((x, y) => y.value - x.value)
    .slice(0, 6);

  return (
    <div className="rounded-lg border border-surface-2 bg-surface">
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-3.5 text-left">
        <span className="text-[22px]">{a.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-[14px] font-bold text-ink">{a.name}</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-bold text-ink-2">
              {a.style}
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${tierBadge(a.tier).className}`}>
              {tierBadge(a.tier).label}
            </span>
          </div>
          <div className="mt-1 truncate text-[11.5px] text-ink-3">
            持仓 {holdings.length} 个 · 同步于 {new Date(p.syncedAt).toLocaleString("zh-CN")}
          </div>
        </div>
        <div className="flex-none text-right">
          <div className="text-[14px] font-black text-ink">¥{finalValue.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}</div>
          <div className={`text-[12px] font-bold ${up ? "up" : "down"}`}>{fmtPct(a.totalReturn)}</div>
        </div>
        <span className="flex-none text-[11px] text-ink-3">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-line px-3.5 pb-3.5 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-3">持仓明细（镜像跟随）</span>
            <span className="text-[11px] text-ink-3">最大回撤 {fmtPct(a.maxDD)}</span>
          </div>
          <div className="overflow-hidden rounded border border-line">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-surface-2 text-[10.5px] uppercase tracking-wider text-ink-3">
                  <th className="px-2 py-1.5 text-left font-bold">标的</th>
                  <th className="px-2 py-1.5 text-right font-bold">数量</th>
                  <th className="px-2 py-1.5 text-right font-bold">现价</th>
                  <th className="px-2 py-1.5 text-right font-bold">市值（我的组合）</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.code} className="border-t border-line">
                    <td className="px-2 py-1.5">
                      <span className="font-bold text-ink">{h.name}</span>
                      <span className="ml-1.5 font-mono text-[10.5px] text-ink-3">{h.code}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-ink-2">{h.qty}</td>
                    <td className="px-2 py-1.5 text-right text-ink-2">{h.price}</td>
                    <td className="px-2 py-1.5 text-right font-bold text-ink">¥{h.value.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={() => touchPortfolio(p.id)}
              className="rounded border border-accent/50 px-3 py-1 text-[12px] font-bold text-accent transition-colors hover:bg-accent/10"
            >
              ⟳ 同步持仓
            </button>
            <button
              onClick={() => removePortfolio(p.id)}
              className="rounded border border-line px-3 py-1 text-[12px] font-bold text-ink-3 transition-colors hover:border-danger/50 hover:text-danger"
            >
              取消跟单
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 从 "¥12.3万" / "1,234" 等展示串解析数值（纯数字部分），失败返回 0 */
function mvNum(s: string): number {
  const n = Number(String(s ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
