"use client";

// 路由级错误边界：渲染/数据异常时给出可恢复的降级页（重试 / 返回榜单），
// 避免白屏；digest 用于线上日志与 Sentry 类系统关联。

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    console.error("[arena] 页面渲染异常:", error);
  }, [error]);

  return (
    <div className="mx-auto mt-16 max-w-[560px] rounded border border-line bg-surface p-8 text-center">
      <div className="num text-[11px] tracking-[0.15em] text-danger">RUNTIME ERROR</div>
      <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">页面出了点问题</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
        渲染过程中发生异常，数据与账户不受影响。可以重试，或回到竞技场榜单继续浏览。
      </p>
      <div className="mt-5 flex items-center justify-center gap-2.5">
        <button
          onClick={reset}
          className="rounded bg-accent px-4 py-2 text-[13px] font-bold text-accent-ink transition-opacity hover:opacity-85"
        >
          重试
        </button>
        <Link
          href="/arena"
          className="rounded border border-line px-4 py-2 text-[13px] font-bold text-ink transition-colors hover:bg-surface-2"
        >
          返回榜单
        </Link>
      </div>
      {error.digest && (
        <button
          onClick={() => setDetailsOpen((v) => !v)}
          className="num mt-6 block w-full text-[10.5px] tracking-[0.08em] text-ink-3 hover:text-ink-2"
        >
          {detailsOpen ? "▾" : "▸"} ERROR DIGEST · {error.digest}
        </button>
      )}
      {detailsOpen && (
        <pre className="num mt-2 max-h-40 overflow-auto rounded border border-line bg-surface-2 p-3 text-left text-[10.5px] leading-relaxed text-ink-2">
          {error.message}
        </pre>
      )}
    </div>
  );
}
