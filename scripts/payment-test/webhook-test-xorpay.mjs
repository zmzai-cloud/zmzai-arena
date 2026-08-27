// XorPay webhook 全链路测试:建单 / 验签 / pending 关联 / 金额校验 / 幂等 / 过期 / 续费叠加
// 前置:mock-auth(3001) + mock-xorpay(3010) + dev(3000,带 XORPAY_* 环境变量)
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const GW = "http://localhost:3010";
const SECRET = "test-secret";
const COOKIE = { "Content-Type": "application/json", Cookie: "s=mock" };

// 与 mock 网关一致的回调签名: md5(aoid + order_id + pay_price + pay_time + secret)
function callbackFor(orderId, overrides = {}) {
  const aoid = overrides.aoid ?? `AO_${orderId}`;
  const payPrice = overrides.pay_price ?? "29.00";
  const payTime = overrides.pay_time ?? "2026-08-27 12:00:00";
  const sign = createHash("md5")
    .update(`${aoid}${orderId}${payPrice}${payTime}${SECRET}`, "utf8")
    .digest("hex")
    .toLowerCase();
  return new URLSearchParams({ aoid, order_id: orderId, pay_price: payPrice, pay_time: payTime, sign }).toString();
}

async function upgrade(period, method = "native") {
  const r = await fetch(`${BASE}/api/billing/upgrade`, {
    method: "POST",
    headers: COOKIE,
    body: JSON.stringify({ period, method }),
  });
  return { status: r.status, data: await r.json() };
}

const pushCallback = (form) =>
  fetch(`${BASE}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });

function readAccount() {
  try {
    return JSON.parse(readFileSync(".data/accounts.json", "utf8"))["user:u_test"];
  } catch {
    return null;
  }
}

function readPending() {
  try {
    return JSON.parse(readFileSync(".data/pending.json", "utf8"));
  } catch {
    return {};
  }
}

const out = [];
const ok = (name, cond, detail = "") => out.push(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// 1. 月付建单(native):返回二维码内容 + 订单落 pending 表
{
  const { status, data } = await upgrade("monthly", "native");
  ok(
    "upgrade-monthly-native",
    status === 200 &&
      data.provider === "xorpay" &&
      data.paymentUrl?.startsWith("https://mock-xorpay.local/pay/") &&
      data.orderNumber &&
      data.expiresInDays === 30 &&
      !!readPending()[data.orderNumber],
    `code=${status} url=${data.paymentUrl} order=${data.orderNumber}`
  );
}
// 2. 年付建单(alipay)
{
  const { status, data } = await upgrade("yearly", "alipay");
  ok(
    "upgrade-yearly-alipay",
    status === 200 && data.method === "alipay" && data.expiresInDays === 365 && data.paymentUrl,
    `code=${status} method=${data.method} days=${data.expiresInDays}`
  );
}
// 3. 未登录 → 401
{
  const r = await fetch(`${BASE}/api/billing/upgrade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ period: "monthly" }),
  });
  ok("upgrade-anon-401", r.status === 401, `code=${r.status}`);
}
// 4. 非法周期 → 400
{
  const { status } = await upgrade("weekly");
  ok("upgrade-bad-period-400", status === 400, `code=${status}`);
}
// 5. 非法支付方式 → 400
{
  const { status } = await upgrade("monthly", "wechat");
  ok("upgrade-bad-method-400", status === 400, `code=${status}`);
}
// 6. webhook 无 body → 400
{
  const r = await fetch(`${BASE}/api/billing/webhook`, { method: "POST" });
  ok("no-body-400", r.status === 400, `code=${r.status}`);
}
// 7. webhook 坏签名 → 400
{
  const r = await fetch(`${BASE}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ aoid: "AO_x", order_id: "X1", pay_price: "29.00", pay_time: "2026-08-27 12:00:00", sign: "deadbeef" }).toString(),
  });
  ok("bad-sign-400", r.status === 400, `code=${r.status}`);
}
// 8. 正常月付回调 → 落账(plan=pro, source=xorpay, expiresAt≈+30 天)
{
  const { data } = await upgrade("monthly", "native");
  const r = await pushCallback(callbackFor(data.orderNumber));
  const acc = readAccount();
  const okExp =
    acc && acc.plan === "pro" && acc.planSource === "xorpay" && acc.expiresAt &&
    Math.abs(new Date(acc.expiresAt).getTime() - (Date.now() + 30 * 86400000)) < 5 * 60000;
  ok("monthly-paid", r.status === 200 && okExp, `code=${r.status} expiresAt=${acc?.expiresAt}`);
}
// 9. 同订单重复回调 → 200 幂等(不叠加)
{
  const { data } = await upgrade("monthly", "native");
  await pushCallback(callbackFor(data.orderNumber));
  const first = readAccount()?.expiresAt;
  const r = await pushCallback(callbackFor(data.orderNumber));
  const second = readAccount()?.expiresAt;
  ok("dup-idempotent", r.status === 200 && first === second, `code=${r.status} same=${first === second}`);
}
// 10. 金额不符 → 400 不落账
{
  const { data } = await upgrade("monthly", "native");
  const r = await pushCallback(callbackFor(data.orderNumber, { pay_price: "29.50" }));
  ok("amount-mismatch-400", r.status === 400, `code=${r.status}`);
}
// 11. 订单不存在(pending 无此单)→ 400
{
  const r = await pushCallback(callbackFor("NO_SUCH_ORDER"));
  ok("order-not-found-400", r.status === 400, `code=${r.status}`);
}
// 12. 年付续费叠加 → expiresAt ≈ 上次到期日 + 365
{
  const { data } = await upgrade("yearly", "alipay");
  const before = new Date(readAccount()?.expiresAt).getTime();
  const r = await pushCallback(callbackFor(data.orderNumber, { pay_price: "198.00" }));
  const after = new Date(readAccount()?.expiresAt).getTime();
  ok(
    "yearly-stack",
    r.status === 200 && Math.abs(after - (before + 365 * 86400000)) < 60000,
    `code=${r.status} before=${before} after=${after} expect=${before + 365 * 86400000}`
  );
}
// 13. 过期订单(mock 配置 1 秒过期)→ 400 不落账
{
  await fetch(`${GW}/mock/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 1 }),
  });
  const { data } = await upgrade("monthly", "native");
  await sleep(1600);
  const r = await pushCallback(callbackFor(data.orderNumber));
  await fetch(`${GW}/mock/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 1800 }),
  });
  ok("expired-order-400", r.status === 400, `code=${r.status}`);
}

console.log(out.join("\n"));
const fails = out.filter((l) => l.includes("FAIL")).length;
console.log(`\n=== ${out.length - fails}/${out.length} passed ===`);
process.exit(fails > 0 ? 1 : 0);
