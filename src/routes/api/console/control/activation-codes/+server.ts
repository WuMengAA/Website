/**
 * 控制轴 · 设备接入码（`/api/console/control/activation-codes`）
 *
 * ⚠️ 2026-10-25 废弃：设备接入码（XJK-XXXX-XXX）已收归星集控云端 / 管理端统一管理。
 *    新流程：管理端「班级管理」面板生成按班 6 位绑定码 → 被控端 OOBE 输入 → 云端兑换。
 *    本端点不再生成新码（POST → 410）；GET 仍可查看存量码，DELETE 仍可作废存量码。
 */

import { json } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import { listActivationCodes, revokeActivationCode } from "$lib/server/console-ext.js";
import { guardControl } from "$lib/server/guard-control.js";

export async function GET(event: RequestEvent) {
	const g = await guardControl(event, "manage");
	if ("error" in g) return g.error;
	return json({ codes: await listActivationCodes() });
}

export async function POST(event: RequestEvent) {
	// 2026-10-25 废弃：新设备接入码请到星集控管理端「班级管理」面板生成（按班 6 位绑定码），
	// 被控端首启引导页输入即完成绑定。本站点不再生成 XJK-XXXX-XXX 旧式接入码。
	return json(
		{
			error: "设备接入码已迁移至星集控管理端「班级管理」面板生成（按班 6 位绑定码），本站点不再生成。",
			deprecated: true
		},
		{ status: 410 }
	);
}

export async function DELETE(event: RequestEvent) {
	const g = await guardControl(event, "manage");
	if ("error" in g) return g.error;

	const code = String(event.url.searchParams.get("code") ?? "").trim();
	if (!code) return json({ error: "缺少 code" }, { status: 400 });
	// 假 code（不存在）→ revoke 返回 false → `{ ok: false }`，不是 500。
	return json({ ok: await revokeActivationCode(code) });
}
