"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PLANS } from "@/lib/billing";
import { loginUrl } from "@/lib/auth";

interface BillingState {
  plan: "free" | "pro";
  planName: string;
  planSince: string | null;
  planSource: "paddle" | "grant" | null;
  quota: { used: number; limit: number | null; remaining: number | null; windowEnd: string };
  perks: { maxSimDays: number; privateListings: boolean; reportExport: boolean };
}

// 定价页交互：加载当前账户（计划/额度）→ 升级按钮按状态分流
export function PricingClient() {
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/me").then((r) => r.json()),
      fetch("/api/billing/me").then((r) => r.json()),
    ])
      .then(([me, bill]) => {
        if (!alive) return;
        setUser(me.user ?? null);
        setBilling(bill.account ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function upgrade(period: "monthly" | "yearly") {
    setPayError(null);
    setNotice(null);
    if (!user) {
      window.location.href = loginUrl("/pricing");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const data = (await res.json()) as {
        checkoutUrl?: string;
        error?: string;
        code?: string;
      };
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (res.status === 503) {
        setNotice(
          "支付通道开通中。内测阶段 Pro 通过邀请发放：登录后联系 support@zmzai.cloud 附上账号 ID 即可开通。"
        );
      } else {
        setPayError(data.error ?? `升级失败（${res.status}）`);
      }
    } catch {
      setPayError("网络异常，请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  const isPro = billing?.plan === "pro";

  return (
    <div className="mt-8 grid gap-5 md:grid-cols-2">
      {/* Free */}
      <div className="flex flex-col border border-line bg-surface p-6">
        <div className="num text-[11px] tracking-[0.14em] text-ink-3">FREE</div>
        <div className="mt-3 text-3xl font-extrabold">
          ¥0<span className="ml-1 text-[13px] font-normal text-ink-3">/ 永久</span>
        </div>
        <p className="mt-1 text-[13px] text-ink-2">{PLANS.free.tagline}</p>
        <ul className="mt-5 space-y-2.5 text-[13px] leading-relaxed">
          {PLANS.free.features.map((f) => (
            <li key={f} className="flex gap-2">
              <span className="text-ink-3">▸</span>
              <span className="text-ink-2">{f}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-6">
          {billing && !isPro && (
            <div className="num mb-3 text-[11.5px] text-ink-3">
              本月回测 {billing.quota.used} / {billing.quota.limit ?? "∞"}
            </div>
          )}
          <span className="inline-block w-full cursor-default rounded border border-line py-2.5 text-center text-[14px] font-semibold text-ink-3">
            {isPro ? "当前计划" : "免费使用"}
          </span>
        </div>
      </div>

      {/* Pro */}
      <div className="relative flex flex-col border-2 border-accent bg-surface p-6">
        <span className="absolute -top-3 left-6 bg-accent px-2 py-0.5 text-[10.5px] font-bold tracking-[0.12em] text-accent-ink">
          RECOMMENDED
        </span>
        <div className="num text-[11px] tracking-[0.14em] text-ink-3">PRO</div>
        <div className="mt-3 text-3xl font-extrabold">
          ¥29<span className="ml-1 text-[13px] font-normal text-ink-3">/ 月</span>
        </div>
        <div className="num mt-1 text-[12px] text-ink-3">
          ¥198 / 年（约 7.5 折） · 随时取消
        </div>
        <p className="mt-2 text-[13px] text-ink-2">{PLANS.pro.tagline}</p>
        <ul className="mt-5 space-y-2.5 text-[13px] leading-relaxed">
          {PLANS.pro.features.map((f) => (
            <li key={f} className="flex gap-2">
              <span className="text-accent">▸</span>
              <span className="text-ink-2">{f}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-6">
          {isPro ? (
            <>
              <span className="inline-block w-full rounded bg-accent py-2.5 text-center text-[14px] font-semibold text-accent-ink">
                ✓ 已开通 Pro
              </span>
              <div className="num mt-2 text-center text-[11.5px] text-ink-3">
                {billing?.planSource === "grant" ? "内测发放 · " : "订阅 · "}
                无限回测已解锁
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => upgrade("monthly")}
                disabled={busy}
                className="w-full rounded bg-accent py-2.5 text-[14px] font-semibold text-accent-ink transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "创建结账中…" : user ? "升级 Pro · ¥29/月" : "登录后升级"}
              </button>
              <button
                onClick={() => upgrade("yearly")}
                disabled={busy}
                className="w-full rounded border border-accent py-2 text-[13px] font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
              >
                ¥198/年（约 7.5 折）
              </button>
            </div>
          )}
          {payError && <div className="mt-3 text-[12.5px] text-danger">{payError}</div>}
          {notice && <div className="mt-3 text-[12.5px] leading-relaxed text-ink-2">{notice}</div>}
        </div>
      </div>

      <div className="md:col-span-2">
        <div className="num text-[11px] tracking-[0.12em] text-ink-3">
          账户:{user ? user.name : "未登录（匿名也有免费额度）"}
          {billing && (
            <>
              {" · "}计划:{billing.planName}
              {isPro && billing.planSince && ` · 自 ${new Date(billing.planSince).toLocaleDateString("zh-CN")}`}
            </>
          )}
        </div>
        {!isPro && (
          <p className="mt-2 text-[13px] text-ink-2">
            免费额度每 30 天滚动重置。想看自己的策略在 500 天行情下的表现?
            <Link href="/create" className="text-accent underline underline-offset-2">
              先创建交易员
            </Link>
            ,完整验证流程免费可走。
          </p>
        )}
      </div>
    </div>
  );
}
