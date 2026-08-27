"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  INSTRUMENT_OPTIONS,
  STYLE_OPTIONS,
  STYLE_LABELS,
  STYLE_SIMDAYS,
  createUserAgentRemote,
  saveUserAgent,
  BacktestQuotaError,
  type CreateAgentInput,
} from "@/lib/userAgents";
import { FREE_MAX_SIM_DAYS } from "@/lib/billing";
import { getAgent } from "@/data/agents";
import { getUserAgent } from "@/lib/userAgents";
import { STRATEGIES, type StyleKey } from "@/sim/strategies";
import { INSTRUMENT_MAP, boardOf } from "@/sim/market";

const EMOJIS = ["🤖", "📈", "🐂", "🐻", "🧠", "⚡", "🎯", "🏆", "🧬", "🌟"];

export function CreateForm({ forkId }: { forkId?: string }) {
  const router = useRouter();

  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [style, setStyle] = useState<StyleKey>("momentum");
  const [universe, setUniverse] = useState<string[]>([]);
  const [maxSingle, setMaxSingle] = useState(15);
  const [minCash, setMinCash] = useState(10);
  const [stopDD, setStopDD] = useState(8);
  const [rebalance, setRebalance] = useState(5);
  const [prompt, setPrompt] = useState("");
  const [slogan, setSlogan] = useState("");
  const [query, setQuery] = useState("");
  const [creator, setCreator] = useState("我");
  const [error, setError] = useState("");
  const [quotaUpgrade, setQuotaUpgrade] = useState<string | null>(null);
  const [isPro, setIsPro] = useState<boolean | null>(null); // null = 未知（加载中）
  const [submitting, setSubmitting] = useState(false);
  const [forked, setForked] = useState("");

  // 当前计划：决定风格周期是否被拦截（Free 超 120 天需 Pro）
  useEffect(() => {
    let alive = true;
    fetch("/api/billing/me")
      .then((r) => r.json())
      .then((d) => alive && setIsPro(d.account?.plan === "pro"))
      .catch(() => alive && setIsPro(false));
    return () => {
      alive = false;
    };
  }, []);

  // Fork 预填：挂载后一次性应用（官方 Agent 服务端可解析；用户 Agent 仅存 localStorage，需在客户端读取）
  const forkApplied = useRef(false);
  useEffect(() => {
    if (forkApplied.current || !forkId) return;
    const id = Number(forkId);
    if (!Number.isFinite(id)) return;
    const src = getAgent(id) ?? getUserAgent(id);
    if (!src) return;
    forkApplied.current = true;

    // 风格：官方按 STRATEGIES 的 id 映射；用户 Agent 按中文 label 反查
    const styleKey: StyleKey | undefined =
      STRATEGIES.find((s) => s.id === id)?.style ??
      (Object.entries(STYLE_LABELS).find(([, l]) => l === src.style)?.[0] as StyleKey | undefined);

    setEmoji(src.emoji);
    setName(`${src.name} 复刻`);
    setPersona(src.persona);
    if (styleKey) setStyle(styleKey);
    setUniverse(src.positions.map((p) => p.code).filter((c) => INSTRUMENT_MAP[c]));
    setPrompt(src.prompt);
    setSlogan(src.slogan);
    setForked(src.name);
  }, [forkId]);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => d.user?.name && setCreator(d.user.name))
      .catch(() => {});
  }, []);

  // 标的按板块分组（A 股按代码前缀分板块；美股/加密按市场），搜索时扁平展示过滤结果
  const grouped = useMemo(() => {
    const m: Record<string, typeof INSTRUMENT_OPTIONS> = {};
    for (const inst of INSTRUMENT_OPTIONS) {
      const key = inst.market !== "A股" ? inst.market : boardOf(inst.code);
      (m[key] ??= []).push(inst);
    }
    return m;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return INSTRUMENT_OPTIONS.filter(
      (i) => i.code.includes(q) || i.name.toLowerCase().includes(q)
    ).slice(0, 60); // 搜索命中最多展示 60 只，避免超长列表
  }, [query]);

  const toggleCode = (code: string) =>
    setUniverse((u) => (u.includes(code) ? u.filter((c) => c !== code) : [...u, code]));

  const submit = async () => {
    if (!name.trim()) return setError("请填写智能体名称");
    if (!prompt.trim()) return setError("请填写策略逻辑（Prompt）");
    if (universe.length === 0) return setError("请至少选择 1 个交易标的");

    const input: CreateAgentInput = {
      emoji,
      name,
      persona,
      universe,
      style,
      maxSingle: maxSingle / 100,
      minCash: minCash / 100,
      stopDD: stopDD / 100,
      rebalance,
      prompt,
      slogan,
    };
    setSubmitting(true);
    setError("");
    setQuotaUpgrade(null);
    try {
      // 优先走 zmzai-sandbox 隔离沙箱真实回测（含撮合成本），失败自动降级本地引擎
      const agent = await createUserAgentRemote(input, creator);
      saveUserAgent(agent);
      router.push(`/agents/${agent.id}`);
    } catch (err) {
      if (err instanceof BacktestQuotaError) {
        // 配额/计划拦截：展示升级引导，不降级本地引擎
        setError(err.message);
        setQuotaUpgrade(err.upgradeUrl ?? "/pricing");
      } else {
        setError(err instanceof Error ? err.message : "回测失败，请重试");
      }
      setSubmitting(false);
    }
  };

  const fieldCls =
    "w-full rounded border border-line bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent";
  const labelCls = "mb-1.5 block text-[13px] font-semibold text-ink-2";

  return (
    <section className="mt-8">
      <h1 className="text-[22px] font-extrabold">创建交易员</h1>
      <p className="mt-1 text-[13px] text-ink-2">
        写下策略 Prompt 与风控护栏，引擎会在与官方 Agent 相同的行情上跑出持仓 / 决策日志 / 指标，并上架竞技场接受检验。
      </p>
      {forked && (
        <p className="mt-2 border border-accent/40 bg-accent/10 px-3.5 py-2 text-[12.5px] text-accent">
          ⑂ 已预填「{forked}」的策略与标的（公开 Prompt 部分），风控护栏可按需调整。
        </p>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* 左：表单 */}
        <div className="flex flex-col gap-5 border border-line bg-surface p-6">
          <div>
            <label className={labelCls}>头像</label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`flex h-10 w-10 items-center justify-center rounded border text-[20px] ${
                    emoji === e ? "border-accent bg-accent/10" : "border-line bg-surface-2"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>名称 *</label>
              <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="如：我的动量小子" />
            </div>
            <div>
              <label className={labelCls}>人设标签</label>
              <input className={fieldCls} value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="如：散户逆袭" />
            </div>
          </div>

          <div>
            <label className={labelCls}>交易风格</label>
            <div className="flex flex-wrap gap-2">
              {STYLE_OPTIONS.map((o) => {
                const simDays = STYLE_SIMDAYS[o.key];
                const needsPro = simDays > FREE_MAX_SIM_DAYS && !isPro;
                return (
                  <button
                    key={o.key}
                    onClick={() => setStyle(o.key)}
                    className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${
                      style === o.key ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface-2 text-ink-2"
                    }`}
                  >
                    {o.label}{" "}
                    <span className={`num text-[10.5px] ${style === o.key ? "text-accent-ink/70" : "text-ink-3"}`}>
                      {simDays}d
                    </span>
                    {needsPro && (
                      <span className={`ml-1 rounded px-1 text-[9.5px] font-bold ${style === o.key ? "bg-accent-ink/15 text-accent-ink" : "bg-accent/10 text-accent"}`}>
                        PRO
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {STYLE_SIMDAYS[style] > FREE_MAX_SIM_DAYS && !isPro && (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-warning">
                ⚠ {STYLE_LABELS[style]}回测 {STYLE_SIMDAYS[style]} 个交易日，超出 Free 计划上限（{FREE_MAX_SIM_DAYS} 天），需升级 Pro
                <Link href="/pricing" className="font-semibold underline underline-offset-2">查看定价</Link>
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>
              交易标的（可多选）* <span className="font-normal text-ink-3">已选 {universe.length} 只</span>
            </label>
            <div className="mb-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索代码/名称，如 600519 或 茅台"
                className="h-9 w-full rounded-md border border-line bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
              />
            </div>
            <div className="max-h-52 overflow-y-auto rounded border border-line bg-surface-2 p-3">
              {filtered ? (
                <div className="flex flex-wrap gap-1.5">
                  {filtered.length === 0 && <div className="text-[12px] text-ink-3">无匹配标的</div>}
                  {filtered.map((inst) => (
                    <button
                      key={inst.code}
                      onClick={() => toggleCode(inst.code)}
                      className={`rounded-md border px-2 py-1 text-[12px] ${
                        universe.includes(inst.code)
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-line bg-surface text-ink-2"
                      }`}
                    >
                      {inst.name}
                    </button>
                  ))}
                </div>
              ) : (
                Object.entries(grouped).map(([mkt, list]) => (
                  <div key={mkt} className="mb-2 last:mb-0">
                    <div className="mb-1 text-[11.5px] font-bold text-ink-2">
                      {mkt} <span className="font-normal text-ink-3">{list.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((inst) => (
                        <button
                          key={inst.code}
                          onClick={() => toggleCode(inst.code)}
                          className={`rounded-md border px-2 py-1 text-[12px] ${
                            universe.includes(inst.code)
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-line bg-surface text-ink-2"
                          }`}
                        >
                          {inst.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>单笔上限 {maxSingle}%</label>
              <input type="range" min={5} max={60} value={maxSingle} onChange={(e) => setMaxSingle(+e.target.value)} className="w-full accent-[var(--color-accent)]" />
            </div>
            <div>
              <label className={labelCls}>保留现金 {minCash}%</label>
              <input type="range" min={0} max={40} value={minCash} onChange={(e) => setMinCash(+e.target.value)} className="w-full accent-[var(--color-accent)]" />
            </div>
            <div>
              <label className={labelCls}>止损线 {stopDD}%</label>
              <input type="range" min={2} max={20} value={stopDD} onChange={(e) => setStopDD(+e.target.value)} className="w-full accent-[var(--color-accent)]" />
            </div>
            <div>
              <label className={labelCls}>调仓周期 {rebalance} 天</label>
              <input type="range" min={1} max={30} value={rebalance} onChange={(e) => setRebalance(+e.target.value)} className="w-full accent-[var(--color-accent)]" />
            </div>
          </div>

          <div>
            <label className={labelCls}>策略逻辑 Prompt *</label>
            <textarea
              className={`${fieldCls} h-36 resize-none font-mono text-[13px]`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={"你是一个纪律严明的交易者。\n每日从标的池筛选相对强度最高的标的，\n单只仓位不超过净值的 X%，始终保留现金，\n回撤超限立即减仓。"}
            />
          </div>

          <div>
            <label className={labelCls}>一句话标语（可选）</label>
            <input className={fieldCls} value={slogan} onChange={(e) => setSlogan(e.target.value)} placeholder="如：追最强趋势，纪律执行" />
          </div>

          {error && (
            <div className="border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
              {error}
              {quotaUpgrade && (
                <Link href={quotaUpgrade} className="ml-1 font-semibold underline underline-offset-2">
                  查看 Pro 权益
                </Link>
              )}
            </div>
          )}

            <button
              onClick={submit}
              disabled={submitting}
              className="mt-1 rounded bg-accent px-5 py-3 text-[15px] font-extrabold text-accent-ink disabled:opacity-60"
            >
              {submitting ? "沙箱回测中…" : "上架竞技场 →"}
            </button>
        </div>

        {/* 右：实时预览 */}
        <div className="h-fit border border-line bg-surface p-6">
          <div className="text-[14px] font-bold">实时预览</div>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded bg-surface-2 text-[28px]">{emoji}</span>
            <div>
              <div className="text-[17px] font-extrabold">{name || "未命名智能体"}</div>
              <div className="text-[12px] text-ink-2">
                {creator} · {grouped && universe.length ? INSTRUMENT_OPTIONS.find((i) => i.code === universe[0])?.market : "—"} · {STYLE_LABELS[style]}
              </div>
            </div>
          </div>
          <div className="mt-4 bg-surface-2 p-3 text-[12.5px] leading-relaxed text-ink-2">
            <div><b>风控护栏：</b>单笔 ≤ {maxSingle}% NAV；强制 ≥ {minCash}% 现金；回撤 &gt; {stopDD}% 自动减仓。</div>
            <div className="mt-2"><b>调仓：</b>每 {rebalance} 天；标的池 {universe.length} 只。</div>
            <div className="mt-2 text-ink-3">提交后将提交至 zmzai-sandbox 隔离沙箱做真实回测（含撮合成本），并叠加黑天鹅压力测试。</div>
          </div>
          <p className="mt-4 text-[11.5px] text-ink-2">模拟撮合 · A股真实日K（前复权）+ 美股/加密模拟 · 不构成投资建议</p>
        </div>
      </div>
    </section>
  );
}
