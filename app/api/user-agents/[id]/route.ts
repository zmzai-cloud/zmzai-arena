import { NextRequest, NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { removeUserAgentFor, UserAgentStoreError } from "@/lib/user-agent-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 删除当前用户的某个策略（校验归属，未登录 401）
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id 不合法" }, { status: 400 });
  }

  try {
    const removed = removeUserAgentFor(user.id, id);
    return NextResponse.json({ ok: true, removed });
  } catch (e) {
    if (e instanceof UserAgentStoreError) {
      return NextResponse.json({ error: "用户策略存储暂不可用" }, { status: 503 });
    }
    throw e;
  }
}
