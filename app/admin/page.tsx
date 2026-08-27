import type { Metadata } from "next";
import { AdminConsole } from "@/components/AdminConsole";

export const metadata: Metadata = {
  title: "运营后台 · Zmz AI Trader Arena",
  // 运营后台不对搜索引擎开放
  robots: { index: false, follow: false },
};

// 运营后台：管理员密钥登录后查看账户列表，发放/续期/回收内测 Pro。
// 页面本身公开可访问，鉴权在组件登录 + API 双保险（x-admin-secret）。
export default function AdminPage() {
  return (
    <section className="mx-auto mt-12 max-w-[960px] px-4 pb-20">
      <AdminConsole />
    </section>
  );
}
