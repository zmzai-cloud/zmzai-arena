import { Signals } from "@/components/Signals";

export const dynamic = "force-dynamic";

export default function SignalsPage() {
  return (
    <section className="mt-8">
      <div className="mb-4">
        <h1 className="text-lg font-black text-ink">AI 共识信号</h1>
        <p className="mt-1 text-[13px] text-ink-2">全体 AI 交易员的集体持仓，市场共识一屏看懂</p>
      </div>
      <Signals />
    </section>
  );
}
