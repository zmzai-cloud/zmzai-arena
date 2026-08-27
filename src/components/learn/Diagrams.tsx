import type { ReactNode } from "react";

// 学堂 SVG 图解库:主题 token 色,零外部依赖。每个图配合文语境自说明。
// 统一画布 640x210,细线灰(var(--color-ink-3)),高亮 accent,涨红跌绿仅用于语义。

const S = { fill: "none", strokeWidth: 2 } as const;
const txt = (x: number, y: number, t: string, size = 12, color = "var(--color-ink-2)", anchor: "start" | "middle" | "end" = "middle") => (
  <text x={x} y={y} fontSize={size} fill={color} textAnchor={anchor}>{t}</text>
);
const box = (x: number, y: number, w: number, h: number, label: string, sub?: string, hot = false) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={6} fill="var(--color-surface-2)" stroke={hot ? "var(--color-accent)" : "var(--color-line)"} strokeWidth={hot ? 2 : 1} />
    {txt(x + w / 2, y + (sub ? h / 2 - 4 : h / 2 + 4), label, 13, "var(--color-ink)")}
    {sub && txt(x + w / 2, y + h / 2 + 14, sub, 11, "var(--color-ink-3)")}
  </g>
);
const arrow = (x1: number, y1: number, x2: number, y2: number) => (
  <g stroke="var(--color-ink-3)" strokeWidth={1.5} fill="none">
    <line x1={x1} y1={y1} x2={x2} y2={y2} />
    <polygon points={`${x2},${y2} ${x2 - (x2 > x1 ? 8 : -8)},${y2 - 4} ${x2 - (x2 > x1 ? 8 : -8)},${y2 + 4}`} fill="var(--color-ink-3)" stroke="none" />
  </g>
);

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <figure className="my-4 overflow-x-auto rounded-xl border border-line bg-surface-2/40 p-3">
      <svg viewBox="0 0 640 210" className="w-full min-w-[520px]" role="img" aria-label={label}>{children}</svg>
    </figure>
  );
}

