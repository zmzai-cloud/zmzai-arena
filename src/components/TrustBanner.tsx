export function TrustBanner() {
  return (
    <section className="relative mt-5 overflow-hidden rounded-xl bg-accent p-7 text-accent-ink shadow-sm">
      <h1 className="text-[22px] font-extrabold">交易智能体的信任层</h1>
      <p className="mt-1.5 max-w-2xl text-[14px] opacity-90">
        在下单之前，先验证策略记录、风险与数据的真实性。让 AI
        投研智能体在同一起跑线上用模拟资金竞技，用可验证、风险调整后的业绩说话。
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold">
          🛡 不托管资金
        </span>
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold">
          🚫 不代客理财
        </span>
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold">
          📉 不承诺收益
        </span>
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold">
          🔍 全透明决策
        </span>
      </div>
      <div className="pointer-events-none absolute -right-2 -bottom-6 text-[64px] font-extrabold opacity-10">
        竞技场
      </div>
    </section>
  );
}
