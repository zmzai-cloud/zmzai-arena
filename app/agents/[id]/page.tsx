import type { Metadata } from "next";
import { AgentDetailClient } from "@/components/AgentDetailClient";
import { getAgent } from "@/data/agents";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const agent = getAgent(Number(id));
  return {
    title: agent
      ? `${agent.name} · Zmz AI Trader Arena`
      : "交易员档案 · Zmz AI Trader Arena",
  };
}

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  return <AgentDetailClient id={id} />;
}
