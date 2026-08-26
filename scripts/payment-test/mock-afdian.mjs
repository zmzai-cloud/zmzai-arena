// mock 爱发电网关(3010):实现官方签名校验的 /query-order + 订单注入管理 API,用于本地全链路测试
import http from "node:http";
import { createHash, createCipheriv } from "node:crypto";

const PORT = 3010;
const TOKEN = "test-token";
const USER_ID = "u_afdian_test";

// 订单表:outTradeNo -> order
const orders = new Map();

// 官方签名: md5(token + "params" + paramsJson + "ts" + ts + "user_id" + userId)
function sign(paramsJson, ts) {
  return createHash("md5").update(`${TOKEN}params${paramsJson}ts${ts}user_id${USER_ID}`).digest("hex");
}

// 官方 webhook 加密: AES-128-CBC, key=iv=md5(token) hex 前 16 位, base64
export function encryptEvent(obj) {
  const key = createHash("md5").update(TOKEN).digest("hex").slice(0, 16);
  const cipher = createCipheriv("aes-128-cbc", key, key);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  return enc.toString("base64");
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
  if (req.method === "POST" && url.pathname === "/query-order") {
    const raw = await readBody(req);
    const body = new URLSearchParams(raw);
    const params = body.get("params") ?? "";
    const ts = body.get("ts") ?? "";
    const uid = body.get("user_id") ?? "";
    const sig = body.get("sign") ?? "";
    // 校验签名与 user_id(与官方逻辑一致)
    if (uid !== USER_ID || sig !== sign(params, ts)) {
      return json(res, 200, { ec: 403, em: "sign mismatch" });
    }
    let parsed = {};
    try { parsed = JSON.parse(params); } catch { /* ignore */ }
    const outTradeNo = parsed.out_trade_no;
    const order = outTradeNo ? orders.get(outTradeNo) : null;
    return json(res, 200, { ec: 200, em: "", data: { list: order ? [order] : [] } });
  }
  if (req.method === "POST" && url.pathname === "/mock/orders") {
    const raw = await readBody(req);
    const order = JSON.parse(raw);
    orders.set(order.out_trade_no, order);
    return json(res, 200, { ok: true, total: orders.size });
  }
  if (req.method === "POST" && url.pathname === "/mock/orders/delete") {
    const raw = await readBody(req);
    const { out_trade_no } = JSON.parse(raw);
    orders.delete(out_trade_no);
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/mock/status") {
    return json(res, 200, { total: orders.size, keys: [...orders.keys()] });
  }
  json(res, 404, { ec: 404 });
});

server.listen(PORT, () => console.log(`mock afdian gw on :${PORT}`));
