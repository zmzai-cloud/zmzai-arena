"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@zmzai/theme";

interface AdminAccount {
  key: string; // user:<id> / anon:<ip>
  userId: string;
  plan: "free" | "pro";
  planSource: string | null;
  planSince: string | null;
  expiresAt: string | null;
  quota: { windowEnd: string; used: number };
  createdAt: string;
}

interface AdminAccountsResponse {
  ok?: boolean;
  total?: number;
  accounts?: AdminAccount[];
  error?: string;
}

// 运营后台：管理员密钥登录 → 账户列表（搜索过滤）→ 发放/续期/回收 Pro（grant API 可视化）
export function AdminConsole() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [q, setQ] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 挂载时：会话内已有密钥则自动尝试；否则探测 SSO admin 通道（已登录的全域管理员账号可直接进入）
  useEffect(() => {
    const saved = sessionStorage.getItem("arena_admin_secret");
    if (saved) {
      setSecret(saved);
      void tryLogin(saved);
    } else {
      void tryLogin("", true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryLogin(s: string, quiet = false) {
    setSecretError(null);
    const headers: Record<string, string> = {};
    if (s) headers["x-admin-secret"] = s;
    const res = await fetch("/api/billing/admin/accounts", { headers });
    const data = (await res.json().catch(() => ({}))) as AdminAccountsResponse;
    if (res.ok && data.accounts) {
      setAccounts(data.accounts);
      if (s) sessionStorage.setItem("arena_admin_secret", s);
      setAuthed(true);
    } else {
      sessionStorage.removeItem("arena_admin_secret");
      setAuthed(false);
      if (!quiet) setSecretError(data.error ?? "密钥无效");
    }
    setChecking(false);
  }

  function logout() {
    sessionStorage.removeItem("arena_admin_secret");
    setAuthed(false);
    setSecret("");
    setAccounts([]);
    setMsg(null);
  }

  async function refresh() {
    const res = await fetch("/api/billing/admin/accounts", {
      headers: { "x-admin-secret": secret },
    });
    if (res.ok) {
      const data = (await res.json()) as AdminAccountsResponse;
      setAccounts(data.accounts ?? []);
    }
  }

  async function grant(key: string, plan: "pro" | "free", durationDays?: number) {
    setBusyKey(key);
    setMsg(null);
    try {
      const res = await fetch("/api/billing/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ accountKey: key, plan, durationDays }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setMsg({
          ok: true,
          text: plan === "pro" ? `已发放 Pro · +${durationDays ?? 0} 天 → ${key}` : `已回收 Free → ${key}`,
        });
        await refresh();
      } else {
        setMsg({ ok: false, text: data.error ?? `操作失败（${res.status}）` });
      }
    } catch {
      setMsg({ ok: false, text: "网络异常，请重试" });
    } finally {
      setBusyKey(null);
    }
  }

  const filtered = accounts.filter(
    (a) => !q.trim() || a.key.includes(q.trim()) || a.userId.includes(q.trim())
  );
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "—";

  /* ---------- 登录态 ---------- */
  if (!authed) {
    return (
      <div className="mt-16 flex justify-center">
        <div className="w-full max-w-sm border border-line bg-surface p-6">
          <div className="num text-[11px] tracking-[0.14em] text-ink-3">OPS · 运营后台</div>
          <h1 className="mt-2 text-xl font-extrabold">管理员登录</h1>
          <p className="mt-1 text-[12.5px] text-ink-2">输入 BILLING_ADMIN_SECRET，或使用已登录的全域管理员账号（如 mifindxuan@gmail.com）</p>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && secret && void tryLogin(secret)}
            placeholder="管理员密钥"
            className="mt-4 w-full border border-line bg-surface px-3 py-2.5 text-[14px] text-ink-1 outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
          />
          {secretError && <div className="mt-2 text-[12.5px] text-danger">{secretError}</div>}
          <button
            onClick={() => void tryLogin(secret)}
            disabled={checking}
            className="mt-4 w-full rounded bg-accent py-2.5 text-[14px] font-semibold text-accent-ink transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {checking ? "验证中…" : secret ? "登录" : "使用已登录的 admin 账号进入"}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- 账户管理 ---------- */
  return (
    <div>
      <PageHeader
        eyebrow="OPS · 运营后台"
        icon="coins"
        title="账户发放"
        actions={
          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索 Arena ID / IP…"
              className="w-56 border border-line bg-surface px-3 py-2 text-[13px] text-ink-1 outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
            />
            <button
              onClick={logout}
              className="rounded border border-line px-3 py-2 text-[12.5px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
            >
              登出
            </button>
          </div>
        }
      />

      {msg && (
        <div
          className={`mt-4 border px-3 py-2 text-[12.5px] ${
            msg.ok ? "border-line text-ink-1" : "border-line text-danger"
          }`}
        >
          {msg.ok ? "✓ " : "✕ "}
          {msg.text}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="dtbl min-w-[860px]">
          <thead>
            <tr>
              <th className="text-left">账户</th>
              <th className="text-center">计划</th>
              <th className="text-center">来源</th>
              <th className="text-right">到期时间</th>
              <th className="text-right">本月回测</th>
              <th className="text-right">创建时间</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const expired = a.plan === "pro" && a.expiresAt && new Date(a.expiresAt).getTime() <= Date.now();
              return (
                <tr key={a.key}>
                  <td className="text-left">
                    <span className="font-semibold text-ink-1">
                      {a.key.startsWith("user:") ? a.key.slice(5) : a.key}
                    </span>
                    <span className="num ml-2 text-[11px] text-ink-3">{a.key}</span>
                  </td>
                  <td className="text-center">
                    {a.plan === "pro" ? (
                      <span className={expired ? "text-danger" : "text-accent"}>
                        {expired ? "PRO 过期" : "PRO"}
                      </span>
                    ) : (
                      <span className="text-ink-3">free</span>
                    )}
                  </td>
                  <td className="text-center text-ink-2">
                    {a.planSource === "grant" ? "内测" : a.planSource === "xorpay" ? "支付" : "—"}
                  </td>
                  <td className="num text-right">{fmtDate(a.expiresAt)}</td>
                  <td className="num text-right">
                    {a.quota.used} / {a.plan === "pro" ? "∞" : 3}
                  </td>
                  <td className="num text-right">{fmtDate(a.createdAt)}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => void grant(a.key, "pro", 30)}
                        disabled={busyKey === a.key}
                        className="rounded border border-line px-2 py-1 text-[11.5px] text-ink-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                      >
                        +30 天
                      </button>
                      <button
                        onClick={() => void grant(a.key, "pro", 365)}
                        disabled={busyKey === a.key}
                        className="rounded border border-line px-2 py-1 text-[11.5px] text-ink-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                      >
                        +365 天
                      </button>
                      {a.plan === "pro" && (
                        <button
                          onClick={() => void grant(a.key, "free")}
                          disabled={busyKey === a.key}
                          className="rounded border border-line px-2 py-1 text-[11.5px] text-ink-3 transition-colors hover:border-danger hover:text-danger disabled:opacity-40"
                        >
                          回收
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-[12.5px] text-ink-3">
                  {checking ? "加载中…" : "无匹配账户（用户首次访问本产品后才会出现在此）"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="num mt-2 text-[11px] text-ink-3">共 {filtered.length} / {accounts.length} 个账户</div>
    </div>
  );
}
