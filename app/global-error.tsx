"use client";

// 根级错误边界（layout 自身崩溃时的最后防线）：必须自带 <html>/<body>。
// 保持极简——不依赖 globals.css 与任何组件，只保证可读的错误信息与刷新入口。

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
          background: "#101014",
          color: "#e8e8ea",
        }}
      >
        <div style={{ maxWidth: 480, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#f87171" }}>
            APPLICATION ERROR
          </div>
          <h1 style={{ fontSize: 22, margin: "8px 0" }}>应用发生严重错误</h1>
          <p style={{ fontSize: 13, color: "#9a9aa2", lineHeight: 1.7 }}>
            页面框架未能正常启动。请刷新重试；若持续出现，请稍后再访问。
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              padding: "9px 22px",
              borderRadius: 6,
              border: "none",
              background: "#4c7dff",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            刷新重试
          </button>
          {error.digest && (
            <div style={{ marginTop: 24, fontSize: 10.5, color: "#6b6b73" }}>
              ERROR DIGEST · {error.digest}
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
