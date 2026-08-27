// 拉取 A 股真实日 K（前复权），生成 src/data/market-real.ts（个股行情）与
// src/data/index-real.ts（大盘指数行情）两个纯数据模块。指数独立成模块是为了
// 沙箱回测 bundle 只需指数数据（~150KB），不必拉入 ~8MB 的个股全量行情。
//
// 标的池：新浪沪深 A 股成交额排行榜前 RANK_TOP 只（默认 300）+ 旧快照中已收录标的
// （榜单外掉队的不删，保证已上架策略的历史行情连续），总池上限 MAX_CODES（380）。
//
// 数据源优先级（任一成功即写入并退出）：
//   1. 腾讯证券 fqkline（qfq 前复权，含当日盘口）——CI 直连；本机被 WAF 拦截时
//      若设置 MARKET_FETCH_SSH_HOST / USER，则经服务器出口中转（已验证可达）。
//   2. 新浪 CN_MarketDataService（不复权）。
// 单只失败跳过（不阻断整批）；成功数不足 MIN_OK（250）时保留现有快照，退出码 0（构建不阻断）。
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
const OUT_INDEX = join(ROOT, "src", "data", "index-real.ts");

const RANK_TOP = 300; // 成交额排行榜前 N 只
const MAX_CODES = 380; // 总池上限（榜单 + 旧快照保留）
const MIN_OK = 250; // 成功拉取数低于此值则保留旧快照
const MIN_BARS = 200; // 少于 200 根视为拉取失败（次新股自动跳过）
const SLEEP_MS = 80; // 请求间节流，防 WAF 限流
// 大盘指数（新浪 getKLineData，与个股同数据源；代码带 sh/sz 前缀与个股 6 位纯数字区分）
const INDEX_SYMBOLS = [
  ["sh000001", "上证指数"],
  ["sz399001", "深证成指"],
  ["sz399006", "创业板指"],
  ["sh000300", "沪深300"],
  ["sh000905", "中证500"],
];
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
// 指数日K（新浪，返回字符串数字 → 统一 Number；指数无复权概念）
async function fetchIndexSina(sym) {
  const url = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${sym}&scale=240&ma=no&datalen=400`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("empty index kline");
  return rows.map((r) => [r.day, Number(r.open), Number(r.close), Number(r.high), Number(r.low), Number(r.volume)]);
}
// 新浪沪深 A 股成交额排行榜（amount 降序），返回 [{ code, name }]
async function fetchRankSina() {
  const rows = [];
  for (let page = 1; page <= Math.ceil(RANK_TOP / 100); page++) {
    const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=${page}&num=100&sort=amount&asc=0&node=hs_a&_s_r_a=init`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`rank HTTP ${res.status}`);
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("empty rank");
    for (const it of arr) rows.push({ code: String(it.code), name: String(it.name) });
    await sleep(200);
  }
  if (rows.length < 100) throw new Error(`rank too short: ${rows.length}`);
  return rows.slice(0, RANK_TOP);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 从旧快照提取已收录 code（榜单外保留，保证历史行情连续）
