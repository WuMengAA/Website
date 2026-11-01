/**
 * class8 班级展板 · 访问门禁（2026-10-28）。
 *
 * 需求：班级展板含全员真实姓名，需「先跳转认证、后放行、带令牌」。
 *
 * 设计：
 * - 密码取环境变量 `CLASS8_PASSCODE`。**未配置时门禁自动关闭**（全开放），
 *   避免忘了配 env 把整个班级区锁死；线上部署的 .env 已配置。
 * - 认证通过后签发 HMAC-SHA256 签名令牌（payload 只有过期时间戳），
 *   存 httpOnly cookie `c8_gate`，有效期 30 天。签名密钥由密码派生 ——
 *   改密码即全体旧令牌失效，无需额外吊销机制。
 * - 所有比较走常数时间（timingSafeEqual），不泄露前缀匹配信息。
 * - 静态图片（/campus/... 下 static 资源）不经路由守卫，URL 不可枚举
 *   （文件名含拍摄时间戳），这是页面级门禁的已知边界，如需图片级保护
 *   应改为经 API 中转，暂不引入该复杂度。
 */
import crypto from "node:crypto";
import { env } from "$env/dynamic/private";

export const GATE_COOKIE = "c8_gate";
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

export function class8Passcode(): string {
	return (env.CLASS8_PASSCODE ?? "").trim();
}

/** 门禁是否启用（未配密码 = 开放访问，属降级行为） */
export function gateEnabled(): boolean {
	return class8Passcode().length > 0;
}

function hmacKey(): Buffer {
	// 由密码派生密钥：改密码 → 旧令牌全部失效
	return crypto.createHmac("sha256", class8Passcode()).update("c8-gate-key-v1").digest();
}

function sign(payload: string): string {
	return crypto.createHmac("sha256", hmacKey()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
	const ha = crypto.createHash("sha256").update(a).digest();
	const hb = crypto.createHash("sha256").update(b).digest();
	return crypto.timingSafeEqual(ha, hb);
}

/** 校验密码（常数时间）。 */
export function verifyPasscode(input: string): boolean {
	const pw = class8Passcode();
	if (!pw) return false;
	return safeEqual((input ?? "").trim(), pw);
}

/** 签发令牌：`<过期毫秒时间戳>.<hmac>` */
export function issueToken(): { token: string; maxAgeSec: number } {
	const exp = Date.now() + TOKEN_TTL_MS;
	return { token: `${exp}.${sign(String(exp))}`, maxAgeSec: Math.floor(TOKEN_TTL_MS / 1000) };
}

/** 校验令牌（签名 + 未过期）。 */
export function verifyGateToken(token: string | undefined | null): boolean {
	if (!token) return false;
	const dot = token.indexOf(".");
	if (dot <= 0) return false;
	const expStr = token.slice(0, dot);
	const sig = token.slice(dot + 1);
	const exp = Number(expStr);
	if (!Number.isFinite(exp) || exp <= Date.now()) return false;
	return safeEqual(sig, sign(expStr));
}

/**
 * 请求是否已通过门禁（读 cookie）。供 API 端点复用。
 */
export function gatePassed(cookies: { get(name: string): string | undefined }): boolean {
	if (!gateEnabled()) return true;
	return verifyGateToken(cookies.get(GATE_COOKIE));
}

/** 回跳地址白名单：只允许 class8 区内路径，防开放重定向。 */
export function safeNext(next: string | null | undefined): string {
	const n = (next ?? "").trim();
	if (n.startsWith("/campus/2028/class8") && !n.startsWith("//")) return n;
	return "/campus/2028/class8";
}
