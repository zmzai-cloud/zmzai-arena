"use client";

import { useEffect } from "react";
import { syncUserAgents } from "@/lib/userAgents";

// 挂载时静默同步一次云端策略（登录用户跨设备；匿名零请求）。
// 回到前台时再次同步，覆盖「另一设备刚创建 → 本设备切回来」的场景。
export function CloudSync() {
  useEffect(() => {
    void syncUserAgents();
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncUserAgents();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return null;
}
