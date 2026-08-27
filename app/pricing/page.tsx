import type { Metadata } from "next";
import { PricingClient } from "@/components/PricingClient";
import { PLANS } from "@/lib/billing";

export const metadata: Metadata = {
  title: "定价 · Zmz AI Trader Arena",
};

// 定价与权益逐行对比（数据来自 lib/billing 单一事实来源，与后端配额一致）
const ROWS: { label: string; free: string; pro: string }[] = [
  { label: "沙箱回测额度", free: `每月 ${PLANS.free.monthlyQuota} 次`, pro: "无限次（合理使用）" },
  { label: "最长回测周期", free: `${PLANS.free.maxSimDays} 交易日`, pro: `${PLANS.pro.maxSimDays} 交易日` },
  { label: "竞技场榜单 / 验证档案", free: "公开可查", pro: "公开可查" },
  { label: "关注 / Fork 策略", free: "支持", pro: "支持" },
  { label: "私有策略空间", free: "—", pro: "支持（不上架市场）" },
  { label: "验证报告导出（JSON 留档）", free: "—", pro: "支持" },
  { label: "回测优先队列", free: "—", pro: "支持" },
];

export default function PricingPage() {
  return (
    <section className="mx-auto mt-12 max-w-[960px] px-4 pb-20">
      <div className="num text-[11px] tracking-[0.14em] text-ink-3">PRICING · 定价</div>
      <h1 className="mt-2 text-2xl font-extrabold">先验证，再跟仓</h1>
      <p className="mt-2 max-w-[560px] text-[14px] leading-relaxed text-ink-2">
        竞技场所有验证都在模拟盘沙箱中完成，不碰真实资金。免费额度足够体验完整验证流程；
        认真做策略研究的用户升级 Pro，解锁长周期回测与报告留档。
      </p>

      <PricingClient />

      <h2 className="mt-16 text-[15px] font-bold text-ink-2">权益逐项对比</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="dtbl min-w-[640px]">
          <thead>
            <tr>
              <th className="text-left">权益</th>
              <th className="text-right">Free</th>
              <th className="text-right">Pro</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label}>
                <td className="text-left text-ink-2">{r.label}</td>
                <td className="text-right">{r.free}</td>
                <td className="text-right">{r.pro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-12 border border-line p-5">
        <div className="num text-[11px] tracking-[0.14em] text-ink-3">WHY PAID · 为什么收费</div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          每次沙箱回测都在隔离环境中完整重放行情并执行撮合（含滑点与费用），
          是真实的计算成本而非界面动画。免费额度保证任何人都能完整验证一个策略；
          订阅费用用于覆盖算力与持续接入更多行情数据。
        </p>
      </div>

      <div className="mt-4 border border-line p-5">
        <div className="num text-[11px] tracking-[0.14em] text-ink-3">DISCLAIMER · 声明</div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          A股真实日K行情下的模拟回测不代表未来收益，不构成投资建议。付费解锁的是验证工具能力，
          不承诺任何收益。订阅可随时取消，未使用时长按比例退款。
        </p>
      </div>
    </section>
  );
}
