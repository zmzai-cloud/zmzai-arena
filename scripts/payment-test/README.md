# 支付全链路测试(XorPay)

本地验证建单/回调落账链路,无需真实 XorPay 商户。依赖三个进程:

```bash
# 1. mock SSO(3001):固定返回已登录用户 u_test(t@z.dev)
node scripts/payment-test/mock-auth.mjs &

# 2. mock XorPay 网关(3010):官方签名校验的 /api/pay/{aid} + 订单管理
node scripts/payment-test/mock-xorpay.mjs &

# 3. dev 服务(3000),带 XorPay 测试凭据
XORPAY_AID=test-aid XORPAY_APP_SECRET=test-secret \
XORPAY_API_URL=http://localhost:3010 SITE_ORIGIN=http://localhost:3000 \
npx next dev -p 3000 &

# 4. 跑测试(13 项断言:建单 5 + 回调 8)
cd zmzai-arena && rm -f .data/accounts.json .data/orders.json .data/pending.json
node scripts/payment-test/webhook-test-xorpay.mjs
```

要点:

- mock 网关实现官方签名 `md5(name+pay_type+price+order_id+notify_url+secret)` 与回调签名
  `md5(aoid+order_id+pay_price+pay_time+secret)`(与 src/lib/xorpay.ts 一致)。
- 测试脚本先 upgrade 建单(校验二维码内容 + pending 表落记录),再覆盖:坏签名 / 订单不存在 /
  金额不符 / 幂等 / 年付叠加 / 过期订单。
- 生产环境变量见 .env.example(XORPAY_AID / XORPAY_APP_SECRET / XORPAY_NOTIFY_URL),
  回调地址固定 https://arena.zmzai.cloud/api/billing/webhook,配置在 XorPay 后台。
