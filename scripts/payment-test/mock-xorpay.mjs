// mock XorPay 网关(3010):实现官方签名校验的 /api/pay/{aid} + 订单管理,用于本地全链路测试
// 签名公式(与 src/lib/xorpay.ts / muzhi 一致):
//   建单: md5(name + pay_type + price + order_id + notify_url + app_secret)
//   回调: md5(aoid + order_id + pay_price + pay_time + app_secret)
import http from "node:http";
import { createHash } from "node:crypto";

const PORT = 3010;
const AID = "test-aid";
const SECRET = "test-secret";

// order_id -> { aoid, price, payType, name }
const orders = new Map();
let expiresInOverride = 1800;

function requestSign(p) {
  return createHash("md5")
    .update(`${p.name}${p.pay_type}${p.price}${p.order_id}${p.notify_url}${SECRET}`, "utf8")
    .digest("hex")
    .toLowerCase();
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const m = url.pathname.match(/^\/api\/pay\/([^/]+)$/);
  if (req.method === "POST" && m) {
    const raw = await readBody(req);
    const p = Object.fromEntries(new URLSearchParams(raw));
    // 校验商户号与签名(与官方逻辑一致)
    if (m[1] !== AID || p.sign !== requestSign(p)) {
      return json(res, 200, { status: "error", info: "sign mismatch" });
    }
    const aoid = `AO_${p.order_id}`;
    orders.set(p.order_id, { aoid, price: p.price, payType: p.pay_type, name: p.name });
    const expiresIn = expiresInOverride;
    return json(res, 200, {
      status: "ok",
      aoid,
      expires_in: expiresIn,
      info: { qr: `https://mock-xorpay.local/pay/${p.order_id}` },
    });
  }
  if (req.method === "POST" && url.pathname === "/mock/config") {
    const raw = await readBody(req);
    const cfg = JSON.parse(raw);
    if (typeof cfg.expiresIn === "number") expiresInOverride = cfg.expiresIn;
    return json(res, 200, { ok: true, expiresIn: expiresInOverride });
  }
  if (req.method === "POST" && url.pathname === "/mock/orders/delete") {
    const raw = await readBody(req);
    const { order_id } = JSON.parse(raw);
    orders.delete(order_id);
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/mock/orders") {
    return json(res, 200, { total: orders.size, orders: [...orders.entries()].map(([k, v]) => ({ order_id: k, ...v })) });
  }
  if (req.method === "GET" && url.pathname === "/mock/status") {
    return json(res, 200, { total: orders.size, keys: [...orders.keys()] });
  }
  json(res, 404, { status: "not found" });
});

server.listen(PORT, () => console.log(`mock xorpay gw on :${PORT}`));
