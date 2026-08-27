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

// next 必须是绝对 URL（含子域），否则 auth 登录后回跳会落到 auth 自身域而非 arena。
// arena 这边只拿到相对 pathname，故自动补上当前 origin。
function absNext(next: string): string {
  if (/^https?:\/\//.test(next)) return next;
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  return `${origin}${next || "/"}`;
}

export function loginUrl(next: string): string {
  return `${AUTH_ORIGIN}/login?next=${encodeURIComponent(absNext(next))}`;
}

export function logoutUrl(next: string): string {
  return `${AUTH_ORIGIN}/logout?next=${encodeURIComponent(absNext(next))}`;
}

// 服务端：从请求 cookie 解析当前登录用户（SSO 会话代理，与 /api/me 同源）。
// 仅接受请求头对象（不引入 next/headers，保持可被客户端安全引用）。
export async function getSessionUser(
  req: Pick<Request, "headers">
): Promise<SessionUser | null> {
  const cookie = req.headers.get("cookie") ?? "";
  if (!cookie) return null;
  try {
    const res = await fetch(`${AUTH_ORIGIN}/api/me`, {
      headers: { cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { user: SessionUser | null };
      return data.user;
    }
  } catch {
    // 会话服务不可达时按未登录处理
  }
  return null;
}
