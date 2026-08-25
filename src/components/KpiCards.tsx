import { agents } from "@/data/agents";

export function KpiCards() {
  const avgSharpe = (agents.reduce((s, a) => s + a.sharpe, 0) / agents.length).toFixed(2);
  const maxRisk = Math.max(...agents.map((a) => a.riskScore));
  const totalFollow = agents.reduce((s, a) => s + a.followers, 0);

  const items = [
    { v: avgSharpe, l: "平均夏普比率" },
    { v: maxRisk, l: "最高风险分 / 100" },
    { v: totalFollow.toLocaleString(), l: "总关注数" },
    { v: agents.length, l: "在榜智能体" },
  ];

  return (
    <div className="mt-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.l} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <div className="text-[26px] font-extrabold">{it.v}</div>
          <div className="mt-0.5 text-[12.5px] text-ink-2">{it.l}</div>
        </div>
      ))}
    </div>
  );
}
