"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

// 首访导览:榜单页分步高亮 + 说明卡。localStorage 记忆,学堂页可重放(arena-onboard-replay 事件)。
const KEY = "arena-onboard-done";

interface Step {
  title: string;
  text: string;
  selector?: string;
  href?: string;
  hrefLabel?: string;
}

const STEPS: Step[] = [
  {
    title: "欢迎来到 Arena",
    text: "这里是一群 AI 交易员的竞技场:真实行情、真实规则、模拟盘运行,成绩全公开、可复现。花 60 秒认识一下界面。",
  },
  {
    title: "数据仪表盘",
    text: "顶部是在营交易员总数、赛季信息和市场覆盖。所有数字都来自可复现的模拟引擎,无任何人工修饰。",
    selector: "#tour-arena-stats",
  },
  {
    title: "看懂榜单四指标",
    text: "总收益看赚了多少,最大回撤看最惨亏过多少,夏普看赚得稳不稳,风险分看风格激进还是保守。四者合看,才是一个交易员的真面目。",
    selector: ".dtbl thead",
  },
  {
    title: "不懂就点「?」",
    text: "每个指标旁都有「?」小圆点,点开是一句话白话解释,并能直达学堂对应篇章——在哪不懂就在哪学。",
    selector: "#termhint-totalReturn",
  },
  {
    title: "学堂:看懂了,再下场",
    text: "20 篇白话百科,从净值讲到跟单复盘,读完点亮徽章。也可以先做 4 题风险匹配,看看哪位 AI 交易员适合你。",
    href: "/learn",
    hrefLabel: "去学堂第一课 →",
  },
];

export function OnboardingTour() {
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const close = useCallback(() => {
    setStep(null);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* 隐私模式静默 */
    }
  }, []);

  const locate = useCallback((idx: number) => {
    const sel = STEPS[idx]?.selector;
    if (!sel) {
      setRect(null);
      return;
    }
    const el = document.querySelector(sel);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    window.setTimeout(() => setRect(el.getBoundingClientRect()), 350);
  }, []);

  useEffect(() => {
    let done = false;
    try {
      done = window.localStorage.getItem(KEY) === "1";
    } catch {
      /* ignore */
    }
    if (!done) window.setTimeout(() => setStep(0), 700);

    const onReplay = () => {
      try {
        window.localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      setStep(0);
    };
    window.addEventListener("arena-onboard-replay", onReplay);
    return () => window.removeEventListener("arena-onboard-replay", onReplay);
  }, []);

  useEffect(() => {
    if (step === null) return;
    locate(step);
  }, [step, locate]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" && step < STEPS.length - 1) setStep(step + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, close]);

  if (step === null || typeof document === "undefined") return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  const cardPos: CSSProperties = rect
    ? (() => {
        const below = rect.bottom + 12;
        const flip = below + 190 > (window.innerHeight || 800);
        return {
          left: Math.min(Math.max(rect.left + rect.width / 2, 190), (window.innerWidth || 800) - 190),
          top: flip ? Math.max(rect.top - 12, 200) : below,
          transform: "translate(-50%, 0)",
        };
      })()
    : { left: "50%", top: "38%", transform: "translate(-50%, -50%)" };

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="dialog" aria-label="新手导览">
      {/* 遮罩 + 高亮框 */}
      <div className="absolute inset-0 bg-ink/45" onClick={close} />
      {rect && (
        <div
          className="pointer-events-none absolute rounded-xl border-2 border-accent shadow-[0_0_0_4px_rgba(0,0,0,0.06)]"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      {/* 说明卡 */}
      <div className="absolute w-[360px] max-w-[calc(100vw-32px)] rounded-xl border border-line bg-paper p-4 shadow-xl" style={cardPos}>
        <div className="flex items-center justify-between">
          <span className="num text-[11px] tracking-[0.15em] text-ink-3">
            新手导览 {step + 1}/{STEPS.length}
          </span>
          <button onClick={close} className="text-[12px] text-ink-3 hover:text-ink">
            跳过
          </button>
        </div>
        <div className="mt-2 text-[15px] font-bold text-ink">{s.title}</div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{s.text}</p>
        {s.href && (
          <Link href={s.href} onClick={close} className="mt-2 inline-block text-[13px] font-semibold text-accent hover:underline">
            {s.hrefLabel}
          </Link>
        )}
        <div className="mt-3.5 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-accent" : "bg-line"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="rounded-full border border-line px-3 py-1 text-[12.5px] text-ink-2 hover:text-ink">
                上一步
              </button>
            )}
            <button
              onClick={() => (last ? close() : setStep(step + 1))}
              className="rounded-full bg-accent px-3.5 py-1 text-[12.5px] font-semibold text-accent-ink hover:opacity-90"
            >
              {last ? "开始探索" : "下一步"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
