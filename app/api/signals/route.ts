import { NextRequest, NextResponse } from "next/server";
import { agents as STATIC_AGENTS } from "@/data/agents";
import { listAllUserAgents } from "@/lib/user-agent-store";
import { sessionFromRequest } from "@/lib/session";
import { accountKey, getAccount } from "@/lib/billing-store";
import { computeSignals, dedupeAgentsByName, FREE_VISIBLE_SIGNALS, type ConsensusSignal, type SignalsResponse } from "@/lib/signals";

export const dynamic = "force-dynamic";

// 共识信号：聚合官方 + 全体用户已上云策略的当前真实持仓。
// 免费用户只看 TOP3（引流），Pro 解锁全部（付费点）。
export async function GET(req: NextRequest) {
  const user = await sessionFromRequest(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const acc = getAccount(accountKey(user, ip));
  const pro = acc.plan === "pro";

  const all = dedupeAgentsByName([...STATIC_AGENTS, ...listAllUserAgents()], STATIC_AGENTS);
  const signals = computeSignals(all);

  const visible = pro ? signals : signals.slice(0, FREE_VISIBLE_SIGNALS);
  return NextResponse.json({
    total: signals.length > 0 ? signals[0].total : all.length,
    signals: visible,
    pro,
    locked: pro ? 0 : Math.max(0, signals.length - FREE_VISIBLE_SIGNALS),
    fetchedAt: new Date().toISOString(),
  } satisfies SignalsResponse);
}
