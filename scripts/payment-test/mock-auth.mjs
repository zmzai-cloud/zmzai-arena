// mock zmzai-auth SSO /api/me（固定返回已登录用户 u_test；MOCK_ROLE=admin 时模拟全域管理员）
import http from "node:http";
const role = process.env.MOCK_ROLE || "user";
http
  .createServer((req, res) => {
    if (req.url.startsWith("/api/me")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          user: { id: "u_test", name: "测试", email: "t@z.dev", role },
        })
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(3001, () => console.log(`[mock-auth] on 3001 (role=${role})`));
