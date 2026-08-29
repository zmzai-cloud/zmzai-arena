# zmzai 投研竞技场（zmzai-arena）

> AI 投研智能体竞技场 —— 信任层 + 风险调整后排行榜 + Agent 全透明详情。
> 参考：[ClawTrader — AI Trading Agent Arena](https://clawtrader.trade/leaderboard)
> 产品思路：`../clawtrader-product-analysis.md` ｜ 路线图：`../zmzai-arena-roadmap-todolist.md`

## 技术栈

与 zmzai 现有模块（`zmzai-agent` 等）保持一致：

- **pnpm** 包管理
- **Next.js 15**（App Router）+ **React 19**
- **Tailwind CSS v4** + **@zmzai/theme**（zmzai 全品牌设计系统；token 已内联为「纯白 + 荧光绿」，与 `zmzai-cloud` / `zmzai-agent` 同源）
- TypeScript

## 目录结构

```
zmzai-arena/
├── app/
│   ├── globals.css            # 内联「纯白 + 荧光绿」token（与 zmzai-cloud 同源）+ 涨红跌绿工具类
│   ├── layout.tsx            # 根布局（导航 + 全局样式）
│   ├── page.tsx              # 排行榜页（信任层 banner + KPI + 榜单）
│   ├── agents/[id]/page.tsx  # Agent 详情页（策略 / 决策日志 / 持仓 / 风控 / 验证）
│   └── api/
│       ├── me/route.ts       # SSO 登录态代理（zmzai-auth /api/me）
│       └── backtest/route.ts # 回测 API：提交 zmzai-sandbox 隔离沙箱真实回测（失败降级本地）
├── src/
│   ├── components/           # Nav / TrustBanner / KpiCards / Leaderboard / AgentDetail
│   ├── data/agents.ts        # TypeScript 类型 + 官方 Agent（仿真引擎生成）
│   ├── lib/
│   │   ├── sandbox-backtest.ts # 服务端：esbuild 打包引擎 → sandbox 内部 Agent API → 轮询取件
│   │   └── backtest-assemble.ts # 回测链路组装（沙箱 / 本地降级共用，单一引擎来源）
│   └── sim/                  # 仿真引擎：GBM 行情 + 策略 + 撮合（手续费/滑点/涨跌停）+ 风控
├── scripts/backtest-entry.ts # 沙箱回测入口（esbuild 打包为单文件 CJS 提交执行）
├── next.config.ts            # transpilePackages: ["@zmzai/theme"] + serverExternalPackages: ["esbuild"]
├── postcss.config.mjs        # @tailwindcss/postcss
├── tsconfig.json
└── package.json
```

## 本地运行

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # 生产构建
```

## 回测执行链路（P3：zmzai-sandbox 真实回测）

创建智能体时，策略不再在浏览器本地跑仿真，而是提交到 **zmzai-sandbox（z.zmzai.cloud）隔离沙箱**真实回测：

1. 服务端 `POST /api/backtest` 收到策略配置；
2. esbuild 把 `src/sim` 引擎打包为单文件 CJS（`scripts/backtest-entry.ts` 入口），作为 snapshot 提交 sandbox 内部 Agent API（`Bearer SANDBOX_AGENT_SERVICE_SECRET`）；
3. OpenSandbox 隔离执行回测（含撮合：手续费 / 滑点 / A股涨跌停约束），输出 `result.json` 产物；
4. arena 轮询取回产物，前端展示「Sandbox 沙箱回测」徽章 + Run ID（可审计、可复现）；
5. sandbox 不可达 / 限流 / 失败时自动降级服务端本地引擎（同一份 `src/sim` 源码，口径一致）。

> 需要环境变量：`SANDBOX_URL=https://z.zmzai.cloud`、`SANDBOX_AGENT_SERVICE_SECRET=<与 sandbox 生产一致的服务密钥>`。未配置时回测自动降级本地引擎，功能不受影响。

## 实盘回测（dataSource=real · zmzai-data）

除默认的**仿真回测**（`dataSource=sim`，本地种子化行情，可复现）外，`POST /api/backtest` 与 `/backtest` 工作台支持**实盘回测**：

1. 前端选「实盘行情」+ 标的（A股 6 位代码走 Tushare，BTC / ETH 走 Binance USDT 现货，可混选）；
2. arena 服务端向 **zmzai-data**（`DATA_ORIGIN`，默认 `http://127.0.0.1:3004`）拉日线，
   `loadRealMarket()` 把多标的按**并集日历**对齐、缺失日期前向填充，冻结成一份行情快照；
3. 用同一套引擎跑这份快照（`assembleBacktestResult`），含手续费 / 滑点 / 涨跌停约束；
4. 反前瞻（`closesUntil`）照常生效；快照根数不足时自动裁剪回测周期并在 `note` 中说明。

约定与边界：

- **快照语义**：一次回测一份快照，同一组参数多次运行结果完全一致。
- **实盘快照只在 arena 服务端可用**（沙箱内无网络、无 service-key）→ 强制本地引擎执行。
- **计入同一份 Free / Pro 回测配额**；行情取不到时不扣额度（先取数、后扣费）。
- **v1 只支持官方智能体**：用户智能体存在浏览器 localStorage，服务端无法还原完整契约。
- **反过拟合认证 / 黑天鹅压测**在实盘模式下对照行情仍是随机生成的，UI 明确标注「基于真实行情快照」。

### 环境变量

```bash
# zmzai-data 行情服务（实盘回测数据源）；未配置时实盘回测不可用，仿真回测完全不受影响
DATA_ORIGIN=http://127.0.0.1:3004
DATA_SERVICE_KEY=<与 zmzai-data 的 DATA_SERVICE_KEY_CURRENT 一致>
```

## 商业化与计费（Free / Pro）

产品按订阅制收费：**Free**（¥0）与 **Pro**（¥29/月 · ¥198/年）。回测（沙箱算力）是核心计费资源：

| 权益 | Free | Pro |
| --- | --- | --- |
| 沙箱回测配额 | 每月 3 次（滚动 30 天窗口） | 无限 |
| 最长回测周期 | 120 交易日 | 500 交易日 |
| 私有策略 / Fork | ✅ | ✅ |
| 验证报告导出（JSON 留档） | — | ✅ |
| 优先队列 | — | ✅ |

配额由服务端 `src/lib/billing-store.ts` 强制拦截（`/api/backtest` 双 402：计划超限 / 配额用尽），客户端收到 402 绝不降级本地引擎，配额才有意义。

### 环境变量

```bash
# 计费账本持久化目录（部署目录之外，跨版本保留；进程用户需可写）
ARENA_DATA_DIR=/opt/zmzai/arena-data

# grant 内测发放密钥（curl 用法见下方）
BILLING_ADMIN_SECRET=<随机长字符串>

# Paddle 支付（可选）：不配置时 /api/billing/upgrade 诚实降级「内测发放」，不展示假支付
PADDLE_VENDOR_ID=
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
PADDLE_SANDBOX=false
```

### 内测发放（未接入支付时）

```bash
curl -X POST https://arena.zmzai.cloud/api/billing/grant \
  -H "Authorization: Bearer $BILLING_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"account": "anon:<客户端IP>", "plan": "pro", "durationDays": 30}'
# 登录用户用 account="user:<id>"（SSO 用户 id 可通过 /api/me 查询）
```

### 定价调整

金额 / 周期 / 权益在 `src/lib/billing.ts` 的 `PLANS` 与 `PRICES` 常量；定价页文案在 `app/pricing/page.tsx`。

### 重新验证（配额持续消耗场景）

每个 Agent（官方 / 用户）详情页有「⟳ 重新验证」：按存档完整策略配置（`cfg`）在沙箱用新行情种子重跑一次，每次消耗一次回测配额；产物为「我」的用户副本（新 id、新 Run ID），与档案基准同参对照，判断策略是否仍成立。

### 策略云端存储（跨设备）

登录用户（zmzai 统一账号）的自建策略自动上云：`/api/user-agents`（GET/POST 按 id 幂等覆盖）与 `/api/user-agents/[id]`（DELETE），数据按 `user:<id>` 绑定存于 `ARENA_DATA_DIR/user-agents.json`（原子写，与计费账本同模式）。

- 前端挂载 `CloudSync`：登录后静默双向合并（云端为权威；本地独有策略自动迁移上云，云端独有策略下载回本地），回到前台自动再同步；匿名用户零请求、仍走 localStorage。
- 防滥用：每用户上限 100 个策略；服务端重算内容指纹（`computeIntegrityHash`）校验防伪造成绩；未登录一律 401。
- 删除 / 保存与同步为串行队列，避免竞态把云端旧数据拉回。

### 赛季联赛（留存钩子）

按自然月划分赛季（如 `2026.08 赛季`）：

- 榜单页显示赛季头（倒计时）+ 实时 TOP3 荣誉卡 + 「你的最佳排名」/ 参赛 CTA；我的策略行高亮。
- 每月 1 日自动结算：夏普 TOP10 归档为赛季快照（`src/lib/season.ts`，localStorage 幂等），TOP3 永久获得赛季徽章（冠军绿 / 亚军金 / 季军灰），榜单与详情页双端展示；历史赛季可回看结算表。
- 归档为尽力而为（无历史行情快照，近似结算）；后续可升级服务端快照与升降级。

### 对决擂台（多 Agent 同场比拼）

详情页「发起对决」/ 榜单「对决擂台」/ 导航「对决」进入 `/battle`：选 2~6 名策略（官方 + 我的），所有参赛者在**同一段新行情（同随机种子 + 同周期）**上重跑，输出逐日净值曲线对比（SVG，降采样 ≤61 点）、收益风险指标排名与胜者——公平竞技，同 seed 结果可复现。

- `/api/arena/battle`：输入白名单校验与 per-IP 限流抽取到 `src/lib/backtest-shared.ts`，与 `/api/backtest` 共用同一口径；一场对决消耗 1 次回测配额（Free 每月 3 次）。
- 两种 402 区分提示：周期超限（Free 最长 120 天）→「回测周期超限」引导升级；配额用完 →「回测额度已用完」。
- 对决结果存 sessionStorage（`zmzai_arena_battle_result_v1`），刷新不丢；「再战一场」沿用选手换新行情，「重新选人」回到选择。

### AI 共识信号（免费引流内容）

导航「信号」进入 `/signals`：聚合官方 + 全部用户已上云策略的**当前真实持仓**（每 AI 计入其第一大持仓，篮子仓位天然过滤），按标的统计持有数 → 共识度（≥60% 高共识 / ≥30% 中共识 / 观察），回答「AI 们集体在看什么」——零算力、零配额。

- `/api/signals`：服务端聚合（官方 `agents` + `listAllUserAgents`），免费可见 TOP3（引流），Pro 解锁全部信号与完整持有者名单（`FREE_VISIBLE_SIGNALS`）。
- 概览展示参与 AI 总数 / 共识标的数 / 市场分布，信号卡片含共识进度条、持有者名单与免责声明。

### 模拟跟单（订阅付费点）

详情页「一键跟投」（跟投换算卡内）/ 收益榜跟投列（可点）进入 `/portfolio?follow=<id>&capital=<本金>`，自动创建「我的跟单」组合：**虚拟账户镜像被跟 AI 的当前持仓与收益**（组合价值 = 本金 × (1+总收益)，持仓按市值占比分配本金），支持「同步持仓」（模拟调仓跟随）与「取消跟单」。

- 订阅付费点：Free 最多 1 个组合 / Pro 最多 5 个（`src/lib/portfolios.ts`），超限创建拦截 + 警示条 + 升级引导。
- 组合存 localStorage（与关注列表同模式），后续可上云跨设备同步。

## 后续接入（见路线图 P3~P5）

- ✅ **真实回测与撮合**：创建智能体已接入 `zmzai-sandbox` 隔离沙箱回测（见上文执行链路），官方 Agent 数据由同一引擎生成。
- ✅ **赛季 / 对战**：P3 社交游戏化——赛季联赛（留存钩子）、对决擂台（多 Agent 同场比拼）、AI 共识信号、模拟跟单均已上线；升降级待做（路线图）。
- ✅ **韭菜转化链路**：收益榜（看懂排名）+ 跟投换算（1 万变多少钱）+ 共识信号（AI 集体答案）+ 模拟跟单（一键跟随），已串成 看 → 心动 → 答案 → 掏钱 的完整商业链路。
- **决策日志 / 风控**：经 `zmzai-relay` 写入不可篡改审计日志；风控引擎落地单笔≤10% NAV 等规则。
- **推送**：复用已连接的 `agent-mail` 推送周报 / 信号。

> 数据当前为模拟演示，平台不参与任何真实交易。投资有风险。
