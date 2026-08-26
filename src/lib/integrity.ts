// 决策日志存证：把「策略 Prompt + 逐笔决策日志 + 期末持仓」规范化为字符串，
// 经 SHA-256 计算成不可篡改的内容指纹。任一字段改动都会改变指纹，可用于证明日志未被篡改。
//
// 指纹在构建期（官方 Agent）与创建期（用户 Agent）各算一次并固化进 Agent 对象；
// 前端「校验」用同一算法对当前展示内容复算并比对，一致即证明未被篡改。
// 注：当前为本地演示，指纹未写入公链；如需可审计存证，后续可把该哈希提交到链上。

import { sha256Hex } from "./sha256";
import type { Agent } from "@/data/agents";

export function computeIntegrityHash(a: Agent): string {
  const canonical =
    `id=${a.id}` +
    `|prompt=${a.prompt}` +
    `|log=` +
    a.log.map((d) => `${d.action}@${d.time}:${d.text}`).join("||") +
    `|pos=` +
    a.positions.map((p) => `${p.code}:${p.qty}:${p.price}:${p.mv}`).join("||");
  return sha256Hex(canonical);
}
