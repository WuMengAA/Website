/**
 * 星集控「网页操作端」下线开关（安全策略 · 2026-11-09）
 *
 * 背景：因安全策略要求，下线网站后台的星集控**网页操作端** —— 即人通过浏览器
 * 操作教室设备的那套面板。它有两套入口：
 *   ① /admin/console/**  SvelteKit 面板（走 hooks.server.ts）
 *   ② /console/**        原生静态面板 static/console/（adapter-node 静态伺服，
 *                        **绕过 hooks**，故源文件已移出 static/，见 docs/）
 *
 * 边界（务必别越界，用户明确要求「只有网页操作端」）：
 *   ✅ 下线：两套网页面板、前后台导航入口、指向面板的跳转与按钮
 *   ❌ 保留：/admin/login、/api/auth、OAuth 全链路、/api/console/** 控制轴、
 *           /api/device/** 被控轴、CIMS 代理、定时广播调度器、前台品牌内容、
 *           桌面端 OTA 契约
 *   理由：设备侧与登录侧一旦动了，在线教室机会立即失联、账号无法登录。
 *
 * 回滚：设置环境变量 CONSOLE_WEB_ENABLED=1 并重启，网页操作端即恢复
 *      （静态面板需把 _retired/console-web-static/ 移回 static/console/）。
 *      默认（未设置 / 其它值）= 下线。安全默认值必须是「关闭」——
 *      配置漏写不能把下线状态悄悄打开。
 *
 * 纯函数、无服务端依赖：客户端组件与 hooks 共用同一份判定，避免两套条件漂移。
 */

/** 是否启用星集控网页操作端。默认 false（下线）。只有显式 "1"/"true" 才开启。 */
export function isConsoleWebEnabled(env: Record<string, string | undefined> = process.env): boolean {
	const v = String(env.CONSOLE_WEB_ENABLED ?? "").trim().toLowerCase();
	return v === "1" || v === "true";
}

/** 需要下线到 /admin/console 的页面路由前缀。 */
const ADMIN_CONSOLE_PREFIX = "/admin/console";

/**
 * 该路径是否属于「星集控网页操作端」。
 * 精确匹配前缀 + 斜杠边界：/admin/console-foo 不算，避免误伤未来同名前缀路由。
 * ⚠️ 绝不能把 /api/console/** 或 /api/device/** 纳入 —— 那是设备 API 轴。
 */
export function isConsoleWebPath(pathname: string): boolean {
	if (!pathname) return false;
	for (const p of [ADMIN_CONSOLE_PREFIX, "/console"]) {
		if (pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?") || pathname.startsWith(p + "#")) {
			return true;
		}
	}
	return false;
}

/**
 * 服务端硬门的**唯一判定**：该请求是否应被 404 挡下。
 * hooks.server.ts 与回归测试共用这一份，避免「测试测的是 A、线上跑的是 B」。
 * 抽成纯函数而不是塞在 hooks 里：hooks 的 import 链会拉起整条 DB/鉴权依赖，
 * 无法在 node:test 里零副作用地加载。
 */
export function shouldBlockConsoleWeb(
	pathname: string,
	env: Record<string, string | undefined> = process.env
): boolean {
	return !isConsoleWebEnabled(env) && isConsoleWebPath(pathname);
}

/** 导航项 URL 是否指向已下线的面板（用于过滤侧栏/自定义导航里的死链）。 */
export function isConsoleWebHref(href: string): boolean {
	if (!href) return false;
	// 只取 pathname 部分，去掉 query / hash / 绝对域名
	let p = href.trim();
	const scheme = p.indexOf("://");
	if (scheme >= 0) {
		const rest = p.indexOf("/", scheme + 3);
		p = rest >= 0 ? p.slice(rest) : "/";
	}
	for (const ch of ["?", "#"]) {
		const i = p.indexOf(ch);
		if (i >= 0) p = p.slice(0, i);
	}
	return isConsoleWebPath(p);
}
