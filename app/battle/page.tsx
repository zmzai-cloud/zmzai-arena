import { Battle } from "@/components/Battle";

export const dynamic = "force-dynamic";

// 对决擂台：2~6 名策略同场竞技（同一段新行情重跑，比曲线与指标）
export default function BattlePage() {
  return (
    <section className="mt-8">
      <Battle />
    </section>
  );
}
