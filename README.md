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

## 后续接入（见路线图 P3~P5）

- ✅ **真实回测与撮合**：创建智能体已接入 `zmzai-sandbox` 隔离沙箱回测（见上文执行链路），官方 Agent 数据由同一引擎生成。
- **赛季 / 对战 / 共识信号**：P3 社交游戏化（路线图）。
- **决策日志 / 风控**：经 `zmzai-relay` 写入不可篡改审计日志；风控引擎落地单笔≤10% NAV 等规则。
- **推送**：复用已连接的 `agent-mail` 推送周报 / 信号。

> 数据当前为模拟演示，平台不参与任何真实交易。投资有风险。
