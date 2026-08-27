"use client";

// 风险偏好匹配向导：4 题问卷（点选即进下一题，可回退）→ 风险档位 + TOP3 推荐卡。
// 推荐一律基于官方 Agent 真实字段（riskScore/style/tier/maxDD），理由可解释、零编造。

import Link from "next/link";
import { useMemo, useState } from "react";
import { agents } from "@/data/agents";
import { MATCH_QUESTIONS, matchAgents, scoreAnswers, type MatchResult, type RiskProfile } from "@/lib/risk-match";
import { fmtPct, tierBadge } from "@/lib/format";
import { useIsFollowed, toggleFollow } from "@/lib/follows";

export function MatchWizard() {
  const [step, setStep] = useState(0); // 0..3 答题中，4 = 结果
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const profile: RiskProfile | null = step < 4 ? null : scoreAnswers(answers);
  const results: MatchResult[] = useMemo(
    () => (profile ? matchAgents(profile, agents) : []),
    [profile]
  );

  const pick = (qid: string, score: number) => {
    setAnswers((prev) => ({ ...prev, [qid]: score }));
    setStep((s) => s + 1);
  };
  const reset = () => {
    setAnswers({});
    setStep(0);
  };

  if (step < 4) {
    const q = MATCH_QUESTIONS[step];
    return (
      <div className="mx-auto mt-8 max-w-[640px]">
        {/* 进度：4 段 */}
        <div className="grid grid-cols-4 gap-1.5">
          {MATCH_QUESTIONS.map((_, i) => (
            <div key={i} className={`h-1 ${i <= step ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
        <p className="num mt-3 text-[11px] tracking-[0.12em] text-ink-3">
          QUESTION {step + 1} / {MATCH_QUESTIONS.length}
        </p>
        <h2 className="mt-2 text-[20px] font-extrabold tracking-tight">{q.q}</h2>
        <div className="mt-4 space-y-2.5">
          {q.options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => pick(q.id, opt.score)}
              className="block w-full rounded border border-line bg-surface px-4 py-3.5 text-left transition-colors hover:border-accent hover:bg-surface-2"
            >
              <span className="text-[14.5px] font-bold">{opt.label}</span>
              {opt.hint && <span className="ml-2 text-[12px] text-ink-3">{opt.hint}</span>}
            </button>
          ))}
        </div>
        {step > 0 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="num mt-5 text-[11px] tracking-[0.1em] text-ink-3 hover:text-ink"
          >
            ← 上一题
          </button>
        )}
        <p className="mt-8 text-[11.5px] leading-relaxed text-ink-3">
          4 道题，约 30 秒。结果为风格匹配参考，不构成投资建议。
        </p>
      </div>
    );
  }

  const bandColor =
    profile!.band === "保守" || profile!.band === "稳健"
      ? "text-accent"
      : profile!.band === "平衡"
        ? "text-ink"
        : "text-danger";

  return (
    <div className="mx-auto mt-8 max-w-[760px]">
      {/* 风险档位卡 */}
      <div className="rounded border border-line bg-surface p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="num text-[11px] tracking-[0.15em] text-ink-3">YOUR RISK PROFILE</p>
            <h2 className={`mt-1 text-[26px] font-extrabold tracking-tight ${bandColor}`}>
              {profile!.band}型
            </h2>
          </div>
          <div className="num text-right">
            <span className="text-[30px] font-extrabold leading-none">{profile!.score}</span>
            <span className="text-[12px] text-ink-3"> / 100 风险胃口</span>
          </div>
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">{profile!.bandDesc}</p>
        {/* 风险轴 */}
        <div className="relative mt-4 h-1.5 rounded bg-line">
          <div className="absolute left-0 top-0 h-1.5 rounded bg-accent" style={{ width: `${profile!.score}%` }} />
        </div>
        <div className="num mt-1 flex justify-between text-[10px] text-ink-3">
          <span>保守</span>
          <span>激进</span>
        </div>
      </div>

      {/* TOP3 推荐 */}
      <h3 className="mt-6 text-[15px] font-extrabold">为你匹配的 AI 交易员</h3>
      <div className="mt-3 space-y-3">
        {results.map((r, i) => (
          <MatchCard key={r.agent.id} result={r} rank={i + 1} />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <button
          onClick={reset}
          className="rounded border border-line px-4 py-2 text-[13px] font-bold text-ink transition-colors hover:bg-surface-2"
        >
          重新测一遍
        </button>
        <Link
          href="/arena"
          className="rounded border border-line px-4 py-2 text-[13px] font-bold text-ink transition-colors hover:bg-surface-2"
        >
          看完整榜单
        </Link>
        <Link
          href="/create"
          className="rounded bg-accent px-4 py-2 text-[13px] font-bold text-accent-ink transition-opacity hover:opacity-85"
        >
          没满意的？自己造一个
        </Link>
      </div>
      <p className="mt-5 text-[11.5px] leading-relaxed text-ink-3">
        匹配结果基于各 Agent 的真实回测指标（风险分 / 最大回撤 / 验证级别 / 策略风格）计算，
        仅供参考，不构成投资建议。所有业绩为模拟回测产物。
      </p>
    </div>
  );
}

function MatchCard({ result, rank }: { result: MatchResult; rank: number }) {
  const { agent, match, reasons } = result;
  const followed = useIsFollowed(agent.id);
  const tb = tierBadge(agent.tier);
  return (
    <div className="rounded border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="num text-[12px] font-bold text-ink-3">#{rank}</span>
        <Link href={`/agents/${agent.id}`} className="text-[15px] font-extrabold hover:underline">
          {agent.emoji} {agent.name}
        </Link>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-bold text-ink-2">{agent.style}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${tb.className}`}>{tb.label}</span>
        <span className="num ml-auto text-[18px] font-extrabold text-accent">{match}%</span>
        <button
          onClick={() => toggleFollow(agent.id)}
          className={`rounded border px-2.5 py-1 text-[11.5px] font-bold transition-colors ${
            followed ? "border-accent text-accent" : "border-line text-ink-2 hover:bg-surface-2"
          }`}
        >
          {followed ? "已关注" : "关注"}
        </button>
      </div>
      <div className="num mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-ink-2">
        <span>总收益 <span className={agent.totalReturn >= 0 ? "up" : "down"}>{fmtPct(agent.totalReturn)}</span></span>
        <span>最大回撤 <span className="down">{fmtPct(agent.maxDD)}</span></span>
        <span>夏普 <span className="font-bold text-ink">{agent.sharpe.toFixed(2)}</span></span>
        <span className="text-ink-3">{agent.slogan}</span>
      </div>
      <ul className="mt-2 space-y-0.5">
        {reasons.map((rs) => (
          <li key={rs} className="text-[11.5px] leading-relaxed text-ink-3">· {rs}</li>
        ))}
      </ul>
    </div>
  );
}
