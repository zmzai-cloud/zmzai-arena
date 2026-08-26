// 爱发电 webhook 全链路测试:解密 / 反查 / 状态金额校验 / 对账(邮箱+zmz) / 幂等 / 待人工 / 续费叠加
import { createHash, createCipheriv } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const GW = "http://localhost:3010";
const TOKEN = "test-token";

function encryptEvent(obj) {
  const key = createHash("md5").update(TOKEN).digest("hex").slice(0, 16);
  const cipher = createCipheriv("aes-128-cbc", key, key);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  return enc.toString("base64");
}

async function inject(order) {
  const r = await fetch(`${GW}/mock/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });
  return r.status;
}

async function del(outTradeNo) {
  await fetch(`${GW}/mock/orders/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ out_trade_no: outTradeNo }),
  });
}

function baseOrder(outTradeNo, overrides = {}) {
  return {
    out_trade_no: outTradeNo,
    user_id: "buyer_x",
    plan_id: "plan_m",
    title: "Zmz AI Arena Pro 会员（月）",
    month: 1,
    total_amount: "29.00",
    show_amount: "29.00",
    status: 2,
    remark: "",
    user_private: "",
    custom_order_id: "",
    product_type: 0,
    discount: "0.00",
    create_time: String(Math.floor(Date.now() / 1000)),
    ...overrides,
  };
}

const pushEvent = (obj) =>
  fetch(`${BASE}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: encryptEvent(obj) }),
  });

const pushPlain = (obj) =>
  fetch(`${BASE}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  });

function readAccount() {
  try {
    return JSON.parse(readFileSync(".data/accounts.json", "utf8"))["user:u_test"];
  } catch {
    return null;
  }
}

function readUnmatched() {
  try {
    return JSON.parse(readFileSync(".data/unmatched.json", "utf8"));
  } catch {
    return {};
  }
}

const out = [];
const ok = (name, cond, detail = "") => out.push(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);

