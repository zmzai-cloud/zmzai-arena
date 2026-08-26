# 支付全链路测试(爱发电)

本地验证升级/落账链路,无需真实爱发电账号。依赖三个进程:

```bash
# 1. mock SSO(3001):固定返回已登录用户 u_test(t@z.dev)
node scripts/payment-test/mock-auth.mjs &

# 2. mock 爱发电网关(3010):官方签名校验的 /query-order + 订单注入
node scripts/payment-test/mock-afdian.mjs &

# 3. dev 服务(3000),带爱发电测试凭据
AFDIAN_USER_ID=u_afdian_test AFDIAN_TOKEN=test-token \
AFDIAN_PLAN_MONTHLY=plan_m AFDIAN_PLAN_YEARLY=plan_y \
AFDIAN_API_URL=http://localhost:3010 SITE_ORIGIN=http://localhost:3000 \
npx next dev -p 3000 &

# 4. 跑测试(15 项断言:升级 4 + webhook 11)
cd zmzai-arena && rm -f .data/accounts.json .data/orders.json .data/email-index.json .data/unmatched.json
node scripts/payment-test/webhook-test-afdian.mjs
```

要点:

- mock 网关实现官方签名 `md5(token + "params" + params + "ts" + ts + "user_id" + userId)` 与
  webhook 加密 `AES-128-CBC, key=iv=md5(token) 前 16 位`(与 src/lib/afdian.ts 一致)。
- 测试脚本先调 upgrade 建 email 索引,再覆盖:解密失败 / 反查不到 / 金额不符 / 邮箱与 zmz:userId
  对账 / 幂等 / 待人工清单 / 明文模式 / 非成功状态 / 续费叠加。
- 生产环境变量见 .env.example(AFDIAN_USER_ID / AFDIAN_TOKEN / AFDIAN_PLAN_MONTHLY /
  AFDIAN_PLAN_YEARLY),Webhook 地址配置在爱发电开发者后台。
