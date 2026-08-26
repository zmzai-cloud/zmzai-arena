// mock zmzai-auth SSO /api/me（固定返回已登录用户 u_test）
import http from "node:http";
http
  .createServer((req, res) => {
    if (req.url.startsWith("/api/me")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          user: { id: "u_test", name: "测试", email: "t@z.dev", role: "user" },
        })
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(3001, () => console.log("[mock-auth] on 3001"));
