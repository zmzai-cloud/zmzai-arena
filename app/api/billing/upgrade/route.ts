import { NextRequest, NextResponse } from "next/server";
import { AUTH_ORIGIN, type SessionUser } from "@/lib/auth";
import { accountKey, getAccount } from "@/lib/billing-store";
import { PLANS } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 创建 Paddle Checkout 交易：返回可直接跳转的 checkout URL。
// 支付成功由 Paddle webhook（/api/billing/webhook）回调落账，无需前端参与。
// 未配置 Paddle 凭据时返回 503（前端降级为「内测发放」入口，不展示假支付）。
export async function POST(req: NextRequest) {
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  const priceMonthly = process.env.PADDLE_PRICE_MONTHLY?.trim();
  const priceYearly = process.env.PADDLE_PRICE_YEARLY?.trim();
  if (!apiKey || !priceMonthly || !priceYearly) {
    return NextResponse.json(
      {
        code: "PAYMENT_NOT_CONFIGURED",
        error: "支付网关尚未开通，Pro 暂通过内测发放获得",
      },
      { status: 503 }
    );
  }

  // 支付必须挂到登录账号：匿名 IP 会变，无法对账
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
  const priceId = period === "yearly" ? priceYearly : period === "monthly" ? priceMonthly : null;
  if (!priceId) {
    return NextResponse.json({ code: "INVALID_BODY", error: "period 必须是 monthly / yearly" }, { status: 400 });
  }

  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0]?.trim() : null) || req.headers.get("x-real-ip") || "unknown";
  const key = accountKey(user, ip);
  const acc = getAccount(key);

  const origin = req.headers.get("origin") ?? req.nextUrl.origin ?? "https://arena.zmzai.cloud";

  try {
    const res = await fetch("https://api.paddle.com/transactions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Paddle-Version": "2024-10-02",
      },
      body: JSON.stringify({
        items: [{ price_id: priceId, quantity: 1 }],
        custom_data: { account_key: key },
        success_url: `${origin}/me?paid=1`,
        // 用户当前已是 Pro 时仍允许续期（Paddle 会走订阅），这里统一用 transaction 一次性支付
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { code: "PADDLE_ERROR", error: `支付网关错误（${res.status}）`, detail: detail.slice(0, 400) },
        { status: 502 }
      );
    }
    const tx = (await res.json()) as { data?: { id?: string; checkout?: { url?: string } } };
    const checkoutUrl = tx.data?.checkout?.url;
    if (!checkoutUrl) {
      return NextResponse.json({ code: "PADDLE_ERROR", error: "支付网关未返回结账地址" }, { status: 502 });
    }
    return NextResponse.json({ checkoutUrl, transactionId: tx.data?.id ?? null, plan: PLANS.pro.name });
  } catch {
    return NextResponse.json({ code: "PADDLE_UNREACHABLE", error: "支付网关不可达，请稍后再试" }, { status: 502 });
  }
}
