"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { agents as STATIC_AGENTS, type Agent } from "@/data/agents";
import { loadUserAgents } from "@/lib/userAgents";
import { useIsFollowed, toggleFollow } from "@/lib/follows";
import { fmtPct, riskColor, tierBadge, engineBadge, engineCls } from "@/lib/format";
import type { RobustnessLabel } from "@/sim/robustness";
import {
  ensureSeasonArchive,
  loadSeasonSnapshots,
  liveRankOf,
  medalsOf,
  MEDAL_LABEL,
  medalCls,
  monthKey,
  seasonDaysLeft,
  seasonTitle,
  type SeasonSnapshots,
  type SeasonTopEntry,
} from "@/lib/season";

type SortKey = "totalReturn" | "maxDD" | "sharpe" | "riskScore";
// 榜单口径：夏普榜（赛季结算口径，专业） / 收益榜（小韭菜视角，赚得多排前面）
type BoardMode = "sharpe" | "return";

const markets = ["全部", ...Array.from(new Set(STATIC_AGENTS.map((a) => a.market)))];

// 终端式行情表：mono 表头 + 数字右对齐 + 细线，无圆角无阴影
export function Leaderboard() {
  const [filter, setFilter] = useState("全部");
  const [mode, setMode] = useState<BoardMode>("sharpe");
  const [sortKey, setSortKey] = useState<SortKey>("sharpe");
  const [dir, setDir] = useState<-1 | 1>(-1);
  const [userAgents, setUserAgents] = useState<Agent[]>([]);
  const [seasonView, setSeasonView] = useState<string>("live"); // "live" 或历史赛季 key
  const [snaps, setSnaps] = useState<SeasonSnapshots | null>(null);

  useEffect(() => {
    const refresh = () => {
      const local = loadUserAgents();
      setUserAgents(local);
      // 跨月自动结算上月榜单（幂等），并读取历史徽章
      ensureSeasonArchive([...STATIC_AGENTS, ...local]);
      setSnaps(loadSeasonSnapshots());
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const all = useMemo(() => [...STATIC_AGENTS, ...userAgents], [userAgents]);
  const list = useMemo(() => {
    const f = all.filter((a) => filter === "全部" || a.market === filter);
    return [...f].sort((a, b) => (a[sortKey] - b[sortKey]) * dir);
  }, [all, filter, sortKey, dir]);

  // 当前赛季实时 TOP3：夏普榜按夏普、收益榜按总收益（口径随切换）
  const liveTop = useMemo<SeasonTopEntry[]>(() => {
    const byReturn = mode === "return";
    return [...all]
      .sort((a, b) => (byReturn ? b.totalReturn - a.totalReturn : b.sharpe - a.sharpe))
      .slice(0, 3)
      .map((a, i) => ({
        id: a.id,
        name: a.name,
        emoji: a.emoji,
        market: a.market,
        sharpe: a.sharpe,
        totalReturn: a.totalReturn,
        rank: i + 1,
      }));
  }, [all, mode]);

  // 我的最佳名次（creator === "我"，名次口径随切换）
  const myBest = useMemo(() => {
    const mine = all.filter((a) => a.creator === "我");
    if (mine.length === 0) return null;
    const ranks = mine.map((a) => rankBy(all, a.id, mode === "return" ? "totalReturn" : "sharpe") ?? Infinity);
    return Math.min(...ranks);
  }, [all, mode]);

  const curMonth = monthKey();
  const historyMonths = snaps ? Object.keys(snaps.months).sort().reverse() : [];
  const viewingHistory = seasonView !== "live";

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === -1 ? 1 : -1));
    else {
      setSortKey(k);
      setDir(-1);
    }
  };
  const switchMode = (m: BoardMode) => {
    if (m === mode) return;
    setMode(m);
    setSortKey(m === "return" ? "totalReturn" : "sharpe");
    setDir(-1);
  };
  const arrow = (k: SortKey) => (k === sortKey ? (dir === -1 ? "↓" : "↑") : "⇅");

  return (
    <div className="mt-6">
      {/* 赛季头：赛季名 + 倒计时 + 规则 + 我的排名 */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-[20px] font-extrabold tracking-tight">
              {viewingHistory ? seasonTitle(seasonView) : seasonTitle(curMonth)}
            </h2>
            {!viewingHistory && (
              <span className="flex items-center gap-1.5 rounded bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink-2">
                <i className="h-1.5 w-1.5 rounded-full bg-accent" />
                进行中 · 剩 {seasonDaysLeft()} 天
              </span>
            )}
            {viewingHistory && (
              <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink-3">
                已结算
              </span>
            )}
          </div>
          <p className="mt-1.5 max-w-[560px] text-[12.5px] leading-relaxed text-ink-3">
            {viewingHistory
              ? "赛季已结算：按结算时夏普排名，TOP3 永久获得赛季徽章（冠军 / 亚军 / 季军）。"
              : "每月 1 日按夏普排名结算，TOP3 永久获得赛季徽章；你的策略可随时「重新验证」刷新成绩。"}
          </p>
        </div>
        <div className="text-right">
          {myBest !== null ? (
            <>
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">
                你的最佳排名
              </div>
              <div className="num text-[22px] font-extrabold leading-none text-accent">
                #{myBest}
              </div>
            </>
          ) : (
            <Link
              href="/create"
              className="rounded border border-accent/50 px-3 py-1.5 text-[12.5px] font-bold text-accent transition-colors hover:bg-accent/10"
            >
              + 创建策略参赛
            </Link>
          )}
        </div>
      </div>

      {/* 赛季切换：本赛季 / 历史赛季（已结算） */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-line">
        <button
          onClick={() => setSeasonView("live")}
          className={`-mb-px flex-none border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors ${
            !viewingHistory ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink"
          }`}
        >
          本赛季
        </button>
        {historyMonths.map((m) => (
          <button
            key={m}
            onClick={() => setSeasonView(m)}
            className={`-mb-px flex-none border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors ${
              viewingHistory && seasonView === m
                ? "border-accent text-ink"
                : "border-transparent text-ink-3 hover:text-ink"
            }`}
          >
            {seasonTitle(m)}
            <span className="ml-1.5 text-[10.5px] font-normal text-ink-3">已结算</span>
          </button>
        ))}
        {historyMonths.length === 0 && (
          <span className="ml-3 hidden pb-2 text-[11.5px] text-ink-3 sm:block">
            赛季每月自动结算，上月榜单归档后可回看
          </span>
        )}
        <Link
          href="/battle"
          className="ml-auto -mb-px flex-none px-3 py-2 text-[13px] font-bold text-accent transition-colors hover:bg-accent/10"
        >
          对决擂台 →
        </Link>
      </div>

      {viewingHistory ? (
        <HistoryTable entries={snaps?.months[seasonView] ?? []} />
      ) : (
        <>
          {/* 市场筛选 + 榜单口径：下划线 tab，直角金融风 */}
          <div className="flex items-center gap-1 border-b border-line">
            <button
              onClick={() => switchMode("sharpe")}
              title="按风险调整后收益（夏普）排名，与赛季结算同口径"
              className={`-mb-px flex-none border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors ${
                mode === "sharpe" ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink"
              }`}
            >
              夏普榜
            </button>
            <button
              onClick={() => switchMode("return")}
              title="按总收益排名：赚得多就排前面（小韭菜视角）"
              className={`-mb-px flex-none border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors ${
                mode === "return" ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink"
              }`}
            >
              收益榜
            </button>
            {markets.map((m) => (
              <button
                key={m}
                onClick={() => setFilter(m)}
                className={`-mb-px px-3 py-2 text-[13px] font-semibold transition-colors ${
                  filter === m
                    ? "border-b-2 border-accent text-ink"
                    : "border-b-2 border-transparent text-ink-3 hover:text-ink"
                }`}
              >
                {m}
              </button>
            ))}
            <span className="ml-auto hidden pb-2 text-[11.5px] text-ink-3 sm:block">
              {mode === "return"
                ? "收益榜按总收益排序 · 点表头可换列 · 跟投列按 1 万元换算"
                : "点表头「总收益 / 回撤 / 夏普 / 风险分」排序"}
            </span>
          </div>

          {/* 实时 TOP3 荣誉栏 */}
          {liveTop.length > 0 && (
            <div className="grid grid-cols-3 gap-2 py-3">
              {liveTop.map((e) => (
                <Podium key={e.id} e={e} mode={mode} />
              ))}
            </div>
          )}

          {/* 榜单表格：移动端横向滚动，不撑破视口 */}
          <div className="overflow-x-auto">
            <table className="dtbl min-w-[720px]">
              <thead>
                <tr>
                  <th>#</th>
                  <th>交易员 / 策略</th>
                  <th>市场 · 风格</th>
                  <th className="cursor-pointer" onClick={() => toggleSort("totalReturn")}>
                    总收益{sortKey === "totalReturn" && <span className="ml-1 text-accent">{arrow("totalReturn")}</span>}
                  </th>
                  {mode === "return" && <th className="text-right">跟投 1 万 →</th>}
                  <th className="cursor-pointer" onClick={() => toggleSort("maxDD")}>
                    最大回撤{sortKey === "maxDD" && <span className="ml-1 text-accent">{arrow("maxDD")}</span>}
                  </th>
                  <th className="cursor-pointer" onClick={() => toggleSort("sharpe")}>
                    夏普{sortKey === "sharpe" && <span className="ml-1 text-accent">{arrow("sharpe")}</span>}
                  </th>
                  <th className="cursor-pointer" onClick={() => toggleSort("riskScore")}>
                    风险分{sortKey === "riskScore" && <span className="ml-1 text-accent">{arrow("riskScore")}</span>}
                  </th>
                  <th>稳健度</th>
                  <th className="text-center">关注</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a, i) => (
                  <Row
                    key={a.id}
                    a={a}
                    rank={i + 1}
                    liveRank={liveRankOf(all, a.id)}
                    medals={snaps ? medalsOf(a.id, snaps) : []}
                    isMine={a.creator === "我"}
                    showWan={mode === "return"}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-6 text-center text-[12px] text-ink-2">
        数据为模拟演示，仅用于产品原型展示 · 投资有风险，本平台不参与任何真实交易
      </p>
    </div>
  );
}

/** 实时 TOP3 荣誉卡：名次 + 头像 + 名字 + 夏普（收益榜显示收益） */
function Podium({ e, mode }: { e: SeasonTopEntry; mode: BoardMode }) {
  const tone = e.rank === 1 ? "text-accent" : e.rank === 2 ? "text-warning" : "text-ink-3";
  const byReturn = mode === "return";
  return (
    <Link
      href={`/agents/${e.id}`}
      className="group flex items-center gap-2.5 rounded border border-line bg-surface px-3 py-2 transition-colors hover:border-accent/50"
    >
      <span className={`num text-[22px] font-extrabold leading-none ${tone}`}>#{e.rank}</span>
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded bg-surface-2 text-[16px]">
        {e.emoji}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold group-hover:text-accent">{e.name}</span>
        {byReturn ? (
          <span className={`num block text-[11px] ${e.totalReturn >= 0 ? "text-accent" : "text-danger"}`}>
            {fmtPct(e.totalReturn)}
          </span>
        ) : (
          <span className="num block text-[11px] text-ink-3">夏普 {e.sharpe.toFixed(2)}</span>
        )}
      </span>
    </Link>
  );
}

/** 历史赛季结算表（只读） */
function HistoryTable({ entries }: { entries: SeasonTopEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-ink-3">
        该赛季暂无结算记录（榜单为空时不会归档）
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="dtbl min-w-[620px]">
        <thead>
          <tr>
            <th>#</th>
            <th>交易员 / 策略</th>
            <th>市场</th>
            <th className="text-right">结算时总收益</th>
            <th className="text-right">结算时夏普</th>
            <th>赛季荣誉</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className={`num ${e.rank <= 3 ? "font-extrabold" : "text-ink-3"}`}>
                <span className={e.rank <= 3 ? medalCls(e.rank) + " rounded px-1.5 py-0.5 text-[11px]" : ""}>
                  #{e.rank}
                </span>
              </td>
              <td>
                <Link href={`/agents/${e.id}`} className="group flex items-center gap-2.5">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded bg-surface-2 text-[16px]">
                    {e.emoji}
                  </span>
                  <span className="truncate font-semibold group-hover:text-accent">{e.name}</span>
                </Link>
              </td>
              <td>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold">{e.market}</span>
              </td>
              <td className={`num text-right ${e.totalReturn >= 0 ? "up" : "down"}`}>{fmtPct(e.totalReturn)}</td>
              <td className="num text-right font-extrabold">{e.sharpe.toFixed(2)}</td>
              <td>
                {e.rank <= 3 ? (
                  <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${medalCls(e.rank)}`}>
                    {MEDAL_LABEL[e.rank]}
                  </span>
                ) : (
                  <span className="text-[12px] text-ink-3">入围 TOP{e.rank}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  a,
  rank,
  liveRank,
  medals,
  isMine,
  showWan,
}: {
  a: Agent;
  rank: number;
  liveRank: number | null;
  medals: { season: string; rank: number }[];
  isMine: boolean;
  showWan: boolean;
}) {
  const tb = tierBadge(a.tier);
  return (
    <tr className={isMine ? "bg-accent/5" : undefined}>
      <td className={rank <= 3 ? "font-extrabold" : "text-ink-3"}>
        <span className={`num ${rank === 1 ? "text-accent" : rank === 2 ? "text-warning" : rank === 3 ? "text-ink-3" : ""}`}>
          #{rank}
        </span>
      </td>
      <td>
        <Link href={`/agents/${a.id}`} className="group flex items-center gap-2.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded bg-surface-2 text-[16px]">
            {a.emoji}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5 font-semibold">
              <span className="truncate">{a.name}</span>
              {isMine && (
                <span className="rounded bg-accent/12 px-1.5 py-px text-[10px] font-bold text-accent">我的</span>
              )}
              {a.verified && (
                <span className="num text-[10px] font-bold text-accent">✓VERIFIED</span>
              )}
              {a.engine && (
                <span className={`rounded px-1.5 py-px text-[10px] font-bold ${engineCls(a.engine)}`}>
                  {engineBadge(a.engine)}
                </span>
              )}
              {medals.map((m) => (
                <span key={m.season} className={`rounded px-1.5 py-px text-[10px] font-bold ${medalCls(m.rank)}`}>
                  {m.season.slice(5)}月 {MEDAL_LABEL[m.rank]}
                </span>
              ))}
            </span>
            <span className="block truncate text-[12px] text-ink-3">{a.slogan}</span>
          </span>
        </Link>
      </td>
      <td>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold">{a.market}</span>
        <span className="ml-1.5 text-[12px] text-ink-3">{a.style}</span>
      </td>
      <td className={`num text-right ${a.totalReturn >= 0 ? "up" : "down"}`}>{fmtPct(a.totalReturn)}</td>
      {showWan && (
        <td className="num text-right font-bold">
          <Link
            href={`/portfolio?follow=${a.id}&capital=10000`}
            title="一键跟投：拿 1 万虚拟资金跟随它的持仓"
            className={`${a.totalReturn >= 0 ? "up" : "down"} transition-opacity hover:opacity-70`}
          >
            ¥{(10000 * (1 + a.totalReturn / 100)).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
          </Link>
        </td>
      )}
      <td className={`num text-right ${a.maxDD >= 0 ? "up" : "down"}`}>{fmtPct(a.maxDD)}</td>
      <td className="num text-right font-extrabold">{a.sharpe.toFixed(2)}</td>
      <td className="text-right">
        <span className="riskbar inline-block w-14 align-middle">
          <i
            className="block h-full"
            style={{ width: `${a.riskScore}%`, background: riskColor(a.riskScore) }}
          />
        </span>
        <span className="num ml-2">{a.riskScore}</span>
      </td>
      <td>
        <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${robCls(a.robustness.label)}`}>
          {a.robustness.label}
        </span>
        <span className="num ml-1.5 text-[12px] text-ink-3">{a.robustness.stabilityScore}</span>
      </td>
      <td className="text-center">
        <FollowStar id={a.id} />
      </td>
    </tr>
  );
}

/** 榜单中某 agent 的名次（可选口径：夏普 / 总收益） */
function rankBy(list: Agent[], id: number, key: "sharpe" | "totalReturn"): number | null {
  const sorted = [...list].sort((a, b) => (key === "sharpe" ? b.sharpe - a.sharpe : b.totalReturn - a.totalReturn));
  const idx = sorted.findIndex((a) => a.id === id);
  return idx >= 0 ? idx + 1 : null;
}

function robCls(l: RobustnessLabel): string {
  if (l === "稳健") return "bg-success/12 text-success";
  if (l === "过拟合嫌疑") return "bg-danger/15 text-danger";
  return "bg-warning/15 text-warning";
}

function FollowStar({ id }: { id: number }) {
  const followed = useIsFollowed(id);
  return (
    <button
      onClick={() => toggleFollow(id)}
      title={followed ? "取消关注" : "关注"}
      aria-label={followed ? "取消关注" : "关注"}
      className={`inline-flex h-7 w-7 items-center justify-center rounded text-[15px] transition ${
        followed ? "bg-accent/10 text-accent" : "bg-surface-2 text-ink-3 hover:text-accent"
      }`}
    >
      {followed ? "★" : "☆"}
    </button>
  );
}
