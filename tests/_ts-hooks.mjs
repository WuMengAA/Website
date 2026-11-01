/**
 * 测试期模块解析钩子：让 server 模块可以在 node:test 里直接 import。
 *
 * 解决两件事：
 *   1. `$env/dynamic/private` 是 SvelteKit 的虚拟模块，Node 不认识 —— 换成一个
 *      代理到 process.env 的真实模块（语义与 dynamic env 一致：运行时读取）。
 *   2. `$lib/...` 别名 —— 重写到 src/lib。
 *
 * 启用方式：node --test --import ./tests/_register-mocks.mjs ...
 * 钩子只拦这两个前缀，其余解析原样放行，对既有 25 条 HTTP 测试零影响。
 */
const ENV_STUB =
	"data:text/javascript,export const env=new Proxy({},{get:(_t,p)=>process.env[String(p)]});";

export async function resolve(specifier, context, next) {
	if (specifier === "$env/dynamic/private") {
		return { url: ENV_STUB, shortCircuit: true };
	}
	if (specifier.startsWith("$lib/")) {
		const mapped = new URL(`../src/lib/${specifier.slice("$lib/".length)}`, import.meta.url).href;
		return next(mapped, context);
	}
	return next(specifier, context);
}
