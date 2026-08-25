"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AUTH_ORIGIN, loginUrl, logoutUrl, type SessionUser } from "@/lib/auth";

export function Nav() {
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);

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
    <nav className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-extrabold tracking-wide">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
          zmzai <span className="text-accent">投研竞技场</span>
        </Link>
        <div className="ml-2 hidden items-center gap-1 text-[13px] font-semibold text-ink-2 sm:flex">
          <Link href="/" className="rounded-lg bg-surface-2 px-3 py-1.5 text-ink">
            排行榜
          </Link>
          <span className="cursor-pointer rounded-lg px-3 py-1.5 hover:bg-surface-2">发现</span>
          <Link href="/create" className="rounded-lg px-3 py-1.5 hover:bg-surface-2">
            创建
          </Link>
          <Link href="/me" className="rounded-lg px-3 py-1.5 hover:bg-surface-2">
            我的
          </Link>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link
                href="/me"
                className="rounded-lg bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-ink"
              >
                {user.name}
              </Link>
              <a
                href={logoutUrl(pathname)}
                className="rounded-lg bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-surface-2"
              >
                登出
              </a>
            </>
          ) : (
            <a
              href={loginUrl(pathname)}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-surface-2"
            >
              登录
            </a>
          )}
          <Link
            href="/create"
            className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-accent-ink"
          >
            + 创建智能体
          </Link>
        </div>
      </div>
    </nav>
  );
}
