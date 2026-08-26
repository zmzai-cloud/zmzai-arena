import { NextRequest, NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import {
  listUserAgents,
  saveUserAgentFor,
  sanitizeAgent,
  UserAgentStoreError,
} from "@/lib/user-agent-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 用户策略云存储：登录用户跨设备同步（user:<id> 绑定），未登录一律 401（客户端按匿名处理）。
// GET  → 当前用户的全部策略；POST → 保存/覆盖单个策略（按 id 幂等）。
export async function GET(req: NextRequest) {
  const user = await sessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    return NextResponse.json({ agents: listUserAgents(user.id) });
  } catch (e) {
    if (e instanceof UserAgentStoreError) {
      return NextResponse.json({ error: "用户策略存储暂不可用" }, { status: 503 });
    }
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const user = await sessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const s = sanitizeAgent(body);
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: 400 });

  try {
    saveUserAgentFor(user.id, s.agent);
    return NextResponse.json({ ok: true, id: s.agent.id });
  } catch (e) {
    if (e instanceof UserAgentStoreError) {
      const cause = e.cause instanceof Error ? e.cause : null;
      const overLimit = !!cause && /上限/.test(cause.message);
      const msg = overLimit && cause ? cause.message : "用户策略存储暂不可用";
      return NextResponse.json({ error: msg }, { status: overLimit ? 409 : 503 });
    }
    throw e;
  }
}
