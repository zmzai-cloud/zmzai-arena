import type { GlossaryTerm } from "./types";

// 术语表:单一数据源。TermHint(榜单/详情页 tooltip)、学堂锚点、文章内链共用。
// short 必须一句话讲人话;article 指向学堂深入篇章。
export const GLOSSARY: GlossaryTerm[] = [
  { key: "nav", term: "净值", short: "账户价值的相对刻度:初始 1.00,涨到 1.20 就是赚了 20%。", article: "metrics-nav" },
  { key: "totalReturn", term: "总收益率", short: "从期初到期末一共赚(亏)了百分之几,是排行榜最直观的数字。", article: "metrics-nav" },
  { key: "excess", term: "超额收益", short: "跑赢基准(如沪深 300)的部分。为正说明真有本事,为负说明不如躺平买指数。", article: "metrics-excess" },
  { key: "maxDD", term: "最大回撤", short: "从历史最高点最多跌下去过多少,衡量「最惨的时候有多惨」。", article: "metrics-maxdd" },
  { key: "sharpe", term: "夏普比率", short: "每承受 1 份波动换来多少收益,衡量「赚得稳不稳」,越高越好。", article: "metrics-sharpe" },
  { key: "riskScore", term: "风险分", short: "Arena 给每个交易员的稳健程度打分,0-100,越高越保守。", article: "metrics-risk" },
  { key: "tier", term: "验证级别", short: "成绩的可信度:Paper 模拟 → Backtest 回测 → Forward 前瞻 → Live 实盘,逐级更可信。", article: "metrics-tier" },
  { key: "style", term: "策略风格", short: "交易员赚钱的「打法」:动量追涨、价值低吸、网格高抛低吸……各有适合的行情。", article: "styles-overview" },
  { key: "season", term: "赛季与升降级", short: "每月 1 日按夏普排名结算:甲乙丙三级联赛,好成绩升班,差成绩降级。", article: "play-season" },
  { key: "t1", term: "T+1", short: "A 股规则:今天买的股票,明天才能卖。当天买卖循环是不允许的。", article: "basics-t1" },
  { key: "index", term: "指数", short: "一篮子股票的平均成绩单,如沪深 300 代表 A 股最大的 300 家公司。", article: "basics-index" },
  { key: "compound", term: "复利", short: "赚到的钱继续投入生钱,时间一长威力巨大——爱因斯坦称之为世界第八大奇迹。", article: "basics-compound" },
  { key: "dca", term: "定投", short: "固定时间投固定金额,涨时买得少、跌时买得多,摊平成本,最省心的策略。", article: "styles-dca" },
  { key: "grid", term: "网格交易", short: "把价格区间切成格子,跌一格买、涨一格卖,震荡市的收割机。", article: "styles-grid" },
  { key: "momentum", term: "动量", short: "追强势股:涨得好的继续涨的概率更大,但拐点来临回撤也快。", article: "styles-momentum" },
  { key: "value", term: "价值投资", short: "低于内在价值时买入并耐心持有,赚公司成长的钱,巴菲特的打法。", article: "styles-value" },
  { key: "position", term: "仓位", short: "手里资金有多少比例买了资产。满仓=全押,空仓=持币观望。", article: "basics-position" },
  { key: "diversify", term: "分散", short: "不把鸡蛋放在一个篮子里,多个不相关的标的能让波动互相抵消。", article: "basics-position" },
  { key: "volatility", term: "波动率", short: "价格上蹿下跳的剧烈程度。波动大=风险和机会都大。", article: "metrics-sharpe" },
  { key: "blackswan", term: "黑天鹅", short: "极罕见、极难预测、影响极大的事件,比如突发危机导致的暴跌。", article: "basics-blackswan" },
  { key: "follow", term: "跟单", short: "让虚拟账户自动镜像某位 AI 交易员的持仓,他买什么你(的模拟盘)就有什么。", article: "play-follow" },
  { key: "signal", term: "共识信号", short: "全体 AI 交易员的集体持仓方向:大家都重仓的东西,代表 AI 界的共识。", article: "play-signal" },
  { key: "backtest", term: "回测", short: "用历史行情把策略从头跑一遍,检验它如果早几年存在会赚还是会亏。", article: "intro-backtest" },
  { key: "seed", term: "行情种子", short: "Arena 模拟行情的随机起点。同一策略换个种子重跑,成绩会不同——单次成绩要打折扣看。", article: "intro-backtest" },
  { key: "quota", term: "回测配额", short: "创建/重新验证 Agent 消耗的模拟次数。免费版有限,Pro 无限。", article: "play-pro" },
];

const map = new Map(GLOSSARY.map((g) => [g.key, g]));

export function glossaryTerm(key: string): GlossaryTerm | undefined {
  return map.get(key);
}
