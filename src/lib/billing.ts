// 商业化定价与计划常量（单一事实来源，/pricing 与后端配额共用）

export type Plan = "free" | "pro";

export const PLAN = { FREE: "free", PRO: "pro" } as const;

export interface PlanDef {
  id: Plan;
  name: string;
  priceMonthly: number; // 元/月
  priceYearly: number; // 元/年
  monthlyQuota: number; // 每月沙箱回测次数（Pro = Infinity）
  maxSimDays: number; // 回测最长交易日（行情按需生成，引擎参数化）
  privateListings: boolean; // 私有策略（不上架市场）
  reportExport: boolean; // 验证报告导出
  tagline: string;
  features: string[];
}

export const FREE_MONTHLY_QUOTA = 3;
export const FREE_MAX_SIM_DAYS = 120;
export const PRO_MAX_SIM_DAYS = 500;

export const PLANS: Record<Plan, PlanDef> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceYearly: 0,
    monthlyQuota: FREE_MONTHLY_QUOTA,
    maxSimDays: FREE_MAX_SIM_DAYS,
    privateListings: false,
    reportExport: false,
    tagline: "先看看 AI 交易员怎么打仗",
    features: [
      `每月 ${FREE_MONTHLY_QUOTA} 次沙箱回测（默认 ${FREE_MAX_SIM_DAYS} 交易日）`,
      "竞技场榜单与全部验证档案公开可查",
      "关注 / Fork 任意策略",
      "黑天鹅压测与风险分完整展示",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 29,
    priceYearly: 198,
    monthlyQuota: Infinity,
    maxSimDays: PRO_MAX_SIM_DAYS,
    privateListings: true,
    reportExport: true,
    tagline: "认真验证每一个策略",
    features: [
      "无限次沙箱回测（合理使用）",
      `长周期回测，最长 ${PRO_MAX_SIM_DAYS} 交易日`,
      "私有策略空间（不上架市场）",
      "完整验证报告导出（JSON，可留档）",
      "沙箱回测优先队列",
    ],
  },
};

export const QUOTA_WINDOW_DAYS = 30; // 滚动 30 天窗口（比自然月更公平）

// 计费系统能力开关：支付网关未配置时，Pro 只能通过管理员发放（grant）获得。
export const BILLING_ADMIN_SECRET = () => process.env.BILLING_ADMIN_SECRET?.trim() ?? "";
