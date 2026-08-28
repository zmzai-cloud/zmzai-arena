"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { glossaryTerm } from "@/data/learn";

// 情境化术语提示:指标旁的「?」。浮层用 portal + fixed 定位,不受表格 overflow 裁剪。
// 数据源与学堂 glossary 单源;点击「深入了解」直达学堂对应篇章。
export function TermHint({ termKey }: { termKey: string }) {
  const g = glossaryTerm(termKey);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const open = useCallback(() => {
    const el = document.getElementById(`termhint-${termKey}`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(Math.max(r.left + r.width / 2, 150), (window.innerWidth || 800) - 150),
      y: r.top - 8,
    });
  }, [termKey]);

  if (!g) return null;
  const openNow = pos !== null;

  return (
    <>
      <button
        id={`termhint-${termKey}`}
        type="button"
        aria-label={`${g.term}是什么`}
        onMouseEnter={open}
        onMouseLeave={() => setPos(null)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openNow ? setPos(null) : open();
        }}
        className={`inline-flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full border border-line text-[10px] font-bold leading-none text-ink-3 transition-colors hover:border-accent hover:text-accent ${
          openNow ? "border-accent text-accent" : ""
        }`}
      >
        ?
      </button>
      {openNow &&
        createPortal(
          <div
            className="fixed z-[80] w-[280px] -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-paper p-3 shadow-lg"
            style={{ left: pos.x, top: pos.y }}
            onMouseEnter={() => setPos((p) => (p ? { ...p } : p))}
            onMouseLeave={() => setPos(null)}
            role="tooltip"
          >
            <div className="text-[13px] font-bold text-ink">{g.term}</div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{g.short}</div>
            {g.article && (
              <Link
                href={`/learn/${g.article}`}
                className="mt-2 inline-block text-[12px] font-semibold text-accent hover:underline"
                onClick={() => setPos(null)}
              >
                深入了解 → 学堂
              </Link>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
