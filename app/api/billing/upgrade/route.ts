import { NextRequest, NextResponse } from "next/server";
import { AUTH_ORIGIN, type SessionUser } from "@/lib/auth";
import { accountKey, getAccount, createPendingOrder, BillingStoreError } from "@/lib/billing-store";
import { PLANS } from "@/lib/billing";
import { xorpayConfig, createXorPayPayment } from "@/lib/xorpay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// XorPay 收单：创建真实支付订单（微信 native 扫码 / 支付宝 H5），返回二维码内容给前端渲染。
// 订单号落 pending 表关联登录用户，webhook 回调凭订单号直接落账，无需留言对账。
// 未配置凭据时返回 503（前端降级为「内测发放」入口，不展示假支付）。
export async function POST(req: NextRequest) {
  const cfg = xorpayConfig();
  if (!cfg) {
    return NextResponse.json(
      {
        code: "PAYMENT_NOT_CONFIGURED",
        error: "支付通道尚未开通，Pro 暂通过内测发放获得",
      },
      { status: 503 }
    );
  }

  // 支付必须挂到登录账号：订单号落 pending 表关联 userId，匿名无法匹配
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
  const record = body as Record<string, unknown>;
  const period = record.period;
  if (period !== "monthly" && period !== "yearly") {
    return NextResponse.json({ code: "INVALID_BODY", error: "period 必须是 monthly / yearly" }, { status: 400 });
  }
  const method = record.method ?? "native";
  if (method !== "native" && method !== "alipay") {
    return NextResponse.json({ code: "INVALID_BODY", error: "method 必须是 native / alipay" }, { status: 400 });
  }

  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0]?.trim() : null) || req.headers.get("x-real-ip") || "unknown";
  const key = accountKey(user, ip);
  getAccount(key);

  // 订单号：A + 时间戳 + 随机 4 位（XorPay order_id 唯一即可）
  const orderNumber = `A${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
  const price = period === "yearly" ? String(PLANS.pro.priceYearly) : String(PLANS.pro.priceMonthly);

  let created;
  try {
    created = await createXorPayPayment(cfg, {
      name: `Arena Pro ${period === "yearly" ? "年付" : "月付"} ¥${price}`,
      payType: method,
      price,
      orderNumber,
      customerReference: user.id,
    });
  } catch (e) {
    return NextResponse.json(
      { code: "GATEWAY_ERROR", error: e instanceof Error ? e.message : "支付网关暂不可用" },
      { status: 502 }
    );
  }

  const expiresAt = new Date(Date.now() + created.expiresIn * 1000);
  try {
    // 落 pending 表：webhook 回调凭 orderNumber 查此记录（key/period/amount），失败则返回 503 不展示不可支付订单
    createPendingOrder(orderNumber, {
      key,
      period,
      amount: Number(price),
      method,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof BillingStoreError) {
      return NextResponse.json({ code: "STORE_ERROR", error: "支付下单暂不可用，请稍后再试" }, { status: 503 });
    }
    throw e;
  }

  return NextResponse.json({
    provider: "xorpay",
    plan: PLANS.pro.name,
    expiresInDays: period === "yearly" ? 365 : 30,
    period,
    method,
    paymentUrl: created.qr, // 二维码内容（微信扫码 / 支付宝 H5 链接）
    orderNumber,
    expiresAt: expiresAt.toISOString(),
  });
}
