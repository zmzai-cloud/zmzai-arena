"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { getAgent, type Agent } from "@/data/agents";
import { getUserAgent } from "@/lib/userAgents";
import { AgentDetail } from "@/components/AgentDetail";

// 静态 Agent 在 SSR/客户端都能直接解析；用户创建的 Agent 仅存于客户端 localStorage，
// 通过 effect 解析，初始以 "loading" 占位，保证 SSR 与客户端首屏一致、避免 hydration 错位。
export function AgentDetailClient({ id }: { id: number }) {
  const [agent, setAgent] = useState<Agent | "loading" | "missing">(
    () => getAgent(id) ?? "loading"
  );

  useEffect(() => {
    if (agent !== "loading") return;
    const ua = getUserAgent(id);
    setAgent(ua ?? "missing");
  }, [id, agent]);

  if (agent === "loading") {
    return <div className="mt-10 text-center text-ink-2">加载中…</div>;
  }
  if (agent === "missing") {
    notFound();
  }
  return <AgentDetail agent={agent} />;
}
