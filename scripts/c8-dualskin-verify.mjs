// 双皮切换实测：克劳德默认 vs ?skin=endfield vs /lab/endfield 样张
// 用法: node scripts/c8-dualskin-verify.mjs
// 复用 c8-mobile-verify.mjs 的 Edge(headless)+CDP 启动模式，只验证皮肤共存。
import { writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const CDP = "http://127.0.0.1:9333";
const BASE = "https://www.245959623.xyz";
const OUT = "scripts/.c8-dualskin-out";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

function wsSend(ws, method, params) {
	return new Promise((resolve, reject) => {
		const id = ++ws._seq;
		const handler = (ev) => {
			const m = JSON.parse(ev.data);
			if (m.id !== id) return;
			ws.removeEventListener("message", handler);
			if (m.error) reject(new Error(method + ": " + JSON.stringify(m.error)));
			else resolve(m.result);
		};
		ws.addEventListener("message", handler);
		ws.send(JSON.stringify({ id, method, params: params || {} }));
	});
}
async function attach(id) {
	const list = await fetch(CDP + "/json/list").then((x) => x.json());
	const t = list.find((p) => p.id === id);
	const ws = new WebSocket(t.webSocketDebuggerUrl);
	ws._seq = 0;
	await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
	for (const m of ["Page", "Runtime", "Network"]) await wsSend(ws, m + ".enable");
	return ws;
}
async function evalJs(ws, expr, awaitPromise = false) {
	const r = await wsSend(ws, "Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise });
	if (r.exceptionDetails) throw new Error("eval err: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
	return r.result && r.result.value;
}
async function waitExpr(ws, expr, timeout = 30000) {
	const t0 = Date.now();
	while (Date.now() - t0 < timeout) {
		try { const v = await evalJs(ws, expr); if (v) return v; } catch {}
		await sleep(300);
	}
	return null;
}
async function shot(ws, name) {
	const r = await wsSend(ws, "Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
	writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
	console.log("  [截图]", `${OUT}/${name}.png`);
}
async function navigate(ws, url) {
	await wsSend(ws, "Page.navigate", { url });
	await waitExpr(ws, `document.readyState === 'complete' ? 'yes' : null`, 30000);
	await sleep(1200); // 等内联皮肤脚本 + 字体
}

// 探针：读取关键选择器的计算样式
const PROBE = `(() => {
	const norm = (s) => (s || '').replace(/["']/g, '').trim();
	const probe = (sel, pseudo) => {
		const el = document.querySelector(sel);
		if (!el) return { sel, missing: true };
		const cs = getComputedStyle(el, pseudo || null);
		return { sel, display: cs.display, fontFamily: cs.fontFamily, content: cs.content };
	};
	const html = document.documentElement;
	return {
		htmlClass: html.className,
		hasEndfield: html.classList.contains('theme-endfield'),
		tri: probe('.ex-tri'),
		eyebrow: probe('.ex-eyebrow.slash', '::before'),
		barTitle: probe('.ex-bar-title'),
		recordLi: probe('.ex-records > li'),
	};
})()`;

let edgeProc = null;
async function ensureBrowser() {
	try { await fetch(CDP + "/json/version", { signal: AbortSignal.timeout(1500) }); console.log("[browser] 复用已监听 9333"); return; } catch {}
	const ud = `${process.env.TEMP}\\c8-dualskin-profile`;
	edgeProc = spawn(EDGE, [
		"--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
		"--remote-debugging-port=9333", `--user-data-dir=${ud}`,
		"--hide-scrollbars", "--force-device-scale-factor=1", "about:blank",
	], { detached: true, stdio: "ignore" });
	edgeProc.unref();
	for (let i = 0; i < 60; i++) {
		try { await fetch(CDP + "/json/version", { signal: AbortSignal.timeout(800) }); console.log("[browser] Edge 已就绪"); return; } catch {}
		await sleep(400);
	}
	throw new Error("Edge 未能启动 CDP");
}

(async () => {
	await ensureBrowser();
	const tab = await fetch(CDP + "/json/new?about:blank", { method: "PUT" }).then((x) => x.json());
	const ws = await attach(tab.id);
	const results = {};

	// ══ ① 默认（克劳德） ══
	console.log("\n── ① 默认 /（克劳德默认皮肤）──");
	await wsSend(ws, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
	await navigate(ws, BASE + "/");
	const def = await evalJs(ws, PROBE);
	results.default = def;
	console.log("  ", JSON.stringify(def, null, 0));
	await shot(ws, "01-default-claude");

	// ══ ② ?skin=endfield（终末地） ══
	console.log("\n── ② /?skin=endfield（终末地皮肤）──");
	await navigate(ws, BASE + "/?skin=endfield");
	// 若参数未自动加类，补一刀以保证测到 endfield 形态（并回报参数是否生效）
	const skinAuto = await evalJs(ws, `document.documentElement.classList.contains('theme-endfield')`);
	if (!skinAuto) {
		console.log("  ⚠ ?skin=endfield 未自动加 theme-endfield，手动补类以验证 CSS 共存");
		await evalJs(ws, `document.documentElement.classList.add('theme-endfield'); 'ok'`);
	}
	await sleep(600);
	const end = await evalJs(ws, PROBE);
	end.skinParamAutoApplied = !!skinAuto;
	results.endfieldParam = end;
	console.log("  ", JSON.stringify(end, null, 0));
	await shot(ws, "02-endfield-param");

	// ══ ③ /lab/endfield 样张（强制 endfield） ══
	console.log("\n── ③ /lab/endfield 样张页（强制终末地）──");
	await navigate(ws, BASE + "/lab/endfield");
	const lab = await evalJs(ws, PROBE);
	results.lab = lab;
	console.log("  ", JSON.stringify(lab, null, 0));
	await shot(ws, "03-lab-endfield");

	// ══ 判定 ══
	console.log("\n=== 双皮切换判定 ===");
	const norm = (s) => (s || "").replace(/["']/g, "").trim().toLowerCase();
	const claude = results.default, ef = results.endfieldParam, lb = results.lab;
	const checks = [];
	const add = (name, pass, detail) => checks.push({ name, pass, detail });

	add("默认无 theme-endfield", claude.hasEndfield === false, `htmlClass=${claude.htmlClass}`);
	add("默认 .ex-tri 隐藏", claude.tri.display === "none", `display=${claude.tri.display}`);
	add("默认 eyebrow 无 // 前缀", norm(claude.eyebrow.content) === "", `content=${claude.eyebrow.content}`);
	add("默认 bar-title 衬线(Lora)", /lora/i.test(claude.barTitle.fontFamily || ""), `font=${claude.barTitle.fontFamily}`);

	add("endfield 有 theme-endfield", ef.hasEndfield === true, `htmlClass=${ef.htmlClass}`);
	add("endfield .ex-tri 显示", ef.tri.display === "grid", `display=${ef.tri.display}`);
	add("endfield eyebrow 有 // 前缀", norm(ef.eyebrow.content) === "//", `content=${ef.eyebrow.content}`);
	add("endfield bar-title 非衬线", !/lora/i.test(ef.barTitle.fontFamily || ""), `font=${ef.barTitle.fontFamily}`);

	add("样张页 有 theme-endfield", lb.hasEndfield === true, `htmlClass=${lb.htmlClass}`);
	add("样张页 bar-title 非衬线", !/lora/i.test(lb.barTitle.fontFamily || ""), `font=${lb.barTitle.fontFamily}`);
	add("样张页 eyebrow 有 // 前缀", norm(lb.eyebrow.content) === "//", `content=${lb.eyebrow.content}`);

	let allPass = true;
	for (const c of checks) {
		console.log(`  [${c.pass ? "PASS" : "FAIL"}] ${c.name}  (${c.detail})`);
		if (!c.pass) allPass = false;
	}
	console.log("\n结论:", allPass ? "双皮切换共存 OK ✅" : "存在失败项 ❌");

	await fetch(CDP + "/json/close/" + tab.id).catch(() => {});
	process.exit(allPass ? 0 : 2);
})().catch(async (e) => { console.error("FATAL:", e); if (edgeProc) { try { process.kill(edgeProc.pid); } catch {} } process.exit(1); });
