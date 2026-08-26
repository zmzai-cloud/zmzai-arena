import { CreateForm } from "@/components/CreateForm";

// 服务端入口：解析 ?fork=<agentId> 交给客户端表单预填（官方 / 用户 Agent 均可 Fork）
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ fork?: string }>;
}) {
  const { fork } = await searchParams;
  return <CreateForm forkId={fork} />;
}
