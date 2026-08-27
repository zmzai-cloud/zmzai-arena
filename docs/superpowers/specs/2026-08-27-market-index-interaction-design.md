# 大盘交互能力包 — 设计文档

日期:2026-08-27 · 状态:已获用户批准 · 项目:zmzai-arena

## 1. 背景与目标

arena 已接入 A 股真实日K(成交额榜前 300 动态标的池),但全站**没有大盘指数维度**:用户无法感知
当前市场状态(牛/熊/震荡)、Agent 表现无真实基准对比、策略无法「交易大盘」或感知大盘风险。

本能力包四个方向(用户全选):
1. **指数行情面板** — 首页/竞技场顶部指数行情条 + 交互走势图
2. **Agent 超额对比** — 相对沪深300 的 alpha、跑赢/跑输标识、对比曲线
3. **指数可交易** — 上证指数等作为可选标的加入创建策略
4. **大盘择时信号** — 引擎注入大盘趋势状态 + 「大盘熔断」风控护栏(用户选:信号+熔断护栏)

## 2. 数据层 — fetch-market.mjs 扩展

- 新增 5 个指数(新浪 `CN_MarketDataService.getKLineData`,已验证可用,与个股同接口):
  `sh000001 上证指数 / sz399001 深证成指 / sz399006 创业板指 / sh000300 沪深300 / sh000905 中证500`
- 指数代码带 `sh/sz` 前缀(与 6 位纯数字个股天然区分,`000001` 与平安银行不冲突)
- 与个股同一批拉取(共享 `SLEEP_MS` 节流),盘中保护同个股(未收盘 bar 丢弃)
- 指数失败不阻断个股主流程(个股成功 ≥ MIN_OK 才写盘;指数成功 ≥ 3 个才写入 REAL_INDEXES)
- 输出到 `src/data/market-real.ts` 新增导出:
  ```ts
  export const REAL_INDEXES: Record<string, Array<[string, number, number, number, number, number]>>; // code -> rows
  export const REAL_INDEX_NAMES: Record<string, string>; // code -> 名称
  ```
- 每个交易日 17:10 与个股一起自动刷新

## 3. 引擎层

### 3.1 指数可交易(market.ts)
- `BASE_INSTRUMENTS` 追加 5 条指数标的:`market: "A股指数"`,start = 最新真实点位(缺省兜底值),
  drift/vol 默认(指数低波动:drift 0.07 / vol 0.18)
- `MarketKind` 增加 `"A股指数"`;`boardOf` 增加规则 `["大盘指数", /^(sh|sz)\d{6}/]`(置于最前)
- 涨跌停判定仅对 `"A股"` 生效(指数无涨跌停,`marketKindOf` 返回 A股指数 时 limitStatus 不拦截)
- 撮合成本:FEE/SLIP 走默认(A股 0.00025 / 0.001)——指数作为模拟标的,成本口径与个股一致
- 注意:指数 bar 无 qfq 概念,直接使用接口返回点位

### 3.2 大盘状态注入(新模块 src/sim/index-market.ts)
- 以**沪深300(sh000300)**为基准指数(全站统一,README/UI 注明)
- `indexTrend(indexBars, day): { phase: "牛"|"熊"|"震荡", ma20, ma60, ddFrom20: 收盘距20日线%, ddFrom60, high20: 距20日高点% }`
  - 牛:`close > ma20 > ma60`;熊:`close < ma20 < ma60`;其余震荡
- 引擎 `runSimulation` 新增可选入参 `indexMarket?: Record<string, RealRow[]>`(兼容旧调用,不传则无大盘维度)
- 每日(自 day ≥ 20 起)在决策日志输出 `MARKET` 事件:
  `{day, action: "HOLD", reason: "大盘: 沪深300 熊市 · 低于20日线 4.2% · 距20日高点 -8.1%", source: "大盘"}`
  节流:每 5 天一条(避免日志膨胀)

### 3.3 大盘熔断护栏(strategies.ts + engine.ts)
- `StrategyConfig` 增加 `circuitBreaker?: { enabled: boolean; ma20: number; cap20: number; ma60: number; cap60: number }`
  默认(创建策略默认开启):`{ enabled: true, ma20: -0.03, cap20: 0.3, ma60: 0, cap60: 0.1 }`
  语义:沪深300 收盘低于 20 日均线 -3% → 总仓位强制 ≤ 30%;跌破 60 日均线 → 总仓位 ≤ 10%
