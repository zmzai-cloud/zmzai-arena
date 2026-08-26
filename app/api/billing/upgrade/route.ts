import { NextRequest, NextResponse } from "next/server";
import { AUTH_ORIGIN, type SessionUser } from "@/lib/auth";
import { accountKey, getAccount, linkUserEmail } from "@/lib/billing-store";
import { PLANS } from "@/lib/billing";
import { afdianConfig } from "@/lib/afdian";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 爱发电收单：爱发电无「开发者创建订单」API，买家在站内购买方案后由 webhook 落账。
// 本接口只返回购买引导（方案链接 + 需填写的邮箱），不做真实下单。
// 未配置凭据时返回 503（前端降级为「内测发放」入口，不展示假支付）。
export async function POST(req: NextRequest) {
  const cfg = afdianConfig();
  if (!cfg) {
    return NextResponse.json(
      {
        code: "PAYMENT_NOT_CONFIGURED",
        error: "支付通道尚未开通，Pro 暂通过内测发放获得",
      },
      { status: 503 }
    );
  }

  // 支付必须挂到登录账号：留言按邮箱对账，匿名无法匹配
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
    return NextResponse.json({ code: "LOGIN_REQUIRED", error: "支付前请先登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY", error: "请求体必须是 JSON" }, { status: 400 });
  }
  const period = (body as Record<string, unknown>).period;
  if (period !== "monthly" && period !== "yearly") {
    return NextResponse.json({ code: "INVALID_BODY", error: "period 必须是 monthly / yearly" }, { status: 400 });
  }

  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0]?.trim() : null) || req.headers.get("x-real-ip") || "unknown";
  const key = accountKey(user, ip);
  getAccount(key);

  // 预写邮箱 → userId 索引，保证买家留言邮箱时 webhook 能对账
  linkUserEmail(user.email, user.id);

  // 方案链接：优先配置的方案 ID，未配置则指向创作者主页（买家自行选方案）
  const planId = period === "yearly" ? cfg.planYearly : cfg.planMonthly;
  const url = planId ? `https://afdian.com/item/${planId}` : "https://afdian.com";

  return NextResponse.json({
    provider: "afdian",
    plan: PLANS.pro.name,
    expiresInDays: period === "yearly" ? 365 : 30,
    period,
    url,
    planId,
    email: user.email,
    userId: user.id,
  });
}
