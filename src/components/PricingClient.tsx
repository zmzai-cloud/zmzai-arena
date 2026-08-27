"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PLANS } from "@/lib/billing";
import { loginUrl } from "@/lib/auth";

interface BillingState {
  plan: "free" | "pro";
  planName: string;
  planSince: string | null;
  planSource: "paddle" | "afdian" | "xorpay" | "grant" | null;
  quota: { used: number; limit: number | null; remaining: number | null; windowEnd: string };
  perks: { maxSimDays: number; privateListings: boolean; reportExport: boolean };
}

interface XorPayPay {
  paymentUrl: string; // 二维码内容（微信 code_url / 支付宝 H5 链接）
  orderNumber: string;
  expiresInDays: number;
  period: "monthly" | "yearly";
  method: "native" | "alipay";
  expiresAt: string;
}

// 定价页交互：加载当前账户（计划/额度）→ 升级按钮打开支付弹层（微信/支付宝二选一，扫码/跳转支付，轮询自动开通）
// 支付通道未配置时展示「内测发放」引导（管理员 grant 开通），配置后自动切回支付流程。
export function PricingClient() {
  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [paymentCfg, setPaymentCfg] = useState<{ provider: string; configured: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [betaOpen, setBetaOpen] = useState(false); // 内测发放说明展开
  const [copied, setCopied] = useState(false); // Arena ID 已复制提示
  // pay = 弹层状态（period 定案），payData = 已创建的支付订单（未创建时先选支付方式）
  const [pay, setPay] = useState<{ period: "monthly" | "yearly" } | null>(null);
  const [payData, setPayData] = useState<XorPayPay | null>(null);
  const [payBusy, setPayBusy] = useState(false);

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
        setPaymentCfg(bill.payment ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function openPay(period: "monthly" | "yearly") {
    setPayError(null);
    setNotice(null);
    if (!user) {
      window.location.href = loginUrl("/pricing");
      return;
    }
    setPay({ period });
    setPayData(null);
  }

  // 创建 XorPay 支付订单（选支付方式时调用；切换方式会重新下单，旧订单 30 分钟后自动失效）
  async function createPayment(period: "monthly" | "yearly", method: "native" | "alipay") {
    setPayError(null);
    setPayBusy(true);
    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, method }),
      });
      const data = (await res.json()) as {
        paymentUrl?: string;
        orderNumber?: string;
        expiresInDays?: number;
        expiresAt?: string;
        error?: string;
        code?: string;
      };
      if (res.status === 503) {
        setPay(null);
        setPayData(null);
        setNotice(
          "支付通道开通中。内测阶段 Pro 通过邀请发放：登录后联系 support@zmzai.cloud 附上账号 ID 即可开通。"
        );
        return;
      }
      if (res.ok && data.paymentUrl && data.orderNumber) {
        setPayData({
          paymentUrl: data.paymentUrl,
          orderNumber: data.orderNumber,
          expiresInDays: data.expiresInDays ?? (period === "yearly" ? 365 : 30),
          period,
          method,
          expiresAt: data.expiresAt ?? "",
        });
        return;
      }
      setPayError(data.error ?? `创建支付失败（${res.status}）`);
    } catch {
      setPayError("网络异常，请稍后再试");
    } finally {
      setPayBusy(false);
    }
  }

  // 支付弹层打开后轮询 /api/billing/me，检测到 Pro 自动关闭并刷新
  useEffect(() => {
    if (!pay) return;
    let alive = true;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const r = await fetch("/api/billing/me");
        const d = (await r.json()) as { account?: { plan?: string } };
        if (alive && d.account?.plan === "pro") {
          clearInterval(timer);
          setPay(null);
          setPayData(null);
          window.location.reload();
        }
      } catch {
        // 网络抖动忽略，继续轮询
      }
      // 10 分钟后停止轮询（用户可能去别处支付/放弃）
      if (tries >= 200) clearInterval(timer);
    }, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pay]);

  const isPro = billing?.plan === "pro";
  const betaMode = paymentCfg !== null && !paymentCfg.configured; // 支付通道未配置：内测发放模式
  const periodLabel = pay?.period === "yearly" ? "年付" : "月付";
  const periodPrice = pay?.period === "yearly" ? PLANS.pro.priceYearly : PLANS.pro.priceMonthly;

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
          ) : betaMode ? (
            /* 内测发放模式：支付通道未配置，展示申请引导 */
            <div className="space-y-2">
              <button
                onClick={() => setBetaOpen((v) => !v)}
                className="w-full rounded bg-accent py-2.5 text-[14px] font-semibold text-accent-ink transition-colors hover:opacity-90"
              >
                {betaOpen ? "收起申请说明" : "申请内测 Pro"}
              </button>
              {betaOpen && (
                <div className="rounded border border-line bg-surface p-3">
                  <div className="text-[12.5px] leading-relaxed text-ink-2">
                    内测期 Pro 通过邀请发放。联系 support@zmzai.cloud 并附上你的 Arena ID：
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="num truncate text-[12.5px] font-semibold text-ink-1">
                      {user?.id ?? "—"}
                    </span>
                    <button
                      onClick={() => {
                        if (!user?.id) return;
                        void navigator.clipboard?.writeText(user.id).catch(() => {});
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      className="shrink-0 rounded border border-line px-2 py-1 text-[11.5px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
                    >
                      {copied ? "已复制 ✓" : "复制 ID"}
                    </button>
                  </div>
                </div>
              )}
              <div className="num text-center text-[11px] text-ink-3">支付通道开通中 · 内测免费</div>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => openPay("monthly")}
                disabled={busy}
                className="w-full rounded bg-accent py-2.5 text-[14px] font-semibold text-accent-ink transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "正在生成支付链接…" : user ? "升级 Pro · ¥29/月" : "登录后升级"}
              </button>
              <button
                onClick={() => openPay("yearly")}
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

      {/* 支付弹层：XorPay 微信/支付宝二选一 → 二维码/跳转支付 → 轮询自动开通 */}
      {pay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            setPay(null);
            setPayData(null);
          }}
        >
          <div
            className="w-full max-w-sm border border-line bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="num text-[11px] tracking-[0.14em] text-ink-3">
                支付 Pro · {periodLabel} ¥{periodPrice}
              </div>
              <button
                onClick={() => {
                  setPay(null);
                  setPayData(null);
                }}
                className="text-ink-3 transition-colors hover:text-ink-1"
                aria-label="关闭支付窗口"
              >
                ✕
              </button>
            </div>

            {!payData ? (
              /* 第一步：选择支付方式 */
              <div className="mt-5 space-y-2.5">
                <button
                  onClick={() => void createPayment(pay.period, "native")}
                  disabled={payBusy}
                  className="w-full rounded border border-accent bg-accent/5 py-3 text-center text-[14px] font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
                >
                  微信支付（扫码）
                </button>
                <button
                  onClick={() => void createPayment(pay.period, "alipay")}
                  disabled={payBusy}
                  className="w-full rounded border border-line py-3 text-center text-[14px] font-semibold text-ink-1 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  支付宝（App 跳转）
                </button>
                {payBusy && (
                  <div className="num text-center text-[11.5px] text-ink-3">正在创建支付订单…</div>
                )}
                <p className="text-center text-[12px] leading-relaxed text-ink-2">
                  支付完成后本页面将自动检测并开通 Pro
                </p>
              </div>
            ) : (
              /* 第二步：展示二维码/支付链接 */
              <div className="mt-5">
                <div className="flex justify-center rounded border border-line bg-white p-4">
                  <QRCodeSVG value={payData.paymentUrl} size={176} level="M" />
                </div>
                <div className="num mt-3 text-center text-[12px] text-ink-1">
                  {payData.method === "native"
                    ? "使用微信「扫一扫」完成支付"
                    : "使用支付宝「扫一扫」或点击下方链接"}
                </div>
                <a
                  href={payData.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block w-full rounded bg-accent py-2.5 text-center text-[14px] font-semibold text-accent-ink transition-colors hover:opacity-90"
                >
                  打开支付链接 ↗
                </a>
                <div className="num mt-3 flex items-center justify-between text-[11px] text-ink-3">
                  <span>订单号:{payData.orderNumber}</span>
                  <span>30 分钟内有效</span>
                </div>
                <button
                  onClick={() => {
                    setPayData(null);
                    setPayError(null);
                  }}
                  disabled={payBusy}
                  className="mt-3 w-full rounded border border-line py-2 text-center text-[12.5px] text-ink-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  更换支付方式
                </button>
                {payError && <div className="mt-3 text-[12.5px] text-danger">{payError}</div>}
              </div>
            )}
          </div>
        </div>
      )}

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
