import Link from "next/link";
import { headers } from "next/headers";
import { loginUrl } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";
import { accountKey, getAccount, peekQuota } from "@/lib/billing-store";
import { PLANS } from "@/lib/billing";
import { agents } from "@/data/agents";
import { MyUserAgents } from "@/components/MyUserAgents";
import { MyFollowedAgents } from "@/components/MyFollowedAgents";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <section className="mx-auto mt-16 max-w-[640px] border border-line bg-surface p-8 text-center">
        <div className="num text-[11px] tracking-[0.12em] text-ink-3">REQUIRED · ZMZAI UNIFIED ACCOUNT</div>
        <h1 className="mt-3 text-xl font-extrabold">请先登录</h1>
        <p className="mt-2 text-[14px] text-ink-2">
          Zmz AI Trader Arena 使用 zmzai 统一账号（支持邮箱 / GitHub 登录），
          登录后自建策略云端同步（跨设备保留），关注列表保存在本地。
        </p>
        <a
          href={loginUrl("/me")}
          className="mt-5 inline-block rounded bg-accent px-5 py-2.5 text-[14px] font-semibold text-accent-ink"
        >
          前往登录
        </a>
      </section>
    );
  }

  // 账户与额度（服务端直读计费账本，避免多一跳 API）
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0]?.trim() : null) || h.get("x-real-ip") || "unknown";
  const key = accountKey(user, ip);
  const acc = getAccount(key);
  const quota = peekQuota(key);
  const def = PLANS[acc.plan];
  const isPro = acc.plan === "pro";
  const usedPct = quota.limit === Infinity ? 0 : Math.min(100, Math.round((quota.used / quota.limit) * 100));
  const perks = [
    { ok: true, label: `沙箱回测（${isPro ? "无限" : `每月 ${def.monthlyQuota} 次`}）` },
    { ok: true, label: `回测周期最长 ${def.maxSimDays} 交易日` },
    { ok: def.privateListings, label: "私有策略空间（不上架市场）" },
    { ok: def.reportExport, label: "验证报告导出（JSON 留档）" },
    { ok: true, label: "策略云端同步（跨设备保留）" },
  ];

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded bg-accent text-lg font-extrabold text-accent-ink">
            {user.name.slice(0, 1)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold">{user.name}</h1>
              <span
                className={`num rounded px-1.5 py-0.5 text-[10.5px] font-bold tracking-[0.12em] ${
                  isPro ? "bg-accent text-accent-ink" : "border border-line text-ink-3"
                }`}
              >
                {isPro ? "PRO" : "FREE"}
              </span>
            </div>
            <p className="text-[13px] text-ink-2">{user.email}</p>
          </div>
        </div>

        {/* 账户权益卡 */}
        <div className="w-full max-w-[340px] border border-line p-4">
          <div className="flex items-baseline justify-between">
            <span className="num text-[10.5px] tracking-[0.14em] text-ink-3">
              PLAN · {def.name.toUpperCase()}
            </span>
            {isPro && acc.planSince && (
              <span className="num text-[10.5px] text-ink-3">
                {acc.expiresAt ? `至 ${new Date(acc.expiresAt).toLocaleDateString("zh-CN")}` : "永久"}
              </span>
            )}
          </div>
          {!isPro && (
            <div className="mt-3">
              <div className="num flex justify-between text-[11.5px]">
                <span className="text-ink-2">
                  本月回测 {quota.used} / {quota.limit}
                </span>
                <span className="text-ink-3">剩余 {quota.remaining}</span>
              </div>
              <div className="mt-1.5 h-1 w-full bg-line">
                <div
                  className={`h-full ${usedPct >= 100 ? "bg-danger" : "bg-accent"}`}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            </div>
          )}
          <ul className="mt-3 space-y-1.5 text-[12px]">
            {perks.map((p) => (
              <li key={p.label} className="flex items-center gap-1.5 text-ink-2">
                <span className={p.ok ? "text-accent" : "text-ink-3"}>{p.ok ? "✓" : "—"}</span>
                {p.label}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Link
              href="/pricing"
              className="flex-1 rounded border border-accent py-1.5 text-center text-[12.5px] font-semibold text-accent transition-colors hover:bg-accent/10"
            >
              {isPro ? "续费 / 管理" : "升级 Pro"}
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <MyFollowedAgents />
        <MyUserAgents />
      </div>

      <h2 className="mt-10 text-[15px] font-bold text-ink-2">
        竞技场官方交易员
      </h2>
      <div className="mt-3 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {agents.slice(0, 4).map((a) => (
          <Link
            key={a.id}
            href={`/agents/${a.id}`}
            className="bg-surface p-4 transition-colors hover:bg-surface-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-[18px]">{a.emoji}</span>
              <span className="truncate text-[14px] font-bold">{a.name}</span>
            </div>
            <div className="mt-1 truncate text-[12px] text-ink-2">{a.slogan}</div>
            <div className="num mt-2 text-[10.5px] tracking-wide text-ink-3">
              {a.market} · {a.style.toUpperCase()}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
