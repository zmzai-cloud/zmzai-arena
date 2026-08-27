# Arena 学堂(LEARN)设计文档

日期:2026-08-28 · 状态:已确认(方案 A+C 全上,内容深度百科)

## 目标

为 zmzai-arena 新增「学堂」能力:结构化金融知识 + Arena 玩法讲解,让零基础用户看懂榜单、看懂 Agent、敢跟单。补齐转化链路「看懂」的前置环节。

## 范围

1. **学堂页** `/learn`:5 章课程总览 + 学习进度 + 徽章墙 + 术语表
2. **篇章详情** `/learn/[slug]`:~20 篇深度百科文章,SSG 静态生成
3. **TermHint 情境化 tooltip**:榜单/详情页专业指标旁挂「?」,浅释 + 深入链接,与学堂共用术语数据源
4. **OnboardingTour 首访导览**:榜单页 4-5 步高亮浮层,可跳过可重放
5. **学习进度与徽章**:localStorage 记录,入门/进阶/毕业三枚徽章

## 内容规划(5 章)

| 章 | slug 前缀 | 主题 |
|---|---|---|
| 1 | intro- | 认识 Arena:平台是什么 / AI Agent 怎么交易 / 模拟验证与实盘 / 合规声明 |
| 2 | metrics- | 看懂榜单:净值与收益率 / 超额收益 / 最大回撤 / 夏普 / 验证级别 / 风险分 |
| 3 | style- | 策略风格图鉴:动量/价值/打板/网格/定投/质量/加密/中性 |
| 4 | basics- | 金融常识:T+1 / 指数 / 复利与定投 / 仓位与分散 / 黑天鹅 |
| 5 | play- | 玩转 Arena:创建 Agent / 跟单 / 信号 / 风险匹配 / Free vs Pro |

每篇结构:TL;DR → SVG 图解 → 正文 → Arena 真实 Agent 案例 → 延伸阅读 → 合规脚注。

## 技术决策

- 内容为结构化 TS 数据(`src/data/learn/`),正文用受控 JSX,不引 MDX 引擎
- 图解用内联 SVG,主题 token 色,零外部依赖
- 学习进度 localStorage(key `arena-learn-progress`),未登录可用,不云同步
- 不用 emoji 图标;涨红跌绿;不荐股,每篇带风险提示
- 术语表 `glossary.ts` 单一数据源:TermHint、学堂锚点、文章内链共用

## Commit 划分

1. 内容数据层 + 学堂页 SSG + Nav「学堂」tab
2. TermHint 情境化(Leaderboard / AgentDetail 挂点)
3. OnboardingTour + 徽章进度 + 学堂进度环

## 验证链

tsc → build → 官方 10 Agent 回归 IDENTICAL → SSR grep → 浏览器全流程(导览/tooltip/进度/徽章) → CI → 线上。

## 不做(二期)

小测验积分、云同步进度、视频、评论。
