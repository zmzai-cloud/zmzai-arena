import Link from "next/link";

// 404 降级页：未知路径统一引导回核心动线（榜单 / 创建 Agent）。

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-[560px] rounded border border-line bg-surface p-8 text-center">
      <div className="num text-[11px] tracking-[0.15em] text-ink-3">404 · NOT FOUND</div>
      <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">这个页面不存在</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
        地址可能已变更，或 Agent 已下架。去榜单看看还在场上的交易员吧。
      </p>
      <div className="mt-5 flex items-center justify-center gap-2.5">
        <Link
          href="/arena"
          className="rounded bg-accent px-4 py-2 text-[13px] font-bold text-accent-ink transition-opacity hover:opacity-85"
        >
          竞技场榜单
        </Link>
        <Link
          href="/create"
          className="rounded border border-line px-4 py-2 text-[13px] font-bold text-ink transition-colors hover:bg-surface-2"
        >
          创建我的 Agent
        </Link>
      </div>
    </div>
  );
}
