import { NextRequest, NextResponse } from "next/server";
import { PLAN } from "@/lib/billing";
import {
  setPlan,
  getAccount,
  markOrderProcessed,
  findPendingOrder,
  removePendingOrder,
  isOrderProcessed,
  BillingStoreError,
} from "@/lib/billing-store";
import { xorpayConfig, verifyXorPayCallback } from "@/lib/xorpay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// XorPay 支付回调（POST form-urlencoded，官方商户接口带签名，无需反查）：
// 验签 → 查 pending 订单（order_id 关联用户/周期/金额）→ 金额校验 → 幂等落账 → 移除 pending。
// 响应 "success" 200（XorPay 回调约定），验签失败 400，落账失败 503 触发网关重试不丢单。
export async function POST(req: NextRequest) {
  const cfg = xorpayConfig();
  if (!cfg) {
    return new NextResponse("provider unavailable", { status: 503 });
  }

  const rawBody = await req.text();
  if (rawBody.length === 0 || rawBody.length > 16_384) {
    return new NextResponse("invalid payload", { status: 400 });
  }

  // 1. 验签并解析（签名无效/缺参直接拒绝，不落账）
  let payment;
  try {
    payment = verifyXorPayCallback(rawBody, cfg.appSecret);
  } catch (e) {
    console.error("[billing] xorpay 回调验签失败：", e instanceof Error ? e.message : e);
    return new NextResponse("invalid signature or payload", { status: 400 });
  }

  // 2. 查 pending 订单：order_id 是我方下单时生成的，关联登录用户/周期/金额
  const pending = findPendingOrder(payment.orderNumber);
  if (!pending) {
    // 订单不存在/已过期：若已落账（网关重试的重复回调）返回 200 确认幂等，否则可能是伪造，拒绝
    if (isOrderProcessed(payment.orderNumber)) {
      return new NextResponse("success", { status: 200 });
    }
    return new NextResponse("order not found", { status: 400 });
  }

  // 3. 金额校验：回调实付必须等于下单金额（防篡改/串单）
  if (Math.abs(payment.amount - pending.amount) > 0.001) {
    return new NextResponse("amount mismatch", { status: 400 });
  }

  try {
    // 4. 幂等：同订单号重复回调（网关重试）不重复落账
    if (!markOrderProcessed(payment.orderNumber, pending.key, pending.period)) {
      return new NextResponse("success", { status: 200 });
    }
    // 5. 续费叠加：Pro 未到期时从到期日顺延，到期后从当前时间起算
    const acc = getAccount(pending.key);
    const base =
      acc.plan === "pro" && acc.expiresAt && new Date(acc.expiresAt).getTime() > Date.now()
        ? new Date(acc.expiresAt).getTime()
        : Date.now();
    const days = pending.period === "yearly" ? 365 : 30;
    setPlan(pending.key, PLAN.PRO, "xorpay", new Date(base + days * 86_400_000).toISOString());
    // 6. 落账成功后移除 pending（残留不影响幂等）
    removePendingOrder(payment.orderNumber);
  } catch (e) {
    if (e instanceof BillingStoreError) {
      // 落账失败返回非 200：网关重试，不丢单
      return new NextResponse("store error", { status: 503 });
    }
    throw e;
  }

  return new NextResponse("success", { status: 200 });
}

export function GET() {
  return NextResponse.json({ ok: true, provider: "xorpay" });
}
