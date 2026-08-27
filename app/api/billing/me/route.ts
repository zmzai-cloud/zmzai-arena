import { NextRequest, NextResponse } from "next/server";
import { AUTH_ORIGIN, getSessionUser, type SessionUser } from "@/lib/auth";
import { accountKey, getAccount, peekQuota, BillingStoreError } from "@/lib/billing-store";
import { PLANS } from "@/lib/billing";
import { xorpayConfig } from "@/lib/xorpay";

export const dynamic = "force-dynamic";

// 查询当前账户：计划、滚动 30 天回测额度、权益快照。
// 登录用户按 SSO userId 记账；未登录按「anon:<ip>」独立记账（同样享受免费额度）。
export async function GET(req: NextRequest) {
  // 复用 getSessionUser 解析登录态（SSO 会话代理）
  let user: SessionUser | null = null;
  try {
    user = await getSessionUser(req);
  } catch {
    // 会话服务不可达时按匿名账户处理
  }

  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0]?.trim() : null) || req.headers.get("x-real-ip") || "unknown";
  const key = accountKey(user, ip);
  let acc, quota;
  try {
    acc = getAccount(key);
    quota = peekQuota(key);
  } catch (e) {
    if (e instanceof BillingStoreError) {
      return NextResponse.json({ code: "BILLING_UNAVAILABLE", error: "计费服务暂不可用" }, { status: 503 });
    }
    throw e;
  }
  const def = PLANS[acc.plan];

  return NextResponse.json({
    user,
    // 支付通道配置状态：未配置时前端展示「内测发放」引导（配置后自动切回支付模式，无需改前端）
    payment: { provider: "xorpay", configured: xorpayConfig() !== null },
    account: {
      plan: acc.plan,
      planSince: acc.planSince,
      planSource: acc.planSource,
      planName: def.name,
      quota: {
        used: quota.used,
        limit: quota.limit === Infinity ? null : quota.limit,
        remaining: quota.remaining === Infinity ? null : quota.remaining,
        windowEnd: acc.quota.windowEnd,
      },
      perks: {
        maxSimDays: def.maxSimDays,
        privateListings: def.privateListings,
        reportExport: def.reportExport,
      },
    },
  });
}
