import { NextRequest, NextResponse } from "next/server";
import { BILLING_ADMIN_SECRET, PLAN } from "@/lib/billing";
import { setPlan, BillingStoreError } from "@/lib/billing-store";

export const dynamic = "force-dynamic";

// 管理员发放/回收 Pro（内测与客服补偿）。
// 鉴权：请求头 x-admin-secret 必须与服务器 BILLING_ADMIN_SECRET 一致（与部署 env 同源）。
export async function POST(req: NextRequest) {
  const secret = BILLING_ADMIN_SECRET();
  if (!secret) {
    return NextResponse.json(
      { code: "ADMIN_DISABLED", error: "服务器未配置 BILLING_ADMIN_SECRET" },
      { status: 503 }
    );
  }
  if (req.headers.get("x-admin-secret") !== secret) {
    return NextResponse.json({ code: "FORBIDDEN", error: "无效的管理员密钥" }, { status: 403 });
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

  const expiresAt =
    plan === PLAN.PRO && typeof o.durationDays === "number" && o.durationDays > 0
      ? new Date(Date.now() + o.durationDays * 86_400_000).toISOString()
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
