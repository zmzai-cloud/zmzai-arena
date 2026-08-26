import { NextRequest, NextResponse } from "next/server";
import { AUTH_ORIGIN, type SessionUser } from "@/lib/auth";
import { accountKey, peekQuota } from "@/lib/billing-store";
import { PLANS } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 验证报告导出（Pro 权益）：接收客户端提交的策略档案（官方/自建 Agent 同构），
// 服务端校验计划后加盖时间戳与来源声明，返回可留档的 JSON 报告。
// 报告是「验证过程记录」而非资质认证：引擎与数据来源字段透明标注。
export async function POST(req: NextRequest) {
  const cookie = req.headers.get("cookie") ?? "";
  let user: SessionUser | null = null;
  if (cookie) {
    try {
      const res = await fetch(`${AUTH_ORIGIN}/api/me`, {
        headers: { cookie },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { user: SessionUser | null };
        user = data.user;
      }
    } catch {
      // 会话不可达按未登录处理
    }
  }
  if (!user) {
    return NextResponse.json({ code: "LOGIN_REQUIRED", error: "导出报告前请先登录" }, { status: 401 });
  }

  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0]?.trim() : null) || req.headers.get("x-real-ip") || "unknown";
  const key = accountKey(user, ip);
  const quota = peekQuota(key);
  const def = PLANS[quota.plan];
  if (!def.reportExport) {
    return NextResponse.json(
      {
        code: "UPGRADE_REQUIRED",
        error: "验证报告导出为 Pro 权益",
        upgradeUrl: "/pricing",
      },
      { status: 402 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY", error: "请求体必须是 JSON" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const agent = o.agent as Record<string, unknown> | undefined;
  if (!agent || typeof agent.name !== "string" || !agent.name.trim()) {
    return NextResponse.json({ code: "INVALID_BODY", error: "agent.name 必填" }, { status: 400 });
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    product: "Zmz AI Trader Arena",
    generator: "arena.verify.export",
    requestedBy: { userId: user.id, name: user.name },
    engine: typeof o.engine === "string" ? o.engine : "local",
    runId: typeof o.runId === "string" ? o.runId : null,
    simDays: typeof o.simDays === "number" ? o.simDays : null,
    note: typeof o.note === "string" ? o.note : null,
    agent,
    disclaimer:
      "本报告由 Zmz AI Trader Arena 沙箱模拟盘生成，历史回测不代表未来收益，不构成任何投资建议。",
  };

  const fileName = `arena-verify-${agent.name.replace(/[^\w\u4e00-\u9fa5-]/g, "-").slice(0, 40)}-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(report, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
