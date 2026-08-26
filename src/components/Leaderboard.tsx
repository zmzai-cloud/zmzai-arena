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

const markets = ["全部", ...Array.from(new Set(STATIC_AGENTS.map((a) => a.market)))];

// 终端式行情表：mono 表头 + 数字右对齐 + 细线，无圆角无阴影
export function Leaderboard() {
  const [filter, setFilter] = useState("全部");
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

  // 当前赛季实时 TOP3（按夏普，与榜单默认排序一致）
  const liveTop = useMemo<SeasonTopEntry[]>(() => {
    return [...all]
      .sort((a, b) => b.sharpe - a.sharpe)
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
  }, [all]);

  // 我的最佳名次（creator === "我" 的策略，按夏普）
  const myBest = useMemo(() => {
    const mine = all.filter((a) => a.creator === "我");
    if (mine.length === 0) return null;
    return Math.min(...mine.map((a) => liveRankOf(all, a.id) ?? Infinity));
  }, [all]);

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
      </div>

      {viewingHistory ? (
        <HistoryTable entries={snaps?.months[seasonView] ?? []} />
      ) : (
        <>
          {/* 市场筛选：下划线 tab，直角金融风 */}
          <div className="flex items-center gap-1 border-b border-line">
            {markets.map((m) => (
              <button
                key={m}
                onClick={() => setFilter(m)}
                className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors ${
                  filter === m
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-3 hover:text-ink"
                }`}
              >
                {m}
              </button>
            ))}
            <span className="ml-auto hidden pb-2 text-[11.5px] text-ink-3 sm:block">
              点表头「总收益 / 回撤 / 夏普 / 风险分」排序
            </span>
          </div>

          {/* 实时 TOP3 荣誉栏 */}
          {liveTop.length > 0 && (
            <div className="grid grid-cols-3 gap-2 py-3">
              {liveTop.map((e) => (
                <Podium key={e.id} e={e} />
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

/** 实时 TOP3 荣誉卡：名次 + 头像 + 名字 + 夏普 */
function Podium({ e }: { e: SeasonTopEntry }) {
  const tone = e.rank === 1 ? "text-accent" : e.rank === 2 ? "text-warning" : "text-ink-3";
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
        <span className="num block text-[11px] text-ink-3">夏普 {e.sharpe.toFixed(2)}</span>
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
}: {
  a: Agent;
  rank: number;
  liveRank: number | null;
  medals: { season: string; rank: number }[];
  isMine: boolean;
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
