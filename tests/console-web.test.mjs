/**
 * 安全策略 · 星集控「网页操作端」下线（2026-11-09）
 *
 * 纯函数断言，不依赖运行中的实例。守三条底线：
 *   ① 安全默认值必须是「关闭」—— env 漏写/写错都不能把操作端打开；
 *   ② 路径判定不能误伤**保留项**：登录 / OAuth / 设备 API 轴一旦被挡就是事故；
 *   ③ 静态原生面板必须已移出 static/，否则 adapter-node 静态伺服绕过 hooks，
 *      直连 /console/index.html 仍可进（这是本次最大的洞）。
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	isConsoleWebEnabled,
	isConsoleWebPath,
	isConsoleWebHref,
	shouldBlockConsoleWeb
} from "../src/lib/console-web.ts";
import { adminEntryHref } from "../src/lib/view-switch-nav.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── ① 开关：fail-closed ───────────────────────────────────────────────────────
test("开关安全默认：未设置 / 空 / 乱填一律视为已下线", () => {
	assert.equal(isConsoleWebEnabled({}), false, "env 漏写必须保持下线");
	assert.equal(isConsoleWebEnabled({ CONSOLE_WEB_ENABLED: undefined }), false);
	assert.equal(isConsoleWebEnabled({ CONSOLE_WEB_ENABLED: "" }), false);
	assert.equal(isConsoleWebEnabled({ CONSOLE_WEB_ENABLED: "0" }), false);
	assert.equal(isConsoleWebEnabled({ CONSOLE_WEB_ENABLED: "false" }), false);
	assert.equal(isConsoleWebEnabled({ CONSOLE_WEB_ENABLED: "yes" }), false);
	assert.equal(isConsoleWebEnabled({ CONSOLE_WEB_ENABLED: "on" }), false);
});

test("开关只有显式 1 / true（含大小写与空白）才恢复", () => {
	for (const v of ["1", "true", "TRUE", "True", " 1 ", " true "]) {
		assert.equal(isConsoleWebEnabled({ CONSOLE_WEB_ENABLED: v }), true, `${JSON.stringify(v)} 应开启`);
	}
});

// ── ② 路径判定：命中两套网页面板 ─────────────────────────────────────────────
test("命中 /admin/console/** 与 /console/** 两套网页操作端", () => {
	for (const p of [
		"/admin/console",
		"/admin/console/",
		"/admin/console/devices",
		"/admin/console/remote?uid=1",
		"/console",
		"/console/",
		"/console/index.html",
		"/console/remote-webrtc.html",
		"/console/app.js"
	]) {
		assert.equal(isConsoleWebPath(p), true, `${p} 应被判定为网页操作端`);
	}
});

test("绝不误伤保留项：登录 / OAuth / 设备 API / 后台其它页", () => {
	for (const p of [
		"/", "/admin", "/admin/login", "/admin/posts", "/admin/health",
		"/api/auth", "/oauth/authorize", "/oauth/token", "/oauth/userinfo",
		"/api/console/control/device-status",
		"/api/console/control/device-command",
		"/api/console/cims/account/list",
		"/api/console/ext/notices",
		"/api/device/p2p-token",
		"/api/device/notice-reply",
		"/api/me", "/api/version",
		"/download", "/projects/xingjikong", "/campus/broadcast",
		"/admin/console-foo", "/console-allow", "/consolefoo"
	]) {
		assert.equal(isConsoleWebPath(p), false, `${p} 属保留项，不能被挡`);
	}
	assert.equal(isConsoleWebPath(""), false);
	assert.equal(isConsoleWebPath(undefined), false);
});

// ── ②b 服务端硬门的实际判定（hooks 与测试共用同一份纯函数）──────────────────
test("硬门：关闭时挡两套面板，但登录/OAuth/设备 API 一律放行", () => {
	const off = {};
	assert.equal(shouldBlockConsoleWeb("/admin/console", off), true);
	assert.equal(shouldBlockConsoleWeb("/admin/console/devices", off), true);
	assert.equal(shouldBlockConsoleWeb("/console/index.html", off), true);
	assert.equal(shouldBlockConsoleWeb("/admin/login", off), false, "登录必须保留");
	assert.equal(shouldBlockConsoleWeb("/api/auth", off), false, "登录 API 必须保留");
	assert.equal(shouldBlockConsoleWeb("/oauth/token", off), false, "OAuth 必须保留");
	assert.equal(shouldBlockConsoleWeb("/api/console/control/device-status", off), false, "设备控制轴必须保留");
	assert.equal(shouldBlockConsoleWeb("/api/device/notice-reply", off), false, "被控轴必须保留");
});

test("硬门：开关开启后面板恢复可达（回滚有效）", () => {
	const on = { CONSOLE_WEB_ENABLED: "1" };
	assert.equal(shouldBlockConsoleWeb("/admin/console", on), false);
	assert.equal(shouldBlockConsoleWeb("/console/index.html", on), false);
});

// ── ③ 导航链接过滤（含 query / hash / 绝对 URL）─────────────────────────────
test("导航 href 过滤：相对、带查询、绝对域名都能识别", () => {
	for (const h of [
		"/admin/console",
		"/admin/console/devices",
		"/admin/console?returnTo=%2Fadmin",
		"/admin/console#top",
		"https://example.com/admin/console",
		"https://example.com/console/index.html",
		"/console/app.js?v=2"
	]) {
		assert.equal(isConsoleWebHref(h), true, `${h} 应被过滤`);
	}
	for (const h of ["/admin", "/admin/console-foo", "/docs", "", null, undefined]) {
		assert.equal(isConsoleWebHref(h), false, `${h} 不该被过滤`);
	}
});

// ── ④ 登录分流：纯 viewConsole 账号在关闭时入口消失、开启时恢复 ─────────────
test("后台入口：admin/editor 始终进 /admin（登录链路不受影响）", () => {
	for (const r of ["admin", "editor", "owner"]) {
		assert.equal(adminEntryHref({ role: r }, false), "/admin");
		assert.equal(adminEntryHref({ role: r }, true), "/admin");
	}
});

test("后台入口：techrep 关闭时消失、开启时回到面板（可秒回滚）", () => {
	assert.equal(adminEntryHref({ role: "techrep" }, false), null, "关闭时不能有指向 404 的死链");
	assert.equal(adminEntryHref({ role: "techrep" }, true), "/admin/console");
});

test("后台入口：漏传开关参数 = 安全默认关闭（不能 fail-open）", () => {
	assert.equal(adminEntryHref({ role: "techrep" }), null);
	assert.equal(adminEntryHref(null, false), null);
	assert.equal(adminEntryHref({ role: "user" }, true), null);
});

// ── ⑤ 物理封堵：静态面板已移出 static/ ─────────────────────────────────────
test("static/console/ 必须已移出（否则静态伺服绕过 hooks）", () => {
	assert.equal(
		fs.existsSync(path.join(ROOT, "static", "console")),
		false,
		"static/console 存在 = /console/index.html 直连可进，安全洞未堵"
	);
});

test("移出的 15 个文件全部保留在 _retired/（零删除、可逆）", () => {
	const retired = path.join(ROOT, "_retired", "console-web-static");
	assert.ok(fs.existsSync(retired), "_retired/console-web-static 应存在");
	const files = fs.readdirSync(retired, { recursive: true, withFileTypes: true })
		.filter((d) => d.isFile()).map((d) => d.name);
	assert.ok(files.includes("index.html"), "index.html 应保留");
	assert.ok(files.includes("app.js"), "app.js 应保留");
	assert.ok(files.length >= 15, `应保留至少 15 个文件，实际 ${files.length}`);
});

// ── ⑥ 保留项回归：登录/OAuth/设备 API 源码仍在 ──────────────────────────────
test("保留项源码仍在：登录、OAuth、设备控制轴不得被删", () => {
	for (const rel of [
		"src/routes/admin/login/+page.server.ts",
		"src/routes/api/auth/+server.ts",
		"src/routes/oauth/token/+server.ts",
		"src/routes/api/console/control/device-status/+server.ts",
		"src/routes/api/device/notice-reply/+server.ts",
		"src/lib/server/guard-device.ts",
		"src/lib/server/guard-control.ts"
	]) {
		assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} 属保留项，不该被删`);
	}
});

test("hooks 硬门存在且位于 handle 最前（防止被后人挪到登录校验之后）", () => {
	const src = fs.readFileSync(path.join(ROOT, "src", "hooks.server.ts"), "utf8");
	const gate = src.indexOf("shouldBlockConsoleWeb(url.pathname)");
	const adminGuard = src.indexOf('url.pathname.startsWith("/admin")');
	assert.ok(gate > 0, "hooks 里应有网页操作端硬门");
	assert.ok(gate < adminGuard, "硬门必须在 /admin 登录校验之前");
});