const D: Record<string, () => ReactNode> = {
  // 三层结构:榜单 → 赛季 → 你
  "arena-map": () => (
    <Frame label="Arena 三层结构">
      {box(20, 60, 160, 80, "排行榜", "谁强,数据说话", true)}
      {box(240, 60, 160, 80, "赛季联赛", "月度升降级")}
      {box(460, 60, 160, 80, "你", "创建 / 跟单(模拟)", true)}
      {arrow(184, 100, 236, 100)}
      {arrow(404, 100, 456, 100)}
      {txt(320, 30, "围观 → 看懂 → 下场", 13, "var(--color-ink-2)")}
      {txt(320, 185, "全程模拟盘 · 不碰真钱", 11)}
    </Frame>
  ),
  // 决策循环
  "agent-loop": () => (
    <Frame label="AI 交易员每日决策循环">
      {box(30, 75, 120, 60, "读行情")}
      {box(185, 75, 120, 60, "算信号", "买 / 卖 / 不动", true)}
      {box(340, 75, 120, 60, "定仓位", "风控上限约束")}
      {box(495, 75, 120, 60, "下单成交")}
      {arrow(150, 105, 181, 105)}
      {arrow(305, 105, 336, 105)}
      {arrow(460, 105, 491, 105)}
      <path d="M 555 75 C 555 30, 90 30, 90 71" {...S} stroke="var(--color-ink-3)" strokeDasharray="5 4" />
      {txt(320, 40, "次日再来一轮 · 无情绪 · 可复现", 11)}
    </Frame>
  ),
  // 回测流程
  "backtest-flow": () => (
    <Frame label="回测:历史行情上的重演实验">
      {box(20, 70, 140, 70, "历史真实行情", "日线 · 多年", true)}
      {box(200, 70, 140, 70, "策略逐日回放", "T+1 · 手续费 · 涨跌停")}
      {box(380, 70, 120, 70, "成绩单", "净值/回撤/夏普", true)}
      {box(530, 70, 90, 70, "换种子", "再跑一遍")}
      {arrow(160, 105, 196, 105)}
      {arrow(340, 105, 376, 105)}
      {arrow(500, 105, 526, 105)}
      {txt(320, 190, "同参重跑结果必须一致 → 成绩可复现,不允许注水", 11)}
    </Frame>
  ),
  // 净值曲线:平稳 vs 崎岖同终点
  "nav-curve": () => (
    <Frame label="同样的 +60%,不同的路径">
      <line x1={60} y1={175} x2={580} y2={175} stroke="var(--color-line)" />
      <line x1={60} y1={175} x2={60} y2={20} stroke="var(--color-line)" />
      {txt(48, 30, "净值", 11, "var(--color-ink-3)", "end")}
      <path d="M 60 175 C 140 160, 240 130, 340 100 S 520 55, 570 45" {...S} stroke="var(--color-accent)" strokeWidth={2.5} />
      <path d="M 60 175 L 120 90 L 160 140 L 210 45 L 260 135 L 320 60 L 380 150 L 440 70 L 500 120 L 570 45" {...S} stroke="var(--color-ink-3)" strokeWidth={1.8} strokeDasharray="6 4" />
      {txt(300, 195, "绿线:平稳爬升   灰虚线:豪赌暴涨、几度腰斩", 11)}
      {txt(575, 38, "+60%", 12, "var(--color-ink)")}
      {txt(52, 180, "1.00", 11, "var(--color-ink-3)", "end")}
    </Frame>
  ),
  // 超额条形对比
  "excess-bar": () => (
    <Frame label="超额收益 = 交易员收益 − 基准收益">
      <line x1={80} y1={110} x2={580} y2={110} stroke="var(--color-line)" />
      <rect x={110} y={50} width={140} height={60} fill="var(--color-accent)" opacity={0.85} />
      {txt(180, 42, "交易员 +45%", 12, "var(--color-ink)")}
      <rect x={330} y={68} width={118} height={42} fill="var(--color-ink-3)" opacity={0.5} />
      {txt(389, 60, "基准(沪深300) +38%", 12, "var(--color-ink-2)")}
      {txt(320, 150, "多出来的 7% = 超额收益(策略的劳动价值)", 12, "var(--color-ink)")}
      {txt(320, 178, "跑不赢基准 → 不如直接买指数基金躺平", 11)}
    </Frame>
  ),
  // 回撤示意
  "dd-zigzag": () => (
    <Frame label="最大回撤:从山顶量到谷底">
      <path d="M 60 150 L 140 60 L 200 110 L 280 40 L 360 165 L 440 90 L 570 55" {...S} stroke="var(--color-accent)" strokeWidth={2.5} />
      <circle cx={280} cy={40} r={4} fill="var(--color-ink)" />
      <circle cx={360} cy={165} r={4} fill="var(--color-danger)" />
      <line x1={280} y1={40} x2={280} y2={165} stroke="var(--color-danger)" strokeDasharray="4 4" strokeWidth={1.5} />
      {txt(330, 105, "-35%", 13, "var(--color-danger)")}
      {txt(270, 28, "历史高点", 11)}
      {txt(360, 190, "最深谷底", 11)}
    </Frame>
  ),
  // 夏普对比
  "sharpe-compare": () => (
    <Frame label="夏普:收益 ÷ 波动,赚得稳不稳">
      <path d="M 60 170 C 150 60, 260 190, 380 70 S 520 110, 570 60" {...S} stroke="var(--color-ink-3)" strokeDasharray="6 4" />
      <path d="M 60 170 C 160 150, 300 120, 420 95 S 520 75, 570 65" {...S} stroke="var(--color-accent)" strokeWidth={2.5} />
      {txt(150, 55, "A:大起大落", 11, "var(--color-ink-3)")}
      {txt(430, 130, "B:匀速爬坡", 11, "var(--color-ink-2)")}
      {txt(320, 195, "终点接近,但 B 的夏普更高 —— 每份波动换来更多收益", 11)}
    </Frame>
  ),
  // 验证级别阶梯
  "tier-ladder": () => (
    <Frame label="验证级别:成绩的含信量阶梯">
      {box(20, 140, 130, 50, "Paper", "纯模拟,仅参考")}
      {box(180, 105, 130, 50, "Backtest", "历史回测")}
      {box(340, 70, 130, 50, "Forward", "前瞻:未见过的行情", true)}
      {box(500, 35, 120, 50, "Live", "实盘级,最高", true)}
      {arrow(152, 150, 176, 132)}
      {arrow(312, 115, 336, 97)}
      {arrow(472, 80, 496, 62)}
      {txt(320, 195, "级别越高,运气与水分被挤掉得越多", 11)}
    </Frame>
  ),
  // 风险分量表
  "risk-gauge": () => (
    <Frame label="风险分 0-100:越高越保守">
      <rect x={70} y={90} width={500} height={26} rx={13} fill="var(--color-surface-2)" stroke="var(--color-line)" />
      <rect x={70} y={90} width={95} height={26} rx={13} fill="var(--color-danger)" opacity={0.7} />
      <rect x={165} y={90} width={105} height={26} fill="var(--color-danger)" opacity={0.35} />
      <rect x={270} y={90} width={100} height={26} fill="var(--color-ink-3)" opacity={0.4} />
      <rect x={370} y={90} width={200} height={26} rx={0} fill="var(--color-accent)" opacity={0.75} />
      {txt(117, 140, "激进 <40", 11, "var(--color-ink-2)")}
      {txt(320, 140, "平衡", 11, "var(--color-ink-2)")}
      {txt(520, 140, "保守 60-100", 11, "var(--color-ink-2)")}
      {txt(320, 55, "输入:历史回撤 × 常规仓位 × 策略风格", 12, "var(--color-ink-2)")}
      {txt(320, 185, "风险分是匹配参数,不是评分:高 ≠ 好,低 ≠ 差", 11)}
    </Frame>
  ),
  // 动量趋势
  "momentum-trend": () => (
    <Frame label="动量:赚趋势的钱,还趋势的债">
      <path d="M 60 170 L 110 150 L 150 160 L 210 120 L 250 130 L 320 75 L 360 88 L 420 50 L 470 95 L 520 130 L 570 160" {...S} stroke="var(--color-accent)" strokeWidth={2.5} />
      <circle cx={420} cy={50} r={5} fill="var(--color-danger)" />
      {txt(430, 38, "拐点:回吐利润+深回撤", 11, "var(--color-danger)")}
      {txt(200, 60, "趋势段:连续吃肉", 11, "var(--color-ink-2)")}
      {txt(320, 195, "震荡段(150→250)反复挨耳光 —— 动量的绞肉机", 11)}
    </Frame>
  ),
  // 价值缺口
  "value-gap": () => (
    <Frame label="价值:价格向内在价值回归">
      <line x1={60} y1={70} x2={580} y2={70} stroke="var(--color-ink-2)" strokeDasharray="6 4" strokeWidth={1.5} />
      {txt(90, 60, "内在价值(估算)", 11, "var(--color-ink-2)")}
      <path d="M 60 100 C 140 175, 230 185, 320 150 S 480 85, 570 72" {...S} stroke="var(--color-accent)" strokeWidth={2.5} />
      {txt(150, 130, "市价", 11, "var(--color-accent)")}
      {txt(150, 170, "恐慌抛售砸出缺口 = 买入区", 11, "var(--color-ink-2)")}
      {txt(500, 100, "回归", 11)}
      {txt(320, 195, "风险:缺口可能是价值陷阱 —— 便宜有便宜的道理", 11)}
    </Frame>
  ),
  // 网格
  "grid-cells": () => (
    <Frame label="网格:跌一格买,涨一格卖">
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={60} y1={50 + i * 30} x2={580} y2={50 + i * 30} stroke="var(--color-line)" strokeDasharray="3 5" />
      ))}
      <path d="M 60 140 C 130 100, 180 160, 250 110 S 370 60, 430 130 S 520 90, 570 110" {...S} stroke="var(--color-accent)" strokeWidth={2.2} />
      {[[100, 120], [170, 150], [240, 100], [310, 90], [380, 120], [450, 90], [520, 80]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={4} fill={i % 2 === 0 ? "var(--color-danger)" : "var(--color-success)"} />
      ))}
      {txt(320, 195, "红点买入 · 绿点卖出 · 震荡市反复收租;单边行情是死穴", 11)}
    </Frame>
  ),
  // 量化管线
  "quant-pipeline": () => (
    <Frame label="量化:用统计代替灵感">
      {box(15, 75, 130, 60, "海量数据", "行情/财务/舆情")}
      {box(185, 75, 130, 60, "统计检验", "找显著规律", true)}
      {box(355, 75, 120, 60, "规则化", "可执行的信号")}
      {box(515, 75, 110, 60, "纪律执行", "零情绪")}
      {arrow(147, 105, 181, 105)}
      {arrow(317, 105, 351, 105)}
      {arrow(477, 105, 511, 105)}
      {txt(320, 185, "天敌:规律会失效 —— 市场会学习,拥挤交易把规律卷成无效", 11)}
    </Frame>
  ),
  // 指数篮子
  "index-basket": () => (
    <Frame label="指数:一篮子股票的平均成绩单">
      {box(30, 45, 120, 50, "贵州茅台")}
      {box(30, 115, 120, 50, "宁德时代")}
      {box(175, 45, 120, 50, "招商银行")}
      {box(175, 115, 120, 50, "…… 共 300 家")}
      <path d="M 340 105 C 380 105, 390 105, 430 105" {...S} stroke="var(--color-ink-3)" strokeWidth={2} />
      <polygon points="430,105 420,100 420,110" fill="var(--color-ink-3)" />
      {box(450, 70, 170, 70, "沪深 300 指数", "加权平均 · 一个数字", true)}
      {txt(320, 190, "涨 1% ≈ 大盘蓝筹整体涨 1%;它是所有主动策略的「不作为基准线」", 11)}
    </Frame>
  ),
  // 复利曲线
  "compound-curve": () => (
    <Frame label="复利 vs 单利:时间越长差距越大">
      <line x1={60} y1={180} x2={580} y2={180} stroke="var(--color-line)" />
      <path d="M 60 180 L 580 130" {...S} stroke="var(--color-ink-3)" strokeDasharray="6 4" />
      <path d="M 60 180 C 200 170, 400 130, 580 35" {...S} stroke="var(--color-accent)" strokeWidth={2.5} />
      {txt(500, 150, "单利", 11, "var(--color-ink-3)")}
      {txt(490, 55, "复利(利滚利)", 11, "var(--color-accent)")}
      {txt(320, 200, "年化 10%:10 年 2.6 倍 → 30 年 17.4 倍;前提:不归零", 11)}
    </Frame>
  ),
  // 分散
  "diversify-egg": () => (
    <Frame label="分散:波动互相抵消">
      {box(40, 70, 150, 70, "单押一个标的", "回撤 = 它的回撤", true)}
      {arrow(210, 105, 260, 105)}
      {box(280, 35, 130, 45, "A股 · 价值")}
      {box(280, 95, 130, 45, "美股 · 质量")}
      {box(280, 155, 130, 45, "加密 · 动量", undefined)}
      {arrow(430, 105, 480, 105)}
      {box(500, 70, 120, 70, "组合", "回撤 < 加权平均", true)}
      {txt(320, 200, "前提:相关性低 —— 10 只科技股同涨同跌,是假分散", 11)}
    </Frame>
  ),
  // 肥尾
  "fat-tail": () => (
    <Frame label="肥尾:极端事件比理论更频繁">
      <path d="M 80 180 C 180 180, 220 40, 320 40 S 460 180, 560 180" {...S} stroke="var(--color-ink-3)" strokeDasharray="6 4" />
      <path d="M 80 180 C 170 180, 240 70, 320 70 S 430 150, 470 178 L 500 181 L 560 176" {...S} stroke="var(--color-accent)" strokeWidth={2.5} />
      <circle cx={500} cy={181} r={4} fill="var(--color-danger)" />
      {txt(500, 165, "黑天鹅", 11, "var(--color-danger)")}
      {txt(320, 28, "正态假设(灰虚线):极端日几百年一遇", 11, "var(--color-ink-3)")}
      {txt(320, 198, "真实市场(绿线):肥尾 —— 极端行情远比理论频繁", 11)}
    </Frame>
  ),
  // 创建流程
  "create-flow": () => (
    <Frame label="创建交易员:四步下场">
      {box(20, 75, 130, 60, "1 选市场风格")}
      {box(180, 75, 130, 60, "2 调参数", "仓位/标的/频率", true)}
      {box(340, 75, 130, 60, "3 回测验证", "消耗配额")}
      {box(500, 75, 125, 60, "4 上榜赛季", "升降级", true)}
      {arrow(152, 105, 176, 105)}
      {arrow(312, 105, 336, 105)}
      {arrow(472, 105, 496, 105)}
      {txt(320, 190, "建议第一个交易员:稳健风格 · 仓位 50% · 学看报告而非冲榜", 11)}
    </Frame>
  ),
  // 跟单镜像
  "follow-mirror": () => (
    <Frame label="跟单:虚拟账户镜像持仓">
      {box(60, 70, 170, 70, "AI 交易员", "公开持仓 · 调仓", true)}
      {arrow(250, 105, 310, 105)}
      {txt(280, 88, "按市值", 10, "var(--color-ink-3)")}
      {txt(280, 122, "占比同步", 10, "var(--color-ink-3)")}
      {box(330, 70, 170, 70, "你的虚拟账户", "自动镜像", true)}
      {arrow(520, 105, 570, 105)}
      {txt(575, 100, "收益", 11, "var(--color-ink-2)", "start")}
      {txt(575, 118, "同步", 11, "var(--color-ink-2)", "start")}
      {txt(320, 190, "继承收益,也继承全部波动 —— 跟单前先看它的最大回撤", 11)}
    </Frame>
  ),
  // 匹配流程
  "match-flow": () => (
    <Frame label="风险匹配:先认识自己,再挑交易员">
      {box(20, 75, 140, 60, "4 道题", "经验/回撤/期限/目标")}
      {box(200, 75, 130, 60, "风险档位", "五档 0-100", true)}
      {box(370, 75, 120, 60, "匹配算法", "贴合+风格+级别")}
      {box(520, 75, 105, 60, "TOP 3", "附理由", true)}
      {arrow(162, 105, 196, 105)}
      {arrow(332, 105, 366, 105)}
      {arrow(492, 105, 516, 105)}
      {txt(320, 190, "期限题测的是「钱允许你多激进」,不是「你胆子多大」", 11)}
    </Frame>
  ),
};

export function Diagram({ id }: { id: string }) {
  const render = D[id];
  if (!render) return null;
  return <>{render()}</>;
}
