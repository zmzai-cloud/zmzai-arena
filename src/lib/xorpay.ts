// XorPay(小鹅支付)网关库:个人开发者可接入的官方商户接口聚合(微信 native 扫码 / 支付宝 H5)。
// 与 muzhi 站同款方案(muzhi/providers/payment/xorpay),签名与回调格式保持一致:
// - 创建订单:POST {api}/api/pay/{aid},form 参数 + md5(name+payType+price+orderNumber+notifyUrl+secret)
// - 回调:POST form(aoid/order_id/pay_price/pay_time/sign),验签 md5(aoid+order_id+pay_price+pay_time+secret)
// 回调签名通过后订单真实成立(官方商户接口,资金由微信/支付宝清算直达个人银行卡),无需反查。
import { createHash, timingSafeEqual } from "node:crypto";

export const XORPAY_API_ORIGIN = process.env.XORPAY_API_URL?.trim() || "https://xorpay.com";
export const XORPAY_DEFAULT_NOTIFY = "https://arena.zmzai.cloud/api/billing/webhook";

export interface XorPayConfig {
  aid: string;
  appSecret: string;
  notifyUrl: string;
}

export function xorpayConfig(): XorPayConfig | null {
  const aid = process.env.XORPAY_AID?.trim();
  const appSecret = process.env.XORPAY_APP_SECRET?.trim();
  if (!aid || !appSecret) return null;
  return {
    aid,
    appSecret,
    notifyUrl: process.env.XORPAY_NOTIFY_URL?.trim() || XORPAY_DEFAULT_NOTIFY,
  };
}

export function createXorPayRequestSignature(input: {
  name: string;
  payType: string;
  price: string;
  orderNumber: string;
  notifyUrl: string;
  appSecret: string;
}): string {
  return createHash("md5")
    .update(
      `${input.name}${input.payType}${input.price}${input.orderNumber}${input.notifyUrl}${input.appSecret}`,
      "utf8"
    )
    .digest("hex")
    .toLowerCase();
}

function createXorPayCallbackSignature(input: {
  providerOrderId: string;
  orderNumber: string;
  paidPrice: string;
  paidTime: string;
  appSecret: string;
}): string {
  return createHash("md5")
    .update(
      `${input.providerOrderId}${input.orderNumber}${input.paidPrice}${input.paidTime}${input.appSecret}`,
      "utf8"
    )
    .digest("hex")
    .toLowerCase();
}

function signaturesMatch(received: string, expected: string): boolean {
  const a = Buffer.from(received.toLowerCase(), "utf8");
  const b = Buffer.from(expected.toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface XorPayCreateResult {
  providerOrderId: string; // 平台单号 aoid
  qr: string; // 二维码内容(code_url / H5 链接)
  expiresIn: number; // 秒
}

/** 创建支付订单。XorPay 返回二维码内容(微信扫码)或 H5 链接(支付宝拉起),均需前端渲染。 */
export async function createXorPayPayment(
  cfg: XorPayConfig,
  input: { name: string; payType: "native" | "alipay"; price: string; orderNumber: string; customerReference: string }
): Promise<XorPayCreateResult> {
  const sign = createXorPayRequestSignature({
    name: input.name,
    payType: input.payType,
    price: input.price,
    orderNumber: input.orderNumber,
    notifyUrl: cfg.notifyUrl,
    appSecret: cfg.appSecret,
  });
  const form = new URLSearchParams({
    name: input.name,
    pay_type: input.payType,
    price: input.price,
    order_id: input.orderNumber,
    order_uid: input.customerReference,
    notify_url: cfg.notifyUrl,
    more: JSON.stringify({ orderNumber: input.orderNumber }),
    expire: "1800",
    sign,
  });
  const res = await fetch(`${XORPAY_API_ORIGIN}/api/pay/${encodeURIComponent(cfg.aid)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`XorPay 请求失败(HTTP ${res.status})`);
  }
  const data = (await res.json().catch(() => null)) as
    | { status?: string; aoid?: string; expires_in?: number; info?: { qr?: string } }
    | null;
  if (!data || data.status !== "ok" || !data.aoid || !data.info?.qr) {
    throw new Error(`XorPay 创建支付失败(${data?.status ?? "invalid response"})`);
  }
  return {
    providerOrderId: data.aoid,
    qr: data.info.qr,
    expiresIn: data.expires_in ?? 1800,
  };
}

export interface VerifiedXorPayPayment {
  provider: "xorpay";
  orderNumber: string; // 我方订单号(order_id)
  providerOrderId: string; // 平台单号(aoid)
  amount: number; // 元
  transactionId: string | null;
  occurredAt: Date;
}

/** 验签并解析 XorPay 回调(form-urlencoded)。签名无效/缺参抛错。 */
export function verifyXorPayCallback(rawBody: string, appSecret: string): VerifiedXorPayPayment {
  const params = new URLSearchParams(rawBody);
  const providerOrderId = params.get("aoid")?.trim();
  const orderNumber = params.get("order_id")?.trim();
  const paidPrice = params.get("pay_price")?.trim();
  const paidTime = params.get("pay_time")?.trim();
  const receivedSign = params.get("sign")?.trim();
  if (!providerOrderId || !orderNumber || !paidPrice || !paidTime || !receivedSign) {
    throw new Error("XorPay 回调缺少必要参数");
  }
  const expectedSign = createXorPayCallbackSignature({
    providerOrderId,
    orderNumber,
    paidPrice,
    paidTime,
    appSecret,
  });
  if (!signaturesMatch(receivedSign, expectedSign)) {
    throw new Error("XorPay 回调签名无效");
  }
  const amount = Number(paidPrice);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("XorPay 回调金额格式无效");
  }
  let occurredAt: Date;
  try {
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(paidTime)
      ? `${paidTime.replace(" ", "T")}+08:00`
      : paidTime;
    occurredAt = new Date(normalized);
    if (Number.isNaN(occurredAt.getTime())) throw new Error("invalid date");
  } catch {
    throw new Error("XorPay 回调支付时间格式无效");
  }
  return {
    provider: "xorpay",
    orderNumber,
    providerOrderId,
    amount,
    transactionId: params.get("transaction_id")?.slice(0, 200) || null,
    occurredAt,
  };
}
