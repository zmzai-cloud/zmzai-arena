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

## 后续接入（见路线图 P3~P5）

- ✅ **真实回测与撮合**：创建智能体已接入 `zmzai-sandbox` 隔离沙箱回测（见上文执行链路），官方 Agent 数据由同一引擎生成。
- **赛季 / 对战 / 共识信号**：P3 社交游戏化（路线图）。
- **决策日志 / 风控**：经 `zmzai-relay` 写入不可篡改审计日志；风控引擎落地单笔≤10% NAV 等规则。
- **推送**：复用已连接的 `agent-mail` 推送周报 / 信号。

> 数据当前为模拟演示，平台不参与任何真实交易。投资有风险。
