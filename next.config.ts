import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @zmzai/theme 直接发布 src（TS/JSX），需要让 Next 转译它。
  transpilePackages: ["@zmzai/theme", "@zmzai/contracts"],
  // esbuild 含原生二进制，必须运行时 require（沙箱回测脚本打包用），不能打进 server bundle。
  serverExternalPackages: ["esbuild"],
};

export default nextConfig;
