"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Navbar, navItemClass } from "@zmzai/theme/components/navbar";
import { AUTH_ORIGIN, loginUrl, type SessionUser } from "@/lib/auth";

// 全域统一顶栏：Logo + Wordmark（ZMZAI · trader-arena），与其他 7 站同源
export function Nav() {
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // 登出：POST 到 SSO 中心销毁会话。跨域时即使 CORS 阻止读响应，Set-Cookie 清会话
  // 仍由浏览器自动生效，随后跳回 auth 登录页（带 next 回跳）。
  const doLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch(`${AUTH_ORIGIN}/api/logout`, { method: "POST", credentials: "include" });
    } catch {
      // 静默：请求已发出，会话已销毁
    }
    const next = encodeURIComponent(
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin + (pathname || "/")
        : "/",
    );
    window.location.href = `${AUTH_ORIGIN}/login?next=${next}`;
  };

  useEffect(() => {
    let alive = true;
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => alive && setUser(d.user ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Navbar
      sublabel="trader-arena"
      badge={<span className="num text-[11px] tracking-wide text-ink-3">arena.zmzai.cloud</span>}
      brandHref="/"
      actions={
        <>
          {user ? (
            <>
              <Link href="/me" className={navItemClass(false)}>
                {user.name}
              </Link>
              <button onClick={doLogout} className={navItemClass(false)} disabled={loggingOut}>
                {loggingOut ? "登出中…" : "登出"}
              </button>
            </>
          ) : (
            <a href={loginUrl(pathname)} className={navItemClass(false)}>
              登录
            </a>
          )}
          <Link
            href="/create"
            className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-ink transition-colors hover:opacity-90"
          >
            + 创建交易员
          </Link>
        </>
      }
    >
      <Link href="/" className={navItemClass(pathname === "/")}>
        首页
      </Link>
      <Link href="/arena" className={navItemClass(pathname.startsWith("/arena"))}>
        竞技场
      </Link>
      <Link href="/battle" className={navItemClass(pathname.startsWith("/battle"))}>
        对决
      </Link>
      <Link href="/signals" className={navItemClass(pathname.startsWith("/signals"))}>
        信号
      </Link>
      <Link href="/create" className={navItemClass(pathname.startsWith("/create"))}>
        创建
      </Link>
      <Link href="/pricing" className={navItemClass(pathname.startsWith("/pricing"))}>
        Pro
      </Link>
      <Link href="/me" className={navItemClass(pathname.startsWith("/me"))}>
        我的
      </Link>
    </Navbar>
  );
}
