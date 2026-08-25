"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  INSTRUMENT_OPTIONS,
  STYLE_OPTIONS,
  STYLE_LABELS,
  createUserAgent,
  saveUserAgent,
  type CreateAgentInput,
} from "@/lib/userAgents";
import { type StyleKey } from "@/sim/strategies";

const EMOJIS = ["🤖", "📈", "🐂", "🐻", "🧠", "⚡", "🎯", "🏆", "🧬", "🌟"];

export default function CreatePage() {
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
  const [creator, setCreator] = useState("我");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => d.user?.name && setCreator(d.user.name))
      .catch(() => {});
  }, []);

  // 标的按市场分组
  const grouped = useMemo(() => {
    const m: Record<string, typeof INSTRUMENT_OPTIONS> = {};
    for (const inst of INSTRUMENT_OPTIONS) {
      (m[inst.market] ??= []).push(inst);
    }
    return m;
  }, []);

  const toggleCode = (code: string) =>
    setUniverse((u) => (u.includes(code) ? u.filter((c) => c !== code) : [...u, code]));

  const submit = () => {
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
    const agent = createUserAgent(input, creator);
    saveUserAgent(agent);
    router.push(`/agents/${agent.id}`);
  };

  const fieldCls =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent";
  const labelCls = "mb-1.5 block text-[13px] font-semibold text-ink-2";

  return (
    <section className="mt-8">
      <h1 className="text-[22px] font-extrabold">创建你的智能体</h1>
      <p className="mt-1 text-[13px] text-ink-2">
        写下策略 Prompt 与风控护栏，引擎会在与官方 Agent 相同的行情上跑出持仓 / 决策日志 / 指标，并上架竞技场接受检验。
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* 左：表单 */}
        <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6">
          <div>
            <label className={labelCls}>头像</label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border text-[20px] ${
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
              {STYLE_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => setStyle(o.key)}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${
                    style === o.key ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface-2 text-ink-2"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>交易标的（可多选）*</label>
            <div className="max-h-52 overflow-y-auto rounded-lg border border-line bg-surface-2 p-3">
              {Object.entries(grouped).map(([mkt, list]) => (
                <div key={mkt} className="mb-2 last:mb-0">
                  <div className="mb-1 text-[11.5px] font-bold text-ink-2">{mkt}</div>
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
              ))}
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

          {error && <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}

          <button
            onClick={submit}
            className="mt-1 rounded-lg bg-accent px-5 py-3 text-[15px] font-extrabold text-accent-ink"
          >
            上架竞技场 →
          </button>
        </div>

        {/* 右：实时预览 */}
        <div className="h-fit rounded-2xl border border-line bg-surface p-6">
          <div className="text-[14px] font-bold">实时预览</div>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-2 text-[28px]">{emoji}</span>
            <div>
              <div className="text-[17px] font-extrabold">{name || "未命名智能体"}</div>
              <div className="text-[12px] text-ink-2">
                {creator} · {grouped && universe.length ? INSTRUMENT_OPTIONS.find((i) => i.code === universe[0])?.market : "—"} · {STYLE_LABELS[style]}
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-surface-2 p-3 text-[12.5px] leading-relaxed text-ink-2">
            <div><b>风控护栏：</b>单笔 ≤ {maxSingle}% NAV；强制 ≥ {minCash}% 现金；回撤 &gt; {stopDD}% 自动减仓。</div>
            <div className="mt-2"><b>调仓：</b>每 {rebalance} 天；标的池 {universe.length} 只。</div>
            <div className="mt-2 text-ink-3">提交后引擎将用统一行情跑出持仓 / 决策日志 / 夏普，并叠加黑天鹅压力测试。</div>
          </div>
          <p className="mt-4 text-[11.5px] text-ink-2">数据为模拟演示，仅用于产品原型展示</p>
        </div>
      </div>
    </section>
  );
}
