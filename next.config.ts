import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @zmzai/theme 直接发布 src（TS/JSX），需要让 Next 转译它。
  transpilePackages: ["@zmzai/theme", "@zmzai/contracts"],
  // esbuild 含原生二进制，必须运行时 require（沙箱回测脚本打包用），不能打进 server bundle。
  serverExternalPackages: ["esbuild"],
  // @zmzai/contracts 以 ESM 风格写相对导入（"./events/usage.js" 实际指向 .ts 源码），
  // webpack 默认不会把 .js 回退到 .ts，需显式配置扩展名别名（与 zmzai-relay 同款）。
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
