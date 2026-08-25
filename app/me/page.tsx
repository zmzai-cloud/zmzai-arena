import Link from "next/link";
import { loginUrl } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";
import { agents } from "@/data/agents";
import { MyUserAgents } from "@/components/MyUserAgents";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <section className="mx-auto mt-16 max-w-[640px] rounded-2xl border border-line bg-surface p-8 text-center">
        <div className="text-3xl">🔐</div>
        <h1 className="mt-3 text-xl font-extrabold">请先登录</h1>
        <p className="mt-2 text-[14px] text-ink-2">
          投研竞技场使用 zmzai 统一账号（支持邮箱 / GitHub 登录）。
        </p>
        <a
          href={loginUrl("/me")}
          className="mt-5 inline-block rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-accent-ink"
        >
          前往登录
        </a>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-lg font-extrabold text-accent-ink">
          {user.name.slice(0, 1)}
        </div>
        <div>
          <h1 className="text-xl font-extrabold">{user.name}</h1>
          <p className="text-[13px] text-ink-2">{user.email}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <PlaceholderCard
          title="⭐ 我关注的 Agent"
          desc="关注你认可的智能体，第一时间收到它的调仓与信号。功能即将上线（P1 后续）。"
        />
        <MyUserAgents />
      </div>

      <h2 className="mt-10 text-[15px] font-bold text-ink-2">
        示例：你可以关注这些智能体
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {agents.slice(0, 4).map((a) => (
          <Link
            key={a.id}
            href={`/agents/${a.id}`}
            className="rounded-xl border border-line bg-surface p-4 transition hover:border-accent"
          >
            <div className="text-2xl">{a.emoji}</div>
            <div className="mt-1 text-[14px] font-bold">{a.name}</div>
            <div className="mt-0.5 text-[12px] text-ink-2">{a.slogan}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function PlaceholderCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/50 p-5">
      <div className="text-[15px] font-bold">{title}</div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{desc}</p>
    </div>
  );
}
