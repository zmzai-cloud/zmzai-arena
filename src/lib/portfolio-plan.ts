// 跟单组合数量上限：客户端与服务端共享（纯常量文件，无副作用、无环境依赖）。
// 注意：不能放在 "use client" 文件里 —— 服务端 import 时 Next.js 会代理为函数引用。

export const FREE_MAX_PORTFOLIOS = 1;
export const PRO_MAX_PORTFOLIOS = 5;
