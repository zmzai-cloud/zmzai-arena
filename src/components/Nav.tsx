"use client";

import Link from "next/link";

export function Nav() {
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
          <span className="cursor-pointer rounded-lg px-3 py-1.5 hover:bg-surface-2">创建</span>
          <span className="cursor-pointer rounded-lg px-3 py-1.5 hover:bg-surface-2">我的</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-ink"
            onClick={() => alert("原型演示：登录 / 创作者账号")}
          >
            登录
          </button>
          <button
            className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-accent-ink"
            onClick={() => alert("原型演示：创建智能体")}
          >
            + 创建智能体
          </button>
        </div>
      </div>
    </nav>
  );
}