// 前置:upgrade 建 email 索引(t@z.dev -> u_test)
{
  const r = await fetch(`${BASE}/api/billing/upgrade`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: "s=mock" },
    body: JSON.stringify({ period: "monthly" }),
  });
  const d = await r.json();
  ok("upgrade-monthly", r.status === 200 && d.provider === "afdian" && d.url && d.email === "t@z.dev" && d.expiresInDays === 30, `code=${r.status} url=${d.url} email=${d.email}`);
}
{
  const r = await fetch(`${BASE}/api/billing/upgrade`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: "s=mock" },
    body: JSON.stringify({ period: "yearly" }),
  });
  const d = await r.json();
  ok("upgrade-yearly", r.status === 200 && d.expiresInDays === 365, `code=${r.status} days=${d.expiresInDays}`);
}
{
  const r = await fetch(`${BASE}/api/billing/upgrade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ period: "monthly" }),
  });
  ok("upgrade-anon-401", r.status === 401, `code=${r.status}`);
}
{
  const r = await fetch(`${BASE}/api/billing/upgrade`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: "s=mock" },
    body: JSON.stringify({ period: "weekly" }),
  });
  ok("upgrade-bad-period-400", r.status === 400, `code=${r.status}`);
}

// 1. 无 body
{
  const r = await fetch(`${BASE}/api/billing/webhook`, { method: "POST" });
  ok("no-body", r.status === 400, `code=${r.status}`);
}
// 2. 坏 event(伪造密文)
{
  const r = await fetch(`${BASE}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" }),
  });
  ok("bad-event", r.status === 400, `code=${r.status}`);
}
// 3. zmz:userId 对账 + 落账(月付)
{
  const oid = "A1000";
  await inject(baseOrder(oid, { user_private: "zmz:u_test" }));
  const r = await pushEvent({ type: "order", data: { order: { out_trade_no: oid } } });
  const d = await r.json();
  const acc = readAccount();
  const okExp = acc && acc.plan === "pro" && acc.planSource === "afdian" && acc.expiresAt && Math.abs(new Date(acc.expiresAt).getTime() - (Date.now() + 30 * 86400000)) < 5 * 60000;
  ok("zmz-match", r.status === 200 && d.ec === 200 && okExp, `code=${r.status} ec=${d.ec} expiresAt=${acc?.expiresAt}`);
}
// 4. 同订单重复(幂等,不叠加)
{
  const first = readAccount()?.expiresAt;
  const r = await pushEvent({ type: "order", data: { order: { out_trade_no: "A1000" } } });
  const d = await r.json();
  const second = readAccount()?.expiresAt;
  ok("dup-idempotent", r.status === 200 && d.ec === 200 && first === second, `code=${r.status} same=${first === second}`);
}
// 5. 反查不到订单 → 500 不落账
{
  const oid = "A1001";
  await inject(baseOrder(oid, { user_private: "zmz:u_test" }));
  await del(oid);
  const r = await pushEvent({ type: "order", data: { order: { out_trade_no: oid } } });
  ok("order-not-found", r.status === 500, `code=${r.status}`);
}
// 6. 金额不符(反查返回 1 元)→ 400
{
  const oid = "A1002";
  await inject(baseOrder(oid, { total_amount: "1.00", user_private: "zmz:u_test" }));
  const r = await pushEvent({ type: "order", data: { order: { out_trade_no: oid } } });
  ok("bad-fee", r.status === 400, `code=${r.status}`);
}
// 7. 邮箱对账 + 年付叠加(expiresAt = 上次到期日 + 365)
{
  const oid = "A1003";
  await inject(baseOrder(oid, { plan_id: "plan_y", total_amount: "198.00", user_private: "t@z.dev" }));
  const before = new Date(readAccount()?.expiresAt).getTime();
  const r = await pushEvent({ type: "order", data: { order: { out_trade_no: oid } } });
  const d = await r.json();
  const after = new Date(readAccount()?.expiresAt).getTime();
  const expect = before + 365 * 86400000;
  ok("email-match-stack", r.status === 200 && d.ec === 200 && Math.abs(after - expect) < 60000, `code=${r.status} before=${before} after=${after} expect=${expect}`);
}
// 8. 无法对账(留言为空)→ 200 + unmatched.json 记录
{
  const oid = "A1004";
  await inject(baseOrder(oid, { remark: "hello world" }));
  const r = await pushEvent({ type: "order", data: { order: { out_trade_no: oid } } });
  const d = await r.json();
  const um = readUnmatched();
  ok("unmatched-recorded", r.status === 200 && d.ec === 200 && !!um[oid], `code=${r.status} ec=${d.ec} recorded=${!!um[oid]}`);
}
// 9. 明文模式(后台测试按钮格式)→ 反查通过后落账(叠加 30 天)
{
  const oid = "A1005";
  await inject(baseOrder(oid, { user_private: "zmz:u_test" }));
  const before = new Date(readAccount()?.expiresAt).getTime();
  const r = await pushPlain({ ec: 200, em: "ok", data: { type: "order", order: { out_trade_no: oid } } });
  const d = await r.json();
  const after = new Date(readAccount()?.expiresAt).getTime();
  const expect = before + 30 * 86400000;
  ok("plain-mode", r.status === 200 && d.ec === 200 && Math.abs(after - expect) < 60000, `code=${r.status} after=${after} expect=${expect}`);
}
// 10. 非成功状态(status=1)→ 200 不落账
{
  const oid = "A1006";
  await inject(baseOrder(oid, { status: 1, user_private: "zmz:u_test" }));
  const before = readAccount()?.expiresAt;
  const r = await pushEvent({ type: "order", data: { order: { out_trade_no: oid } } });
  const d = await r.json();
  const after = readAccount()?.expiresAt;
  ok("bad-status-ignored", r.status === 200 && d.ec === 200 && before === after, `code=${r.status} same=${before === after}`);
}
// 11. 未知方案/金额(plan_id 未配置且金额不匹配)→ 400
{
  const oid = "A1007";
  await inject(baseOrder(oid, { plan_id: "plan_x", total_amount: "5.00", user_private: "zmz:u_test" }));
  const r = await pushEvent({ type: "order", data: { order: { out_trade_no: oid } } });
  ok("unknown-plan", r.status === 400, `code=${r.status}`);
}

console.log(out.join("\n"));
const fails = out.filter((l) => l.includes("FAIL")).length;
console.log(`\n=== ${out.length - fails}/${out.length} passed ===`);
process.exit(fails > 0 ? 1 : 0);
