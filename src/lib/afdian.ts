// 爱发电（afdian.com）支付网关：开发者只被动收单（无「创建订单」API），买家在站内购买方案。
// 对账链路：买家在爱发电购买时留言邮箱（或 zmz:<userId>）→ webhook 推送 → query-order 反查确认 → 落账。
// 未配置凭据时返回 null（upgrade 503 降级为内测发放）。
import { createDecipheriv, createHash } from "node:crypto";

export const AFDIAN_API_ORIGIN = process.env.AFDIAN_API_URL?.trim() || "https://afdian.com/api/open";

export interface AfdianConfig {
  userId: string;
  token: string;
  planMonthly: string | null; // 月度方案 ID（不配置时按金额判定周期）
  planYearly: string | null; // 年度方案 ID
}

export function afdianConfig(): AfdianConfig | null {
  const userId = process.env.AFDIAN_USER_ID?.trim();
  const token = process.env.AFDIAN_TOKEN?.trim();
  if (!userId || !token) return null;
  return {
    userId,
    token,
    planMonthly: process.env.AFDIAN_PLAN_MONTHLY?.trim() || null,
    planYearly: process.env.AFDIAN_PLAN_YEARLY?.trim() || null,
  };
}

/** 主动查询订单签名：md5(token + "params" + params + "ts" + ts + "user_id" + userId)，无连接符。 */
export function afdianSign(token: string, userId: string, params: Record<string, unknown>, ts: number): string {
  const paramsStr = JSON.stringify(params);
  return createHash("md5").update(`${token}params${paramsStr}ts${ts}user_id${userId}`).digest("hex");
}

export interface AfdianOrder {
  outTradeNo: string;
  planId: string;
  title: string;
  totalAmount: string; // 真实付款金额（元，字符串）
  status: number; // 2 = 交易成功
  remark: string; // 订单留言（公开）
  userPrivate: string; // 私密留言（仅卖家可见）
  customOrderId: string;
  month: number;
  productType: number; // 0 常规方案 1 售卖方案
  userId: string; // 买家爱发电 user_id
  createTime: string;
}

function parseOrder(raw: Record<string, unknown> | undefined | null): AfdianOrder | null {
  if (!raw || typeof raw !== "object") return null;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) || 0 : 0);
  const outTradeNo = s(raw.out_trade_no);
  if (!outTradeNo) return null;
  return {
    outTradeNo,
    planId: s(raw.plan_id),
    title: s(raw.title),
    totalAmount: s(raw.total_amount),
    status: n(raw.status),
    remark: s(raw.remark),
    userPrivate: s(raw.user_private),
    customOrderId: s(raw.custom_order_id),
    month: n(raw.month),
    productType: n(raw.product_type),
    userId: s(raw.user_id),
    createTime: s(raw.create_time),
  };
}

/**
 * 主动查询订单（POST /query-order）：
 * - 用于 webhook 落账前反查，确认订单真实存在且状态/金额未被篡改（webhook 无签名时防伪造的关键）。
 * - 查不到返回 null；网络/服务错误抛错（调用方按「暂不可落账」处理，返回 500 让平台重试）。
 */
export async function queryAfdianOrder(cfg: AfdianConfig, outTradeNo: string): Promise<AfdianOrder | null> {
  const params = { out_trade_no: outTradeNo };
  const ts = Math.floor(Date.now() / 1000);
  const payload = {
    user_id: cfg.userId,
    params: JSON.stringify(params),
    ts: String(ts),
    sign: afdianSign(cfg.token, cfg.userId, params, ts),
  };
  const res = await fetch(`${AFDIAN_API_ORIGIN}/query-order`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(payload).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`afdian query-order http ${res.status}`);
  const data = (await res.json()) as { ec?: number; data?: { list?: unknown[] } };
  if (data.ec !== 200) throw new Error(`afdian query-order ec ${data.ec}`);
  const list = data.data?.list;
  if (!Array.isArray(list) || list.length === 0) return null;
  return parseOrder(list[0] as Record<string, unknown>);
}

/**
 * webhook event 解密：AES-128-CBC，key = iv = md5(token) hex 前 16 位，密文 base64。
 * 解密失败（密文损坏 / token 不符）返回 null。
 */
export function decryptAfdianEvent(event: string, token: string): string | null {
  try {
    const key = createHash("md5").update(token).digest("hex").slice(0, 16);
    const decipher = createDecipheriv("aes-128-cbc", key, key);
    const decrypted = Buffer.concat([decipher.update(Buffer.from(event, "base64")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/** 从解密后的 webhook JSON 提取订单（兼容 {type, data:{order}} 与直接 {data:{order}}）。 */
export function parseWebhookPayload(payload: unknown): AfdianOrder | null {
  const obj = payload as { data?: { order?: Record<string, unknown> } } | null;
  if (!obj || typeof obj !== "object" || !obj.data || typeof obj.data !== "object") return null;
  return parseOrder(obj.data.order);
}

/** 判定订单对应周期：优先方案 ID 匹配配置；未配置方案时按金额匹配定价。返回 "monthly" | "yearly" | null。 */
export function matchPeriod(order: AfdianOrder, cfg: AfdianConfig): "monthly" | "yearly" | null {
  if (cfg.planMonthly && order.planId === cfg.planMonthly) return "monthly";
  if (cfg.planYearly && order.planId === cfg.planYearly) return "yearly";
  const fee = Number(order.totalAmount);
  if (fee === 29) return "monthly";
  if (fee === 198) return "yearly";
  return null;
}

/** 从留言中解析对账标识：优先 zmz:<userId>（零歧义），否则视为邮箱。 */
export function resolveMatcher(remark: string): { userId: string } | { email: string } | null {
  const text = [remark].filter(Boolean).join("\n");
  const zmz = /zmz:([A-Za-z0-9_-]{6,64})/.exec(text);
  if (zmz?.[1]) return { userId: zmz[1] };
  const email = text.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { email };
  return null;
}