function oldSnapshotCodes() {
  try {
    const src = readFileSync(OUT, "utf8");
    const names = src.match(/^  "(\d{6})": "[^"]+",?$/gm) ?? [];
    const market = src.match(/^  "(\d{6})": \[/gm) ?? [];
    const codes = new Set([...names, ...market].map((l) => l.match(/\d{6}/)[0]));
    return [...codes];
  } catch {
    return [];
  }
}

// 生成标的池：榜单优先（保留榜序），旧快照补尾，截断到 MAX_CODES
function buildCodeList(rank, oldCodes) {
  const seen = new Set();
  const list = [];
  for (const it of rank) {
    if (!seen.has(it.code)) {
      seen.add(it.code);
      list.push({ code: it.code, name: it.name });
    }
  }
  for (const code of oldCodes) {
    if (seen.has(code)) continue;
    if (list.length >= MAX_CODES) break;
    seen.add(code);
    list.push({ code, name: code }); // 名称以排行榜为准，旧快照补位无名称时用 code
  }
  return list.slice(0, MAX_CODES);
}

// 经服务器网关中转（本机/CI 直连被腾讯 WAF 拦截时，HK 服务器已验证可达）
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

function emitTs(series, meta, names, indexes, indexNames) {
  const codes = [...series.keys()].sort();
  // —— 个股行情 → market-real.ts ——
  const lines = [];
  lines.push("// AUTO-GENERATED by scripts/fetch-market.mjs — 请勿手改（个股行情部分；大盘指数在 index-real.ts）。");
  lines.push(`// 来源：${meta.source} | fetchedAt: ${meta.fetchedAt} | 交易日历 ${meta.calendar.length} 天`);
  lines.push(`// 覆盖标的：${codes.length} 只（成交额排行榜前 ${RANK_TOP} + 旧快照保留）`);
  lines.push("export const REAL_MARKET_META = {");
  lines.push(`  source: "${meta.source}",`);
  lines.push(`  fetchedAt: "${meta.fetchedAt}",`);
  lines.push(`  firstTradeDate: "${meta.firstTradeDate}",`);
  lines.push(`  lastTradeDate: "${meta.lastTradeDate}",`);
  lines.push(`  days: ${meta.days},`);
  lines.push("};");
  lines.push("");
  lines.push("// code -> 股票名称（排行榜来源；旧快照补位标的无名称时回退 code）");
  lines.push("export const REAL_MARKET_NAMES: Record<string, string> = {");
  for (const code of codes) {
    lines.push(`  "${code}": "${names.get(code) ?? code}",`);
  }
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
  lines.push("// code -> 最新收盘价（mergeRealInstruments 的 GBM 兜底 start 用；轻量映射让沙箱 bundle 无需拉入全量 REAL_MARKET）");
  lines.push("export const REAL_LAST_CLOSE: Record<string, number> = {");
  for (const code of codes) {
    const rows = series.get(code);
    lines.push(`  "${code}": ${rows[rows.length - 1][2]},`);
  }
  lines.push("};");
  lines.push("");
  writeFileSync(OUT, lines.join("\n"));

  // —— 大盘指数 → index-real.ts ——
  const idxLines = [];
  idxLines.push("// AUTO-GENERATED by scripts/fetch-market.mjs — 请勿手改（大盘指数部分）。");
  idxLines.push("// 指数行情独立成模块：个股全量行情（market-real.ts ~8MB）不进沙箱回测 bundle，");
  idxLines.push("// 沙箱只需本模块的指数数据（熔断护栏 / 基准对比 / 大盘面板共用）。");
  idxLines.push("");
  idxLines.push("// 指数代码 -> 名称（大盘行情面板 / 基准对比用）");
  idxLines.push("export const REAL_INDEX_NAMES: Record<string, string> = {");
  for (const [sym, name] of indexNames) {
    if (indexes.has(sym)) idxLines.push(`  "${sym}": "${name}",`);
  }
  idxLines.push("};");
  idxLines.push("");
  idxLines.push("// 指数日K：code -> [[date, open, close, high, low, volume], ...]（正序，不复权点位）");
  idxLines.push("export const REAL_INDEXES: Record<string, Array<[string, number, number, number, number, number]>> = {");
  for (const [sym, rows] of indexes) {
    idxLines.push(`  "${sym}": [`);
    for (const r of rows) {
      idxLines.push(`    ["${r[0]}", ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}${r[5] != null ? `, ${r[5]}` : ""}],`);
    }
    idxLines.push("  ],");
  }
  idxLines.push("};");
  writeFileSync(OUT_INDEX, idxLines.join("\n"));
}

async function main() {
  // 1) 成交额排行榜前 300（含名称）
  const rank = await fetchRankSina();
  console.log(`[fetch-market] 排行榜: ${rank.length} 只（${rank[0].code} ${rank[0].name} … ${rank[rank.length - 1].code}）`);

  // 2) 合并旧快照（榜单外保留，保证历史行情连续）
  const oldCodes = oldSnapshotCodes();
  const codeList = buildCodeList(rank, oldCodes);
  console.log(`[fetch-market] 目标池: ${codeList.length} 只（旧快照保留 ${codeList.length - rank.length} 只榜外标的）`);

  // 3) 逐只拉取：单只失败跳过，不阻断整批；请求间节流防限流
  const series = new Map(); // code -> rows
  const names = new Map(); // code -> 名称
  let source = null;
  let fail = 0;
  for (const { code, name } of codeList) {
    let rows = null;
    const attempts = [
      ["tencent-direct", () => fetchTencent(code)],
      ["tencent-ssh", () => fetchTencentViaSsh(code)],
      ["sina", () => fetchSina(code)],
    ];
    for (const [srcName, fn] of attempts) {
      try {
        rows = dropIntraday(await fn());
        verify(code, rows);
        if (!source) source = srcName; // 记录首个可用源
        break;
      } catch (e) {
        if (srcName === "tencent-direct") console.warn(`[fetch-market] ${code} direct 失败: ${e.message}`);
      }
    }
    if (rows) {
      series.set(code, rows);
      // 名称只登记拉取成功的标的（失败标的若进名称表，会被 mergeRealInstruments 生成 start=10 的幽灵假标的）
      names.set(code, name);
    } else {
      fail++;
      console.warn(`[fetch-market] ${code} 全部数据源失败，跳过`);
    }
    await sleep(SLEEP_MS);
  }

  // 4) 成功率不足则保留旧快照（构建不阻断）
  if (series.size < MIN_OK) {
    console.warn(`[fetch-market] 成功 ${series.size} 只 < ${MIN_OK}，保留现有快照`);
    return;
  }
  console.log(`[fetch-market] 拉取完成: 成功 ${series.size} 只，失败跳过 ${fail} 只`);

  // 4.5) 大盘指数（新浪，与个股共享节流；失败不阻断个股主流程）
  const indexes = new Map(); // sym -> rows
  const indexNames = new Map(); // sym -> 名称（REAL_INDEX_NAMES 输出用，勿用行情数组当名称）
  for (const [sym, name] of INDEX_SYMBOLS) {
    try {
      const rows = dropIntraday(await fetchIndexSina(sym));
      if (rows.length >= MIN_BARS) {
        indexes.set(sym, rows);
        indexNames.set(sym, name);
        console.log(`[fetch-market] 指数 ${sym} ${name}: ${rows.length} 根（末 ${rows[rows.length - 1][0]} ${rows[rows.length - 1][2]}）`);
      } else {
        console.warn(`[fetch-market] ${sym} ${name} 指数数据过短，跳过`);
      }
    } catch (e) {
      console.warn(`[fetch-market] ${sym} ${name} 指数拉取失败: ${e.message}`);
    }
    await sleep(SLEEP_MS);
  }
  if (indexes.size < 3) console.warn(`[fetch-market] 指数仅成功 ${indexes.size}/5，大盘面板可能不完整`);

  // 5) 交易日历（全标的并集，升序）
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
  }, names, indexes, indexNames);

  const total = [...series.values()].reduce((n, r) => n + r.length, 0);
  console.log(`[fetch-market] OK source=${source} codes=${series.size} bars=${total} indexes=${indexes.size} range=${firstTradeDate} → ${lastTradeDate}`);
  console.log(`[fetch-market] wrote ${OUT} + ${OUT_INDEX}`);
}

main().catch((e) => {
  console.warn(`[fetch-market] 拉取失败，保留现有快照: ${e.message}`);
  process.exit(0); // 构建不阻断
});
