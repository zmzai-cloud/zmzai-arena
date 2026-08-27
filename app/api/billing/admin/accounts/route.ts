import { NextRequest, NextResponse } from "next/server";
import { BILLING_ADMIN_SECRET } from "@/lib/billing";
import { listAccounts, BillingStoreError } from "@/lib/billing-store";

export const dynamic = "force-dynamic";

// 运营后台：全量账户列表（按创建时间倒序）。鉴权与 grant 同源（x-admin-secret）。
export async function GET(req: NextRequest) {
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

  let accounts;
  try {
    accounts = listAccounts();
  } catch (e) {
    if (e instanceof BillingStoreError) {
      return NextResponse.json({ code: "BILLING_UNAVAILABLE", error: "计费服务暂不可用" }, { status: 503 });
    }
    throw e;
  }

  // 最新创建的在前（运营者优先看到新申请）
  accounts.sort((a, b) => (a.account.createdAt < b.account.createdAt ? 1 : -1));
  return NextResponse.json({
    ok: true,
    total: accounts.length,
    accounts: accounts.map(({ key, account }) => ({
      key,
      userId: account.userId,
      plan: account.plan,
      planSource: account.planSource,
      planSince: account.planSince,
      expiresAt: account.expiresAt,
      quota: account.quota,
      createdAt: account.createdAt,
    })),
  });
}
