// zmzai 投研竞技场 — 模拟数据（后续由 zmzai-sandbox 真实模拟盘替换）

export type Tier = "Live" | "Forward" | "Backtest" | "Paper";
export type ActionType = "BUY" | "SELL" | "HOLD" | "REJECT";

export interface Position {
  code: string;
  name: string;
  qty: string;
  price: string;
  mv: string;
}

export interface Decision {
  action: ActionType;
  time: string;
  text: string;
  meta: string;
}

export interface Agent {
  id: number;
  emoji: string;
  name: string;
  persona: string; // 人设分类：模型派 / 价投派 / 游资派 / 网格派 ...
  creator: string;
  market: string; // A股 / 港股 / 美股 / 加密
  style: string; // 价值 / 动量 / 网格 / 打板 ...
  tier: Tier;
  totalReturn: number; // %
  maxDD: number; // 最大回撤 %
  sharpe: number;
  riskScore: number; // 0-100
  days: number;
  followers: number;
  slogan: string;
  verified: boolean;
  prompt: string; // 公开策略逻辑
  guard: string; // 风控护栏说明
  positions: Position[];
  log: Decision[];
}

export const agents: Agent[] = [
  {
    id: 1,
    emoji: "🤖",
    name: "zmzai-GPT",
    persona: "模型派",
    creator: "zmzai 团队",
    market: "A股",
    style: "动量",
    tier: "Live",
    totalReturn: 6.2,
    maxDD: -3.1,
    sharpe: 2.41,
    riskScore: 82,
    days: 120,
    followers: 342,
    slogan: "追最强趋势，纪律执行，回撤优先",
    verified: true,
    prompt:
      "你是一个纪律严明的动量交易者。每日从沪深300中筛选3只相对强度最高、量价配合最好的标的。\n单只仓位不超过净值的8%，总持仓不超过5只，始终保留≥20%现金。\n任何回撤超过5%的持仓立即减仓。目标夏普>1.5，优先风险调整后收益。",
    guard: "风控规则：单笔 ≤ 10% NAV；强制 ≥20% 现金；回撤 >5% 自动减仓。",
    positions: [
      { code: "600519", name: "贵州茅台", qty: "20", price: "1,482", mv: "29,640" },
      { code: "300750", name: "宁德时代", qty: "40", price: "236", mv: "9,440" },
      { code: "000858", name: "五粮液", qty: "60", price: "138", mv: "8,280" },
    ],
    log: [
      { action: "BUY", time: "08-25 10:31", text: "买入 20 手贵州茅台，动量确认，量价齐升。", meta: "gpt-4o-mini · 540↑/82↓ tok · $0.0029" },
      { action: "HOLD", time: "08-25 09:45", text: "模型选择持有，趋势未破坏。", meta: "gpt-4o-mini · 556↑/28↓ tok · $0.0021" },
      { action: "REJECT", time: "08-24 14:02", text: "买入 000725 ×1200 被拒：金额超出单笔 10% NAV 上限。", meta: "风控引擎 · 自动拦截" },
      { action: "SELL", time: "08-24 11:10", text: "卖出 002594，回撤触及 5% 止损线。", meta: "gpt-4o-mini · 532↑/70↓ tok · $0.0026" },
    ],
  },
  {
    id: 2,
    emoji: "🧧",
    name: "价投老张",
    persona: "价投派",
    creator: "老李头",
    market: "A股",
    style: "价值",
    tier: "Forward",
    totalReturn: 3.8,
    maxDD: -8.4,
    sharpe: 1.92,
    riskScore: 68,
    days: 210,
    followers: 188,
    slogan: "只买看得懂的好公司，长期拿着不折腾",
    verified: true,
    prompt:
      "你是价值投资信徒。只在市盈率<20、ROE>15%、现金流为正的白马股中建仓。\n买入后至少持有12个月，不因短期波动卖出。每年再平衡一次，单只≤25%仓位。",
    guard: "风控规则：单只 ≤25% 仓位；禁止追高（PE>30 不买）；年度再平衡。",
    positions: [
      { code: "600036", name: "招商银行", qty: "300", price: "38", mv: "11,400" },
      { code: "000333", name: "美的集团", qty: "120", price: "72", mv: "8,640" },
    ],
    log: [
      { action: "HOLD", time: "08-25 08:00", text: "持有不动，好公司不需要天天看。", meta: "claude-3.5 · 410↑/20↓ tok" },
      { action: "BUY", time: "08-20 13:20", text: "建仓美的集团，估值进入合理区间。", meta: "claude-3.5 · 498↑/65↓ tok" },
      { action: "HOLD", time: "08-19 08:00", text: "市场震荡，忽略噪音。", meta: "claude-3.5 · 401↑/18↓ tok" },
    ],
  },
  {
    id: 3,
    emoji: "⚔️",
    name: "打板小王",
    persona: "游资派",
    creator: "板王",
    market: "A股",
    style: "打板",
    tier: "Paper",
    totalReturn: 12.5,
    maxDD: -22.6,
    sharpe: 1.35,
    riskScore: 31,
    days: 45,
    followers: 521,
    slogan: "只做涨停，快进快出，龙头战法",
    verified: false,
    prompt:
      "你是激进短线选手。只参与早盘放量封板的强势龙头，次日不连板即走。\n追求极致收益，容忍高回撤。单票可重仓至30%。",
    guard: "风控规则：单票 ≤30%；次日不连板强制离场。⚠ 高风险策略，风险分仅31。",
    positions: [
      { code: "002230", name: "科大讯飞", qty: "200", price: "52", mv: "10,400" },
      { code: "300059", name: "东方财富", qty: "500", price: "16", mv: "8,000" },
    ],
    log: [
      { action: "BUY", time: "08-25 09:35", text: "打板科大讯飞，AI 题材龙头封单强。", meta: "本地模型 · 380↑/40↓ tok" },
      { action: "SELL", time: "08-24 09:32", text: "东方财富未连板，止盈离场。", meta: "本地模型 · 372↑/38↓ tok" },
      { action: "REJECT", time: "08-23 14:50", text: "尾盘追高被拒：非早盘封板，不符合打板纪律。", meta: "风控引擎 · 自动拦截" },
    ],
  },
  {
    id: 4,
    emoji: "📊",
    name: "网格老李",
    persona: "网格派",
    creator: "量化哥",
    market: "A股",
    style: "网格",
    tier: "Paper",
    totalReturn: 2.1,
    maxDD: -1.8,
    sharpe: 2.05,
    riskScore: 88,
    days: 300,
    followers: 96,
    slogan: "高抛低吸，震荡市里的提款机",
    verified: true,
    prompt:
      "你是网格交易机器人。对宽基ETF设定±2%网格区间，自动低买高卖。\n永不空仓也永不重仓，单标的≤40%仓位，震荡市稳定收割。",
    guard: "风控规则：单标的 ≤40%；网格区间±2%硬约束；低波动优先。",
    positions: [
      { code: "510300", name: "沪深300ETF", qty: "5000", price: "3.9", mv: "19,500" },
      { code: "510500", name: "中证500ETF", qty: "3000", price: "5.8", mv: "17,400" },
    ],
    log: [
      { action: "BUY", time: "08-25 10:05", text: "网格触发：沪深300ETF 跌2% 自动买入。", meta: "规则引擎 · 0 tok" },
      { action: "SELL", time: "08-25 13:40", text: "网格触发：中证500ETF 涨2% 自动卖出。", meta: "规则引擎 · 0 tok" },
      { action: "HOLD", time: "08-25 09:00", text: "价格在区间内，等待触发。", meta: "规则引擎 · 0 tok" },
    ],
  },
  {
    id: 5,
    emoji: "🏛️",
    name: "关羽·价值",
    persona: "历史人物",
    creator: "三国策",
    market: "A股",
    style: "质量",
    tier: "Backtest",
    totalReturn: 5.4,
    maxDD: -6.2,
    sharpe: 1.78,
    riskScore: 74,
    days: 0,
    followers: 233,
    slogan: "忠义千秋：只守最信得过的好公司",
    verified: true,
    prompt:
      "你化身关羽，忠义千秋。只守最信得过、护城河深的好公司，不为小利所动。\n高ROIC、低负债、长期持有，绝不追涨杀跌。",
    guard: "风控规则：只买护城河标的；负债率>50% 一票否决；长期持有。",
    positions: [{ code: "600900", name: "长江电力", qty: "400", price: "28", mv: "11,200" }],
    log: [
      { action: "HOLD", time: "回测 2024-06", text: "坚守长江电力，稳健现金流如关将军之忠义。", meta: "回测引擎" },
      { action: "BUY", time: "回测 2024-01", text: "建仓长江电力，防御属性强。", meta: "回测引擎" },
    ],
  },
  {
    id: 6,
    emoji: "🎭",
    name: "孙悟空·动量",
    persona: "虚构角色",
    creator: "大圣",
    market: "加密",
    style: "动量",
    tier: "Paper",
    totalReturn: 18.3,
    maxDD: -31.0,
    sharpe: 1.12,
    riskScore: 22,
    days: 60,
    followers: 410,
    slogan: "七十二变，火眼金睛：追强势，识妖股",
    verified: false,
    prompt:
      "你乃齐天大圣，火眼金睛识强势。专追BTC/ETH强势突破，七十二变随时切换。\n容忍大回撤，追求倍数收益，妖股现形即撤。",
    guard: "风控规则：加密高波动，单币≤25%；破位即走。⚠ 风险分仅22，极高风险。",
    positions: [
      { code: "BTC", name: "Bitcoin", qty: "0.15", price: "62,000", mv: "9,300" },
      { code: "ETH", name: "Ethereum", qty: "3", price: "3,400", mv: "10,200" },
    ],
    log: [
      { action: "BUY", time: "08-25 02:00", text: "BTC 突破前高，火眼金睛识趋势。", meta: "本地模型 · 360↑/30↓ tok" },
      { action: "HOLD", time: "08-24 22:00", text: "持币观望，等待变盘。", meta: "本地模型 · 350↑/28↓ tok" },
      { action: "REJECT", time: "08-23 18:00", text: "追妖币被拒：非主流币，超出授权范围。", meta: "风控引擎 · 自动拦截" },
    ],
  },
  {
    id: 7,
    emoji: "📊",
    name: "ETF定投妹",
    persona: "定投派",
    creator: "小确幸",
    market: "A股",
    style: "定投",
    tier: "Forward",
    totalReturn: 4.9,
    maxDD: -5.1,
    sharpe: 2.12,
    riskScore: 79,
    days: 260,
    followers: 154,
    slogan: "每周定投宽基，时间陪你慢慢变富",
    verified: true,
    prompt:
      "你是定投教练。每周固定日期买入沪深300+中证红利ETF，雷打不动。\n不择时、不恐慌，靠纪律和复利取胜。单只≤50%。",
    guard: "风控规则：固定周期定投；单只≤50%；禁止择时操作。",
    positions: [
      { code: "510300", name: "沪深300ETF", qty: "8000", price: "3.9", mv: "31,200" },
      { code: "515080", name: "中证红利", qty: "4000", price: "1.4", mv: "5,600" },
    ],
    log: [
      { action: "BUY", time: "08-25 09:30", text: "本周定投日，买入沪深300ETF 2000份。", meta: "规则引擎 · 0 tok" },
      { action: "HOLD", time: "08-18 09:30", text: "上周已定投，持有。", meta: "规则引擎 · 0 tok" },
    ],
  },
  {
    id: 8,
    emoji: "🤖",
    name: "巴菲特AI",
    persona: "模型派",
    creator: "价值基",
    market: "美股",
    style: "价值",
    tier: "Backtest",
    totalReturn: 7.1,
    maxDD: -9.3,
    sharpe: 1.65,
    riskScore: 70,
    days: 0,
    followers: 289,
    slogan: "长期主义，买生意不买代码",
    verified: true,
    prompt:
      "你继承巴菲特投资哲学。只在具有持久护城河、自由现金流充沛的公司建仓。\n以所有者心态长期持有，忽略季度噪音。",
    guard: "风控规则：护城河+自由现金流双门槛；长期持有不择时。",
    positions: [
      { code: "AAPL", name: "Apple", qty: "50", price: "228", mv: "11,400" },
      { code: "KO", name: "Coca-Cola", qty: "100", price: "62", mv: "6,200" },
    ],
    log: [
      { action: "BUY", time: "回测 2023-03", text: "建仓可口可乐，品牌即护城河。", meta: "回测引擎" },
      { action: "HOLD", time: "回测 2024-12", text: "持有苹果，生态壁垒稳固。", meta: "回测引擎" },
    ],
  },
  {
    id: 9,
    emoji: "🏛️",
    name: "曹操·机会",
    persona: "历史人物",
    creator: "三国策",
    market: "A股",
    style: "机会",
    tier: "Paper",
    totalReturn: 9.2,
    maxDD: -14.7,
    sharpe: 1.48,
    riskScore: 45,
    days: 80,
    followers: 201,
    slogan: "果断进攻趋势，不念旧仓",
    verified: false,
    prompt:
      "你乃魏武曹操，果断进取。捕捉行业轮动与拐点机会，重拳出击。\n趋势逆转立即清仓，绝不念旧，宁可错不可拖。",
    guard: "风控规则：趋势逆转清仓；单板块≤35%。⚠ 中等风险，回撤偏大。",
    positions: [
      { code: "601012", name: "隆基绿能", qty: "300", price: "18", mv: "5,400" },
      { code: "300750", name: "宁德时代", qty: "80", price: "236", mv: "18,880" },
    ],
    log: [
      { action: "BUY", time: "08-25 10:15", text: "新能源超跌反弹，曹公果断加仓。", meta: "本地模型 · 420↑/45↓ tok" },
      { action: "SELL", time: "08-22 14:30", text: "趋势走弱，清仓不念旧。", meta: "本地模型 · 410↑/42↓ tok" },
    ],
  },
  {
    id: 10,
    emoji: "🧮",
    name: "量化中性",
    persona: "量化派",
    creator: "宽客",
    market: "A股",
    style: "市场中性",
    tier: "Live",
    totalReturn: 3.3,
    maxDD: -2.2,
    sharpe: 2.33,
    riskScore: 85,
    days: 150,
    followers: 117,
    slogan: "多空对冲，与市场涨跌无关的稳定",
    verified: true,
    prompt:
      "你是市场中性策略。多头一篮子低估值，空头一篮子高估值，对冲Beta。\n目标绝对收益，与大盘涨跌脱钩，严格控制回撤。",
    guard: "风控规则：Beta 中性约束；回撤>-3% 触发减仓；杠杆≤1.5x。",
    positions: [
      { code: "多头", name: "一篮子低估值", qty: "—", price: "—", mv: "42,000" },
      { code: "空头", name: "一篮子高估值", qty: "—", price: "—", mv: "-30,000" },
    ],
    log: [
      { action: "HOLD", time: "08-25 15:00", text: "日内对冲平衡，净值平稳。", meta: "规则引擎 · 0 tok" },
      { action: "REJECT", time: "08-24 10:00", text: "加杠杆被拒：超过 1.5x 上限。", meta: "风控引擎 · 自动拦截" },
    ],
  },
];

export function getAgent(id: number): Agent | undefined {
  return agents.find((a) => a.id === id);
}

export function rankBySharpe(): Agent[] {
  return [...agents].sort((a, b) => b.sharpe - a.sharpe);
}
