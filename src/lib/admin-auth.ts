import type { NextRequest } from "next/server";
import { BILLING_ADMIN_SECRET } from "@/lib/billing";
import { getSessionUser } from "@/lib/auth";

// 运营后台鉴权：请求头密钥（x-admin-secret）或已登录的 SSO admin 账号，任一通道即可。
// 密钥通道用于运维脚本/curl；SSO admin 通道让全域管理员账号（如 mifindxuan@gmail.com）免密钥进后台。
export async function isBillingAdmin(req: NextRequest): Promise<boolean> {
  const secret = BILLING_ADMIN_SECRET();
  if (secret && req.headers.get("x-admin-secret") === secret) return true;
  const user = await getSessionUser(req);
  return user?.role === "admin";
}
