// 服务端专用：把浏览器带来的 session cookie 转发给 zmzai-auth 中心识别登录态。
// auth 不可达（本地未启动 auth）时返回 null，arena 降级为未登录、不崩溃。
// （auth.ts 保持客户端安全，不引入 next/server 类型；本文件只被 route handlers / 服务端组件引用）

import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { AUTH_ORIGIN, type SessionUser } from "@/lib/auth";

async function resolveUser(cookie: string): Promise<SessionUser | null> {
  if (!cookie) return null;
  try {
    const res = await fetch(`${AUTH_ORIGIN}/api/me`, {
      headers: { cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: SessionUser | null };
    return data.user ?? null;
  } catch {
    // 会话服务不可达时按未登录处理
    return null;
  }
}

/** 服务端组件用：读 next/headers 的 cookie 识别登录态 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookie = (await cookies()).toString();
    return resolveUser(cookie);
  } catch {
    return null;
  }
}

/** Route Handler 用：直接从请求头取 cookie（比 next/headers 更快、无静态化约束） */
export async function sessionFromRequest(req: NextRequest): Promise<SessionUser | null> {
  return resolveUser(req.headers.get("cookie") ?? "");
}
