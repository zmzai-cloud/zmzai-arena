// 客户端安全的 auth 常量与类型（不引入 next/headers，避免进入 client bundle）。
// arena 作为 SSO 客户端：登录态完全由 zmzai-auth 中心管理，本文件只暴露登录/登出跳转地址。

export const AUTH_ORIGIN =
  process.env.NEXT_PUBLIC_AUTH_ORIGIN?.replace(/\/$/, "") ?? "http://localhost:3001";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function loginUrl(next: string): string {
  return `${AUTH_ORIGIN}/login?next=${encodeURIComponent(next || "/")}`;
}

export function logoutUrl(next: string): string {
  return `${AUTH_ORIGIN}/logout?next=${encodeURIComponent(next || "/")}`;
}
