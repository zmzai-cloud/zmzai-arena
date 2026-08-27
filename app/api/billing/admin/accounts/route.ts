import { NextRequest, NextResponse } from "next/server";
import { listAccounts, BillingStoreError } from "@/lib/billing-store";
import { isBillingAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// 运营后台：全量账户列表（按创建时间倒序）。鉴权双通道：x-admin-secret 或已登录的 SSO admin 账号。
export async function GET(req: NextRequest) {
  if (!(await isBillingAdmin(req))) {
    return NextResponse.json(
      { code: "FORBIDDEN", error: "无权限：需要管理员密钥或 admin 账号" },
      { status: 403 }
    );
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
