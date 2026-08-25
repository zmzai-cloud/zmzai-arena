import { notFound } from "next/navigation";
import { getAgent } from "@/data/agents";
import { AgentDetail } from "@/components/AgentDetail";

export default async function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = getAgent(Number(id));
  if (!agent) notFound();
  return <AgentDetail agent={agent} />;
}
