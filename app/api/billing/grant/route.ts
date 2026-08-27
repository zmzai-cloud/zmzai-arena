import { NextRequest, NextResponse } from "next/server";
import { PLAN } from "@/lib/billing";
import { setPlan, getAccount, BillingStoreError } from "@/lib/billing-store";
import { isBillingAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// 管理员发放/回收 Pro（内测与客服补偿）。
// 鉴权双通道：请求头 x-admin-secret 与服务器 BILLING_ADMIN_SECRET 一致，或已登录的 SSO admin 账号。
export async function POST(req: NextRequest) {
  if (!(await isBillingAdmin(req))) {
    return NextResponse.json(
      { code: "FORBIDDEN", error: "无权限：需要管理员密钥或 admin 账号" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY", error: "请求体必须是 JSON" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const key = typeof o.accountKey === "string" ? o.accountKey : null;
  const plan = o.plan === PLAN.PRO || o.plan === PLAN.FREE ? o.plan : null;
  if (!key || !plan) {
    return NextResponse.json(
      { code: "INVALID_BODY", error: "accountKey（user:<id> / anon:<ip>）与 plan（free/pro）必填" },
      { status: 400 }
    );
  }

  // 续期语义：未过期的 Pro 从原到期时间累加（避免覆盖剩余时长），否则从现在起算
  let base = Date.now();
  if (plan === PLAN.PRO && typeof o.durationDays === "number" && o.durationDays > 0) {
    try {
      const existing = getAccount(key);
      if (existing?.plan === PLAN.PRO && existing.expiresAt) {
        const t = new Date(existing.expiresAt).getTime();
        if (t > base) base = t;
      }
    } catch {
      // 读取失败按从现在起算（存储层会在 setPlan 再报错）
    }
  }
  const expiresAt =
    plan === PLAN.PRO && typeof o.durationDays === "number" && o.durationDays > 0
      ? new Date(base + o.durationDays * 86_400_000).toISOString()
      : null;
  try {
    const acc = setPlan(key, plan, "grant", expiresAt);
    return NextResponse.json({ ok: true, account: acc });
  } catch (e) {
    if (e instanceof BillingStoreError) {
      return NextResponse.json({ code: "BILLING_UNAVAILABLE", error: "计费服务暂不可用" }, { status: 503 });
    }
    throw e;
  }
}