- 引擎每日护栏步骤(在回撤止损之后、风格信号之前)执行:
  - 计算基准指数 `close / ma20 - 1` 与 `close / ma60 - 1`
  - 超限时计算当前总市值,若超过 cap,按持仓市值比例**等比例减仓**到 cap(卖出走撮合:滑点+手续费+跌停约束)
  - 触发时输出 `GUARD 大盘熔断` 事件:如「大盘熔断: 沪深300 低于20日线 5.1%,总仓位强制降至 30% (实际 62% → 30%)」
  - 熔断状态持续直到 `close ≥ ma20`(解除时输出恢复事件)
- **存量 10 个 Agent 的 cfg 不含 circuitBreaker → 行为/存证不变**;新创建策略(createUserAgent)默认携带熔断参数
- 风控文案(agents.ts guard 字符串)追加「大盘熔断:沪深300 跌破20日线 -3% 强制降仓至 30%」仅对新策略

### 3.4 超额收益指标(attribution.ts / 新函数)
- 新增独立指标(不改动现有归因的自身池基准,避免历史展示漂移):
  `excessReturn = res.metrics.totalReturn - indexTotalReturn`(indexTotalReturn 为基准指数同窗口涨跌幅)
- 导出 `computeExcess(res, indexBars)` 供 UI 使用:返回 `{ indexReturn, excess, beat: boolean }`

## 4. UI 层

### 4.1 指数行情面板(新组件 src/components/IndexTicker.tsx)
- 位置:首页 Hero 下方(landing)+ 竞技场页顶部
- 展示:5 指数 名称/点位/当日涨跌%(红涨绿跌,沿用 up/down 语义),每项可点击
- 点击展开走势图(原生 SVG 自绘,复用 Battle.tsx 模式,无新依赖):
  - 周期切换:1月 / 3月 / 1年
  - 悬浮显示:日期 + 点位(基础 hover 交互)
- 数据源:REAL_INDEXES 快照 + REAL_MARKET_META(lastTradeDate 标注「截至」)
- 无独立接口请求(纯静态数据,SSR 直出,与全站架构一致)

### 4.2 Agent 超额对比
- **竞技场列表(Leaderboard.tsx)**:每行收益列下方加小字 `vs 沪深300 +12.4%`(绿色)/ `-3.1%`(红色)
- **Agent 详情(AgentDetailClient.tsx)**:
  - KPI 区新增「超额收益」卡(vs 沪深300)
  - 收益曲线区新增「收益 vs 沪深300」叠加曲线(双线,复用现有曲线画法,图例标注 Agent / 沪深300)
- 美股/加密 Agent 同样展示(注明「基准:沪深300」)

### 4.3 创建表单(CreateForm.tsx)
- 标的池新增「大盘指数」分组(5 指数,boardOf 自动归类)
- 风控栏新增「大盘熔断」开关(默认开),文案「沪深300 跌破20日线 -3% 强制降仓至 30%」

## 5. 兼容性与错误处理

- 存量 Agent:cfg 无 circuitBreaker → 引擎行为、决策日志、存证指纹完全不变(回归验证:10 Agent 回测结果与改动前逐项一致)
- 指数拉取失败:REAL_INDEXES 缺失时引擎自动降级(无大盘维度),指数标的仍可用 GBM 兜底行情,全站不报错
- 新策略引擎调用:createUserAgent 传入 indexMarket;存量 getAgent 路径不传(引擎内部判空)
- 归因(attribution)自身池基准保留,超额收益为新增独立展示

## 6. 验证方案

1. **数据**:REAL_INDEXES 与新浪接口逐日对照(上证 8/26 收盘 ≈ 3900 区间,点位一致)
2. **引擎**:构造极端回撤行情(指数连续大跌)验证熔断强制降仓事件;10 存量 Agent 回测结果与改动前 diff 一致
3. **UI**:SSR 包含指数条/分组/徽章;headless Chrome 截图;走势图交互(周期切换 hover)
4. **CI/线上**:deploy 全绿;线上 SSR + 截图确认;次日 17:10 自动刷新验证
5. **canvas 报告**更新存档

## 7. 实施步骤(3 commits)

1. **commit 1 数据层**:fetch-market.mjs 指数拉取 + market-real.ts 重新生成 + tsc/build 验证
2. **commit 2 引擎层**:index-market.ts + 熔断护栏 + 指数标的 + 超额指标 + 存量回归验证
3. **commit 3 UI 层**:IndexTicker + Leaderboard 徽章 + AgentDetail 对比 + CreateForm 指数分组/熔断开关
4. push + CI + 线上验证 + canvas 报告
