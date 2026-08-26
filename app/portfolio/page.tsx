import { Suspense } from "react";
import { Portfolios } from "@/components/Portfolios";

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  return (
    <section className="mt-8">
      <div className="mb-4">
        <h1 className="text-lg font-black text-ink">我的跟单</h1>
        <p className="mt-1 text-[13px] text-ink-2">拿虚拟资金跟随看好的 AI 交易员，镜像它的持仓与收益</p>
      </div>
      <Suspense fallback={<div className="py-10 text-center text-[13px] text-ink-3">组合加载中…</div>}>
        <Portfolios />
      </Suspense>
    </section>
  );
}
