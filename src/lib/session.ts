// 服务端专用：读浏览器带来的 session cookie，转发 zmzai-auth 的 /api/me 识别登录态。
// auth 不可达（本地未启动 auth）时返回 null，arena 降级为未登录、不崩溃。
import { cookies } from "next/headers";
import { AUTH_ORIGIN, type SessionUser } from "./auth";

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookie = (await cookies()).toString();
    const res = await fetch(`${AUTH_ORIGIN}/api/me`, {
      headers: cookie ? { cookie } : {},
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: SessionUser | null };
    return data.user ?? null;
  } catch {
    return null;
  }
}
