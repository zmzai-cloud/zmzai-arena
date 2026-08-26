import { NextRequest, NextResponse } from "next/server";
import { createPublicKey, verify } from "node:crypto";
import { PLAN } from "@/lib/billing";
import { setPlan, BillingStoreError } from "@/lib/billing-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Paddle 支付 webhook：transaction.completed → 开通 Pro；subscription.canceled → 降级 free。
// 签名验证：Paddle 用 RSA 私钥签名 "ts:body"，公钥放服务器 env PADDLE_WEBHOOK_PUBLIC_KEY。
function verifyPaddleSignature(ts: string, body: string, signature: string): boolean {
  const pub = process.env.PADDLE_WEBHOOK_PUBLIC_KEY;
  if (!pub) return false;
  try {
    const key = createPublicKey({ key: pub.replaceAll("\\n", "\n"), format: "pem", type: "spki" });
    return verify("RSA-SHA256", Buffer.from(`${ts}:${body}`), key, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

function readAccountKey(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const custom = o.custom_data as Record<string, unknown> | undefined;
  const key = custom?.account_key;
  return typeof key === "string" && key.startsWith("user:") ? key : null;
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sigHeader = req.headers.get("paddle-signature") ?? "";
  // 格式: ts=1700000000;h1=<base64>
  const tsMatch = /ts=(\d+)/.exec(sigHeader);
  const h1Match = /h1=([A-Za-z0-9+/=]+)/.exec(sigHeader);
  if (!tsMatch || !h1Match) {
    return NextResponse.json({ code: "BAD_SIGNATURE" }, { status: 401 });
  }
  if (!verifyPaddleSignature(tsMatch[1], raw, h1Match[1])) {
    return NextResponse.json({ code: "BAD_SIGNATURE" }, { status: 401 });
  }

  let event: { event_type?: string; data?: unknown };
  try {
    event = JSON.parse(raw) as { event_type?: string; data?: unknown };
  } catch {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const type = event.event_type ?? "";
  try {
    if (type === "transaction.completed") {
      const key = readAccountKey(event.data);
      if (key) {
        const days = Number(process.env.PADDLE_PRO_DURATION_DAYS ?? "30") || 30;
        const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
        setPlan(key, PLAN.PRO, "paddle", expiresAt);
      }
    } else if (type === "subscription.canceled" || type === "subscription.expired") {
      const key = readAccountKey(event.data);
      if (key) setPlan(key, PLAN.FREE, "paddle");
    }
  } catch (e) {
    if (e instanceof BillingStoreError) {
      // 落账失败返回 503：Paddle 会按重试策略重新推送，不丢单
      return NextResponse.json({ code: "BILLING_UNAVAILABLE" }, { status: 503 });
    }
    throw e;
  }

  return NextResponse.json({ received: true });
}
