// 拉取 A 股真实日 K（前复权），生成 src/data/market-real.ts（纯数据模块）。
//
// 数据源优先级（任一成功即写入并退出）：
//   1. 腾讯证券 fqkline（qfq 前复权，含当日盘口）——本机直连；被 WAF 拦截时
//      若设置 MARKET_FETCH_SSH_HOST / USER，则经服务器出口中转（已验证可达）。
//   2. 新浪 CN_MarketDataService（不复权）。
// 全部失败：保留现有 src/data/market-real.ts 快照，退出码 0（构建不阻断）。
//
// 盘中处理：若最后一根 bar 的日期 == 北京今天且尚未收盘（<15:30），丢弃该根，
// 避免把未收盘的盘中价当作完整日 K 灌入引擎。

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

// `~` 在 execFileSync（不走 shell）中不会展开，这里手动解析为绝对路径
function expandKey(p) {
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return p;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "data", "market-real.ts");

// 与 src/sim/market.ts 的 INSTRUMENTS（market === "A股"）保持同步；脚本会交叉校验。
const A_CODES = [
  // 白酒/消费
  "600519", "000858", "000568", "600809", "002304", "600887", "603288",
  "000651", "000333", "600690", "002714",
  // 医药
  "600276", "300760", "603259", "300015",
  // 金融
  "600036", "601318", "600030", "601166", "601398", "000001", "300059",
  // 科技
  "002230", "002415", "000063", "002475", "603986", "688981", "002371", "300124",
  // 新能源/制造
  "300750", "601012", "600438", "002460", "002594", "000625", "600104",
  "600031", "000725", "601766",
  // 资源/能源/公用
  "600900", "601899", "601088", "601857", "600019", "600585", "600941",
  // ETF
  "510300", "510500", "515080", "510050", "159915", "588000",
];
const MIN_BARS = 200; // 少于 200 根视为拉取失败
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// 上交所：6 股票 / 5 ETF / 9 B股；深交所：0/3 开头
const codePrefix = (code) => (/^[659]/.test(code) ? "sh" : "sz");

function beijingToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}
function beijingNow() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date());
}
// 腾讯返回的数组正序：[date, open, close, high, low, volume]
async function fetchTencent(code) {
  const symbol = codePrefix(code) + code;
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,400,qfq`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://gu.qq.com/" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const rows = j?.data?.[symbol]?.qfqday;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("empty qfqday");
  return rows;
}
// 新浪返回正序：[{day, open, high, low, close, volume}]（不复权）
async function fetchSina(code) {
  const symbol = codePrefix(code) + code;
  const url = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=400`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("empty kline");
  return rows.map((r) => [r.day, r.open, r.close, r.high, r.low, r.volume]);
}
// 经服务器网关中转（CI：GitHub runner 出口 IP 可能被腾讯 WAF 拦截，HK 服务器已验证可达）
function fetchTencentViaSsh(code) {
  const { MARKET_FETCH_SSH_HOST: host, MARKET_FETCH_SSH_USER: user } = process.env;
  if (!host || !user) throw new Error("no ssh gateway configured");
  const symbol = codePrefix(code) + code;
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,400,qfq`;
  const script = `curl -s --max-time 15 -A '${UA}' -H 'Referer: https://gu.qq.com/' '${url}'`;
  const out = execFileSync("ssh", [
    "-i", expandKey(process.env.MARKET_FETCH_SSH_KEY || "~/.ssh/id_ed25519"),
    "-o", "StrictHostKeyChecking=accept-new",
    `${user}@${host}`, script,
  ], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 60_000 });
  const j = JSON.parse(out);
  const rows = j?.data?.[symbol]?.qfqday;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("empty qfqday via ssh");
  return rows;
}

function dropIntraday(rows) {
  const today = beijingToday();
  const now = beijingNow();
  const last = rows[rows.length - 1];
  if (last && String(last[0]) === today && now < "15:30") {
    return rows.slice(0, -1); // 未收盘的盘中 bar 不算完整日 K
  }
  return rows;
}

function verify(src, rows) {
  if (!rows || rows.length < MIN_BARS) {
    throw new Error(`${src}: only ${rows?.length ?? 0} bars (< ${MIN_BARS})`);
  }
}

function crossCheckWithMarketTs(series) {
  try {
    const marketTs = readFileSync(join(ROOT, "src", "sim", "market.ts"), "utf8");
    const declared = [...marketTs.matchAll(/code: "(\d{6})"/g)].map((m) => m[1]);
    const pulled = [...series.keys()];
    const missing = declared.filter((c) => !pulled.includes(c));
    if (missing.length > 0) console.warn(`[fetch-market] 警告：标的池中未拉到: ${missing.join(", ")}`);
    const extra = pulled.filter((c) => !declared.includes(c));
    if (extra.length > 0) console.warn(`[fetch-market] 警告：拉取了标的池外的标的: ${extra.join(", ")}`);
  } catch {
    // market.ts 不可读时跳过校验
  }
}

function emitTs(series, meta) {
  const codes = [...series.keys()].sort();
  const lines = [];
  lines.push("// AUTO-GENERATED by scripts/fetch-market.mjs — 请勿手改。");
  lines.push(`// 来源：${meta.source} | fetchedAt: ${meta.fetchedAt} | 交易日历 ${meta.calendar.length} 天`);
  lines.push(`// 覆盖标的：${codes.join(", ")}`);
  lines.push("export const REAL_MARKET_META = {");
  lines.push(`  source: "${meta.source}",`);
  lines.push(`  fetchedAt: "${meta.fetchedAt}",`);
  lines.push(`  firstTradeDate: "${meta.firstTradeDate}",`);
  lines.push(`  lastTradeDate: "${meta.lastTradeDate}",`);
  lines.push(`  days: ${meta.days},`);
  lines.push("};");
  lines.push("");
  lines.push("// 全局交易日历：所有实盘标的存在日期并集（升序）");
  lines.push("export const REAL_TRADE_CALENDAR = [");
  for (const d of meta.calendar) lines.push(`  "${d}",`);
  lines.push("];");
  lines.push("");
  lines.push("// code -> [[date, open, close, high, low, volume], ...]（正序，前复权）");
  lines.push("export const REAL_MARKET: Record<string, Array<[string, number, number, number, number, number]>> = {");
  for (const code of codes) {
    lines.push(`  "${code}": [`);
    for (const r of series.get(code)) {
      lines.push(`    ["${r[0]}", ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}${r[5] != null ? `, ${r[5]}` : ""}],`);
    }
    lines.push("  ],");
  }
  lines.push("};");
  lines.push("");
  writeFileSync(OUT, lines.join("\n"));
}

async function main() {
  const series = new Map(); // code -> rows
  let source = null;
  for (const code of A_CODES) {
    let rows = null;
    const attempts = [
      ["tencent-direct", () => fetchTencent(code)],
      ["tencent-ssh", () => fetchTencentViaSsh(code)],
      ["sina", () => fetchSina(code)],
    ];
    for (const [name, fn] of attempts) {
      try {
        rows = dropIntraday(await fn());
        verify(code, rows);
        if (!source) source = name; // 记录首个可用源
        break;
      } catch (e) {
        console.warn(`[fetch-market] ${code} ${name} 失败: ${e.message}`);
      }
    }
    if (!rows) throw new Error(`${code} 全部数据源失败`);
    series.set(code, rows);
  }

  crossCheckWithMarketTs(series);

  // 交易日历（全标的并集，升序）
  const daySet = new Set();
  for (const rows of series.values()) for (const r of rows) daySet.add(r[0]);
  const calendar = [...daySet].sort();
  const firstTradeDate = calendar[0];
  const lastTradeDate = calendar[calendar.length - 1];

  emitTs(series, {
    source: source === "tencent-direct" ? "tencent-qfq"
      : source === "tencent-ssh" ? "tencent-qfq(via HK gateway)"
      : "sina",
    fetchedAt: new Date().toISOString(),
    firstTradeDate,
    lastTradeDate,
    days: calendar.length,
    calendar,
  });

  const total = [...series.values()].reduce((n, r) => n + r.length, 0);
  console.log(`[fetch-market] OK source=${source} codes=${series.size} bars=${total} range=${firstTradeDate} → ${lastTradeDate}`);
  console.log(`[fetch-market] wrote ${OUT}`);
}

main().catch((e) => {
  console.warn(`[fetch-market] 拉取失败，保留现有快照: ${e.message}`);
  process.exit(0); // 构建不阻断
});
