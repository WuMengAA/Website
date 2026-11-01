/**
 * class8 门禁认证 API（2026-10-28）。
 *
 * POST /api/campus/class8/auth  { password, next? }
 * → 正确：Set-Cookie `c8_gate`（HMAC 令牌，30 天），返回 { ok, next }
 * → 错误：401 { error }
 * → 未配置 CLASS8_PASSCODE：{ ok, open: true }（门禁降级为开放，前端直接放行）
 */
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { gateEnabled, verifyPasscode, issueToken, GATE_COOKIE, safeNext } from "$lib/server/class8/class8-auth.js";

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: any = {};
	try {
		body = await request.json();
	} catch {
		return json({ error: "参数错误" }, { status: 400 });
	}

	if (!gateEnabled()) return json({ ok: true, open: true });

	const password = String(body.password ?? "");
	if (!verifyPasscode(password)) {
		return json({ error: "访问密码不正确" }, { status: 401 });
	}

	const { token, maxAgeSec } = issueToken();
	cookies.set(GATE_COOKIE, token, {
		path: "/",
		httpOnly: true,
		sameSite: "lax",
		maxAge: maxAgeSec
	});
	return json({ ok: true, next: safeNext(body.next) });
};
