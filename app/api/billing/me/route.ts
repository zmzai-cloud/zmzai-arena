import { NextRequest, NextResponse } from "next/server";
import { AUTH_ORIGIN, type SessionUser } from "@/lib/auth";
import { accountKey, getAccount, peekQuota, BillingStoreError } from "@/lib/billing-store";
import { PLANS } from "@/lib/billing";

export const dynamic = "force-dynamic";

// 查询当前账户：计划、滚动 30 天回测额度、权益快照。
// 登录用户按 SSO userId 记账；未登录按「anon:<ip>」独立记账（同样享受免费额度）。
export async function GET(req: NextRequest) {
  // 复用 /api/me 的会话解析逻辑，避免重复实现
  const cookie = req.headers.get("cookie") ?? "";
  let user: SessionUser | null = null;
  if (cookie) {
    try {
      const res = await fetch(`${AUTH_ORIGIN}/api/me`, {
        headers: { cookie },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { user: SessionUser | null };
        user = data.user;
      }
    } catch {
      // 会话服务不可达时按匿名账户处理
    }
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
