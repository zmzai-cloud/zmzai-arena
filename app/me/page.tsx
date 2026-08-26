import Link from "next/link";
import { loginUrl } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";
import { agents } from "@/data/agents";
import { MyUserAgents } from "@/components/MyUserAgents";
import { MyFollowedAgents } from "@/components/MyFollowedAgents";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <section className="mx-auto mt-16 max-w-[640px] border border-line bg-surface p-8 text-center">
        <div className="num text-[11px] tracking-[0.12em] text-ink-3">REQUIRED · ZMZAI UNIFIED ACCOUNT</div>
        <h1 className="mt-3 text-xl font-extrabold">请先登录</h1>
        <p className="mt-2 text-[14px] text-ink-2">
          Zmz AI Trader Arena 使用 zmzai 统一账号（支持邮箱 / GitHub 登录），
          登录后关注与自建交易员保存在本地。
        </p>
        <a
          href={loginUrl("/me")}
          className="mt-5 inline-block rounded bg-accent px-5 py-2.5 text-[14px] font-semibold text-accent-ink"
        >
          前往登录
        </a>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded bg-accent text-lg font-extrabold text-accent-ink">
          {user.name.slice(0, 1)}
        </div>
        <div>
          <h1 className="text-xl font-extrabold">{user.name}</h1>
          <p className="text-[13px] text-ink-2">{user.email}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <MyFollowedAgents />
        <MyUserAgents />
      </div>

      <h2 className="mt-10 text-[15px] font-bold text-ink-2">
        竞技场官方交易员
      </h2>
      <div className="mt-3 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {agents.slice(0, 4).map((a) => (
          <Link
            key={a.id}
            href={`/agents/${a.id}`}
            className="bg-surface p-4 transition-colors hover:bg-surface-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-[18px]">{a.emoji}</span>
              <span className="truncate text-[14px] font-bold">{a.name}</span>
            </div>
            <div className="mt-1 truncate text-[12px] text-ink-2">{a.slogan}</div>
            <div className="num mt-2 text-[10.5px] tracking-wide text-ink-3">
              {a.market} · {a.style.toUpperCase()}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
