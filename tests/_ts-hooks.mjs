/**
 * 测试期模块解析钩子：让 server 模块可以在 node:test 里直接 import。
 *
 * 解决两件事：
 *   1. `$env/dynamic/private` 是 SvelteKit 的虚拟模块，Node 不认识 —— 换成一个
 *      代理到 process.env 的真实模块（语义与 dynamic env 一致：运行时读取）。
 *   2. `$lib/...` 别名 —— 重写到 src/lib。
 *
 * 启用方式：node --test --import ./tests/_register-mocks.mjs ...
 * 钩子只拦这两个前缀，其余解析原样放行，对既有 HTTP 测试零影响。
 *
 * 2026-11-09：源码用 `$lib/xxx.js` 引用（SvelteKit 约定，构建期解析），但磁盘上
 * 实际是 `xxx.ts`。直接拼路径会 MODULE_NOT_FOUND，导致任何依赖 `$lib/permissions.js`
 * 的纯函数（如 view-switch-nav）在测试里无法 import。这里按存在性回退到 `.ts`：
 * 真有 `.js` 文件就原样用，只有 `.js` 不存在而同名 `.ts` 存在时才改写。
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENV_STUB =
	"data:text/javascript,export const env=new Proxy({},{get:(_t,p)=>process.env[String(p)]});";

export async function resolve(specifier, context, next) {
	if (specifier === "$env/dynamic/private") {
		return { url: ENV_STUB, shortCircuit: true };
	}
	if (specifier.startsWith("$lib/")) {
		const mapped = new URL(`../src/lib/${specifier.slice("$lib/".length)}`, import.meta.url);
		let target = mapped.href;
		if (!existsSync(fileURLToPath(mapped))) {
			const asTs = new URL(target.replace(/\.js$/, ".ts"));
			if (existsSync(fileURLToPath(asTs))) target = asTs.href;
		}
		return next(target, context);
	}
	return next(specifier, context);
}
