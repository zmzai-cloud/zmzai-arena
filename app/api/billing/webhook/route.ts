import { NextRequest, NextResponse } from "next/server";
import { PLAN, PLANS } from "@/lib/billing";
import {
  setPlan,
  getAccount,
  markOrderProcessed,
  findUserIdByEmail,
  recordUnmatchedOrder,
  BillingStoreError,
} from "@/lib/billing-store";
import {
  afdianConfig,
  decryptAfdianEvent,
  parseWebhookPayload,
  queryAfdianOrder,
  matchPeriod,
  resolveMatcher,
  type AfdianOrder,
} from "@/lib/afdian";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 爱发电支付回调（POST JSON，body.event 为 AES 加密，兼容测试按钮的明文格式）：
// 解密/解析 → query-order 反查确认（防伪造关键）→ 校验状态/金额/周期 → 留言对账 → 幂等落账。
// 响应必须为 JSON {"ec":200,"em":""}（爱发电仅校验 ec===200，非 200 视为失败）。
export async function POST(req: NextRequest) {
  const cfg = afdianConfig();
  if (!cfg) {
    return NextResponse.json({ ec: 500, em: "payment not configured" }, { status: 503 });
  }

  // 1. 解析 body：event 加密（官方）或明文 data.order（后台测试按钮）
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ ec: 400, em: "invalid json" }, { status: 400 });
  }
  let order: AfdianOrder | null = null;
  if (typeof rawBody === "object" && rawBody !== null && "event" in rawBody) {
    const event = (rawBody as { event?: unknown }).event;
    if (typeof event !== "string" || !event) {
      return NextResponse.json({ ec: 400, em: "invalid event" }, { status: 400 });
    }
    const plain = decryptAfdianEvent(event, cfg.token);
    if (!plain) {
      // 密文损坏 / token 不匹配：可能是伪造或配置错误，拒绝
      return NextResponse.json({ ec: 400, em: "decrypt failed" }, { status: 400 });
    }
    try {
      order = parseWebhookPayload(JSON.parse(plain));
    } catch {
      return NextResponse.json({ ec: 400, em: "bad payload" }, { status: 400 });
    }
  } else {
    order = parseWebhookPayload(rawBody);
  }
  if (!order) {
    return NextResponse.json({ ec: 400, em: "no order" }, { status: 400 });
  }

  // 2. query-order 反查：确认订单真实存在（webhook 无独立签名，必须反查防伪造）
  let remote: AfdianOrder | null;
  try {
    remote = await queryAfdianOrder(cfg, order.outTradeNo);
  } catch {
    // 反查服务不可达：暂不落账，返回 500 期望平台重试
    return NextResponse.json({ ec: 500, em: "query-order unavailable" }, { status: 500 });
  }
  if (!remote) {
    return NextResponse.json({ ec: 500, em: "order not found" }, { status: 500 });
  }
  order = remote;

  // 3. 非成功订单（退款/取消）不落账：爱发电仅推送 status=2，防御性过滤
  if (order.status !== 2) {
    return NextResponse.json({ ec: 200, em: "ok" });
  }

  // 4. 周期判定 + 金额校验：plan_id 匹配配置方案，或金额等于定价（双保险）
  const period = matchPeriod(order, cfg);
  if (!period) {
    return NextResponse.json({ ec: 400, em: "unknown plan" }, { status: 400 });
  }
  const expect = period === "yearly" ? PLANS.pro.priceYearly : PLANS.pro.priceMonthly;
  if (Math.abs(Number(order.totalAmount) - expect) > 0.001) {
    return NextResponse.json({ ec: 400, em: "amount mismatch" }, { status: 400 });
  }

  // 5. 对账：留言优先 zmz:<userId>，其次邮箱（需登录过 arena 才会在索引中）
  const matcher = resolveMatcher(order.userPrivate || order.remark);
  let userId: string | null = null;
  if (matcher) {
    if ("userId" in matcher) userId = matcher.userId;
    else userId = findUserIdByEmail(matcher.email);
  }
  if (!userId) {
    // 无法自动对账：记录待人工清单（管理员在爱发电后台核对留言后发放），不阻塞平台
    recordUnmatchedOrder(order.outTradeNo, order.totalAmount, order.userPrivate || order.remark);
    return NextResponse.json({ ec: 200, em: "unmatched, manual review" });
  }

  try {
    // 6. 幂等：按爱发电订单号去重（平台重试/多事件推送不重复落账）
    if (!markOrderProcessed(order.outTradeNo, `user:${userId}`, period)) {
      return NextResponse.json({ ec: 200, em: "ok" });
    }
    // 7. 续费叠加：Pro 未到期时从到期日顺延，到期后从当前时间起算
    const key = `user:${userId}`;
    const acc = getAccount(key);
    const base =
      acc.plan === "pro" && acc.expiresAt && new Date(acc.expiresAt).getTime() > Date.now()
        ? new Date(acc.expiresAt).getTime()
        : Date.now();
    const days = period === "yearly" ? 365 : 30;
    setPlan(key, PLAN.PRO, "afdian", new Date(base + days * 86_400_000).toISOString());
  } catch (e) {
    if (e instanceof BillingStoreError) {
      // 落账失败返回非 200：平台侧可重试，不丢单
      return NextResponse.json({ ec: 500, em: "store error" }, { status: 503 });
    }
    throw e;
  }

  return NextResponse.json({ ec: 200, em: "ok" });
}

export function GET() {
  return NextResponse.json({ ok: true, provider: "afdian" });
}
