import { NextRequest, NextResponse } from "next/server";
import { AUTH_ORIGIN, type SessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 把浏览器带来的 cookie 转发给 zmzai-auth 中心，问「我是谁」。
// 客户端组件通过它拿登录态（避免直接暴露 auth 内部地址）。
export async function GET(req: NextRequest) {
  const cookie = req.headers.get("cookie") ?? "";
  try {
    const res = await fetch(`${AUTH_ORIGIN}/api/me`, {
      headers: cookie ? { cookie } : {},
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ user: null }, { status: 401 });
    const data = (await res.json()) as { user: SessionUser | null };
    return NextResponse.json({ user: data.user ?? null });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
