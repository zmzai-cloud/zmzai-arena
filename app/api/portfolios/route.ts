import { NextRequest, NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import {
  listPortfolios,
  savePortfolioFor,
  removePortfolioFor,
  PortfolioStoreError,
} from "@/lib/portfolio-store";
import type { FollowPortfolio } from "@/lib/portfolios";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 跟单组合云存储：登录用户跨设备同步（user:<id> 绑定），未登录一律 401（客户端按匿名处理）。
// GET → 全部组合；POST → 保存/覆盖单个组合（按 id 幂等，超 plan 上限 409）；
// DELETE ?id= → 删除单个组合。
export async function GET(req: NextRequest) {
  const user = await sessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    return NextResponse.json({ portfolios: listPortfolios(user.id) });
  } catch (e) {
    if (e instanceof PortfolioStoreError) {
      return NextResponse.json({ error: "跟单存储暂不可用" }, { status: 503 });
    }
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const user = await sessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }
  const s = sanitizePortfolio(body);
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: 400 });

  try {
    savePortfolioFor(user.id, s.portfolio);
    return NextResponse.json({ ok: true, id: s.portfolio.id });
  } catch (e) {
    if (e instanceof PortfolioStoreError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  const user = await sessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 必填" }, { status: 400 });
  try {
    const removed = removePortfolioFor(user.id, id);
    return NextResponse.json({ ok: true, removed });
  } catch (e) {
    if (e instanceof PortfolioStoreError) {
      return NextResponse.json({ error: "跟单存储暂不可用" }, { status: 503 });
    }
    throw e;
  }
}

/** 组合结构轻量，逐字段校验（客户端生成的 id 为 pf- 前缀时间戳串） */
function sanitizePortfolio(raw: unknown): { ok: true; portfolio: FollowPortfolio } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "请求体必须是对象" };
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== "string" || !/^pf-[\w-]+$/.test(p.id)) return { ok: false, error: "id 不合法" };
  if (!Number.isInteger(p.agentId) || (p.agentId as number) <= 0) return { ok: false, error: "agentId 不合法" };
  if (!Number.isFinite(p.capital) || (p.capital as number) < 100) return { ok: false, error: "capital 不合法" };
  for (const k of ["createdAt", "syncedAt"]) {
    if (typeof p[k] !== "string" || Number.isNaN(Date.parse(p[k] as string))) {
      return { ok: false, error: `${k} 不合法` };
    }
  }
  return {
    ok: true,
    portfolio: {
      id: p.id as string,
      agentId: p.agentId as number,
      capital: Math.round(p.capital as number),
      createdAt: p.createdAt as string,
      syncedAt: p.syncedAt as string,
    },
  };
}
