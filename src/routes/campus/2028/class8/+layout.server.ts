/**
 * 2028届八班 · 服务端数据加载（layout 共用）。
 * 公开快照不含个人成绩 —— 隐私安全由 service 层保证。
 *
 * 门禁（2026-10-28）：配置 CLASS8_PASSCODE 后整区加锁 ——
 * 未持有效令牌访问任何子页 → 302 跳认证页 /campus/2028/class8/auth?next=...；
 * 认证页本身放行，但只返回 { locked: true }（不携带班级快照，防数据经 SSR 泄露）。
 * 未配置密码 = 门禁关闭（降级开放）。
 */
import { redirect } from "@sveltejs/kit";
import { seedClass8IfEmpty, ensureRealClass8Data, ensureSportsTimeline } from "$lib/server/class8/class8-seed.js";
import { fullSnapshot } from "$lib/server/class8/class8-service.js";
import { gateEnabled, gatePassed } from "$lib/server/class8/class8-auth.js";

const AUTH_PATH = "/campus/2028/class8/auth";

export const load = async ({ url, cookies }: { url: URL; cookies: { get(name: string): string | undefined } }) => {
  if (gateEnabled() && !gatePassed(cookies)) {
    if (url.pathname === AUTH_PATH) return { locked: true };
    redirect(302, AUTH_PATH + "?next=" + encodeURIComponent(url.pathname));
  }
  await seedClass8IfEmpty();
  await ensureRealClass8Data();
  await ensureSportsTimeline();
  return await fullSnapshot();
};
