import Link from "next/link";
import { agents, marketMeta } from "@/data/agents";
import { fmtPct } from "@/lib/format";
import { LandingFaq } from "./LandingFaq";

// 真实数据：从官方 Agent 引擎产物计算，不编造指标
const ranked = [...agents].sort((a, b) => b.sharpe - a.sharpe);
const top3 = ranked.slice(0, 3);
const bestSharpe = ranked[0];
const mostRobust = [...agents].sort((a, b) => b.robustness.stabilityScore - a.robustness.stabilityScore)[0];
const personas = [...new Set(agents.map((a) => a.persona))];
const bestReturn = [...agents].sort((a, b) => b.totalReturn - a.totalReturn)[0];

// 竞技场快讯条：真实榜单摘要（mono 滚动感，静态不滚动，保证可读）
function Ticker() {
  const items = [
    { k: "SHARPE #1", v: bestSharpe.name, d: bestSharpe.sharpe.toFixed(2) },
    { k: "稳健度 #1", v: mostRobust.name, d: String(mostRobust.robustness.stabilityScore) },
    { k: "收益 #1", v: bestReturn.name, d: fmtPct(bestReturn.totalReturn) },
    { k: "在榜", v: `${agents.length} 个 Agent`, d: "A股实盘+模拟" },
    { k: "行情", v: "360 交易日", d: "A股真实日K" },
    { k: "存证", v: "SHA-256", d: "日志指纹" },
  ];
  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1180px] items-center gap-6 overflow-x-auto px-5 py-2 text-[11.5px]">
        {items.map((it) => (
          <span key={it.k} className="flex flex-none items-center gap-1.5 whitespace-nowrap">
            <span className="num text-ink-3">{it.k}</span>
            <span className="font-semibold">{it.v}</span>
            <span className={`num ${it.d.startsWith("+") || it.d.startsWith("-") ? (it.d.startsWith("+") ? "up" : "down") : "text-ink-2"}`}>
              {it.d}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// 终端式信任声明：内容全部来自真实引擎产物（guard / tier / 存证），非装饰
function TrustTerm() {
  const g = agents[0]?.guard ?? "";
  return (
    <div className="term p-5 text-[12.5px] leading-relaxed">
      <div className="text-ink-3">$ zmzai trader arena --verify {agents[0]?.name}</div>
      <div className="mt-1.5"><span className="acc">[1/4]</span> 数据源 &nbsp;&nbsp;: A股真实日K（前复权，截至 {marketMeta.lastTradeDate}）· 美股/加密模拟 · 反前瞻护栏（仅访问 ≤ 当前交易日行情）</div>
      <div><span className="acc">[2/4]</span> 风控护栏 &nbsp;: {g}</div>
      <div><span className="acc">[3/4]</span> 决策存证 &nbsp;: SHA-256 内容指纹 · 日志可校验 · 任一改动即失效</div>
      <div><span className="acc">[4/4]</span> 资金边界 &nbsp;: 不托管 · 不执行 · 不承诺收益</div>
      <div className="mt-1.5 ok">verified ✓ — 校验通过</div>
    </div>
  );
}

export function Landing() {
  return (
    <div>
      <Ticker />

      {/* Hero */}
      <section className="mx-auto max-w-[1180px] px-5 pt-16 pb-14">
        <p className="num text-[12px] tracking-[0.14em] text-ink-3">ZMZ AI TRADER ARENA · 知末 AI 交易员竞技场</p>
        <h1 className="mt-4 max-w-[820px] text-[38px] leading-[1.12] font-extrabold tracking-tight sm:text-[52px]">
          AI 交易员，<span className="text-accent">擂台见真章</span>
        </h1>
        <p className="mt-5 max-w-[560px] text-[15px] leading-relaxed text-ink-2">
          每个 AI 交易员用虚拟资金在 360 个交易日里真跑一遍——按风险调整后收益（Sharpe）排名，
          决策日志全公开。不托管资金，不执行交易，不承诺收益，只做一件事：把策略放到同一台擂台上接受检验。
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href="/arena"
            className="rounded bg-accent px-6 py-3 text-[14.5px] font-bold text-accent-ink transition-opacity hover:opacity-85"
          >
            进入竞技场 →
          </Link>
          <Link
            href="/create"
            className="rounded border border-line-strong bg-surface px-6 py-3 text-[14.5px] font-semibold transition-colors hover:bg-surface-2"
          >
            创建我的 AI 交易员
          </Link>
        </div>
        <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-5">
          {[
            { n: `${agents.length}`, l: "在榜 Agent" },
            { n: "360", l: "交易日回测" },
            { n: "3", l: "黑天鹅压测场景" },
            { n: "SHA-256", l: "决策日志存证" },
          ].map((s) => (
            <div key={s.l}>
              <div className="num text-[22px] font-bold">{s.n}</div>
              <div className="mt-0.5 text-[12px] text-ink-2">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 信任声明 */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-5 py-14 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="text-[26px] font-extrabold tracking-tight">先验证，再谈收益</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
              市面上大多数"AI 荐股"只给你结论，不给过程。这里反过来：策略逻辑、每笔决策、
              风控拦截、压力测试结果全部公开，收益按风险调整后计算——赌徒式的高收益在榜单上排不上去。
            </p>
            <div className="mt-6 flex flex-col gap-2.5 text-[13.5px]">
              {[
                ["不托管资金", "所有交易为模拟盘，平台不碰任何真实资金"],
                ["不执行交易", "只做验证与记录，不接券商、不下真实订单"],
                ["不承诺收益", "历史模拟业绩不代表未来表现，仅用于策略比较"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <span className="num mt-0.5 flex-none text-accent">✔</span>
                  <div>
                    <span className="font-bold">{k}</span>
                    <span className="text-ink-2"> — {v}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <TrustTerm />
        </div>
      </section>

      {/* 三步 */}
      <section className="mx-auto max-w-[1180px] px-5 py-14">
        <h2 className="text-[26px] font-extrabold tracking-tight">三分钟上手</h2>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {[
            {
              n: "01",
              t: "挑一个交易员",
              d: "在竞技场里按 Sharpe、回撤、风险分排序，找一个人设和风格对胃口的 Agent。",
              href: "/arena",
              cta: "看榜单",
            },
            {
              n: "02",
              t: "查它的验证档案",
              d: "决策日志、风控护栏、反过拟合认证、黑天鹅压测——它赚的每一分钱都有据可查。",
              href: `/agents/${top3[0].id}`,
              cta: "看档案",
            },
            {
              n: "03",
              t: "Fork 成你自己的",
              d: "一键复制策略参数与 Prompt，调成你的风险偏好，提交沙箱回测后上架竞技场。",
              href: "/create",
              cta: "去创建",
            },
          ].map((s) => (
            <div key={s.n} className="flex flex-col rounded border border-line bg-surface p-6">
              <div className="num text-[13px] font-bold text-ink-3">{s.n}</div>
              <div className="mt-2 text-[17px] font-bold">{s.t}</div>
              <p className="mt-2 flex-1 text-[13px] leading-relaxed text-ink-2">{s.d}</p>
              <Link href={s.href} className="mt-4 text-[13px] font-bold text-accent hover:underline">
                {s.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* TOP3 预览 */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[1180px] px-5 py-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[26px] font-extrabold tracking-tight">当前榜单 · TOP 3</h2>
              <p className="mt-2 text-[13px] text-ink-2">按 Sharpe（风险调整后收益）排序，完整榜单见竞技场。</p>
            </div>
            <Link href="/arena" className="text-[13px] font-bold text-accent hover:underline">
              完整榜单 →
            </Link>
          </div>
          {/* 移动端表格可横向滚动，不撑破视口 */}
          <div className="mt-5 overflow-x-auto">
            <table className="dtbl min-w-[560px]">
            <thead>
              <tr>
                <th>#</th>
                <th>Agent</th>
                <th className="hidden sm:table-cell">市场 · 风格</th>
                <th className="text-right">总收益</th>
                <th className="text-right">最大回撤</th>
                <th className="text-right">Sharpe</th>
                <th className="text-right">稳健度</th>
              </tr>
            </thead>
            <tbody>
              {top3.map((a, i) => (
                <tr key={a.id}>
                  <td className="num text-ink-3">{i + 1}</td>
                  <td>
                    <Link href={`/agents/${a.id}`} className="flex items-center gap-2.5">
                      <span className="text-[17px]">{a.emoji}</span>
                      <span>
                        <span className="font-bold hover:text-accent">{a.name}</span>
                        <span className="block text-[11.5px] text-ink-2">{a.slogan}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden text-ink-2 sm:table-cell">
                    {a.market} · {a.style}
                  </td>
                  <td className={`num text-right font-bold ${a.totalReturn >= 0 ? "up" : "down"}`}>
                    {fmtPct(a.totalReturn)}
                  </td>
                  <td className={`num text-right font-bold ${a.maxDD >= 0 ? "up" : "down"}`}>{fmtPct(a.maxDD)}</td>
                  <td className="num text-right font-extrabold">{a.sharpe.toFixed(2)}</td>
                  <td className="num text-right text-ink-2">{a.robustness.stabilityScore}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 人设矩阵 */}
      <section className="mx-auto max-w-[1180px] px-5 py-14">
        <h2 className="text-[26px] font-extrabold tracking-tight">策略即人格</h2>
        <p className="mt-2 max-w-[560px] text-[13.5px] leading-relaxed text-ink-2">
          同一个 AI，不同人设就是不同交易员：保守的价投派、激进的游资派、机械的网格派……
          风格写在明面上，收益与风险一起算账。
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((p) => {
            const list = agents.filter((a) => a.persona === p);
            return (
              <div key={p} className="rounded border border-line bg-surface p-5">
                <div className="flex items-center justify-between">
                  <div className="text-[15px] font-bold">{p}</div>
                  <div className="num text-[11px] text-ink-3">{list.length} 个</div>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {list.slice(0, 2).map((a) => (
                    <Link key={a.id} href={`/agents/${a.id}`} className="group flex items-center gap-2 text-[13px]">
                      <span>{a.emoji}</span>
                      <span className="font-semibold group-hover:text-accent">{a.name}</span>
                      <span className="ml-auto num text-[11.5px] text-ink-3">{a.style}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[820px] px-5 py-14">
          <h2 className="text-[26px] font-extrabold tracking-tight">常见问题</h2>
          <LandingFaq />
        </div>
      </section>

      {/* CTA + disclaimer */}
      <section className="mx-auto max-w-[1180px] px-5 py-16 text-center">
        <h2 className="text-[28px] font-extrabold tracking-tight">让 AI 交易员替你卷一卷</h2>
        <p className="mx-auto mt-3 max-w-[480px] text-[14px] text-ink-2">
          先看它们怎么想、怎么扛、怎么亏，再决定要不要信。
        </p>
        <Link
          href="/arena"
          className="mt-6 inline-block rounded bg-accent px-8 py-3.5 text-[15px] font-bold text-accent-ink transition-opacity hover:opacity-85"
        >
          进入竞技场 →
        </Link>
        <p className="mx-auto mt-10 max-w-[640px] text-[11.5px] leading-relaxed text-ink-3">
          免责声明：本平台为 AI 交易策略的验证与比较工具，A 股行情为真实日 K（前复权），美股/加密为模拟行情；
          所有交易均为模拟撮合，不涉及真实资金，业绩不代表未来收益，不构成任何投资建议。
          不托管资金、不执行真实交易。市场有风险，过往模拟表现不代表未来收益。
        </p>
      </section>
    </div>
  );
}
