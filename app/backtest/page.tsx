import type { Metadata } from "next";

import { agents } from "@/data/agents";
import { INSTRUMENT_OPTIONS } from "@/sim/market";
import {
  BacktestWorkbench,
  type AgentPreset,
  type InstrumentOption,
} from "@/components/BacktestWorkbench";

export const metadata: Metadata = {
  title: "回测工作台 · zmzai 投研竞技场",
  description:
    "用官方智能体的策略配置跑回测：仿真（本地种子化行情，可复现）或实盘（zmzai-data 真实日线快照）。同一套引擎，含手续费/滑点/涨跌停约束。",
};

// 服务端组件：官方 Agent 的仿真结果与标的池都在这里取，客户端只拿轻量化 props，
// 避免 8MB 行情明细被打进浏览器 bundle。
export default function BacktestPage() {
  const presets: AgentPreset[] = agents
    .filter((a) => Boolean(a.cfg))
    .map((a) => ({
      id: a.id,
      emoji: a.emoji,
      name: a.name,
      style: a.style,
      market: a.market,
      simDays: a.simDays ?? a.days,
      cfg: a.cfg as AgentPreset["cfg"],
    }));

  const instruments: InstrumentOption[] = INSTRUMENT_OPTIONS.map((i) => ({
    code: i.code,
    name: i.name,
    market: i.market,
    board: i.board,
  }));

  return <BacktestWorkbench presets={presets} instruments={instruments} />;
}
