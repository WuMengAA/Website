// class8 后墙/成绩 · 移动端 + 窄屏 + 弱网 CDP 回归验证
// 用法: node scripts/c8-mobile-verify.mjs <gateToken> [outDir]
// 说明: 自带 Edge(headless) 拉起 + remote-debugging 9333，跑完自动关闭。
import { writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const CDP = "http://127.0.0.1:9333";
const TOKEN = process.argv[2] || "";
const OUT = process.argv[3] || "scripts/.c8-out";
const BASE = "http://127.0.0.1:8090";
const PAGE = BASE + "/campus/2028/class8";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

// ── CDP 基础 ────────────────────────────────────────────────────────────────
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
	const file = `${OUT}/${name}.png`;
	writeFileSync(file, Buffer.from(r.data, "base64"));
	console.log("  [截图]", file);
}
// 触控滑动（真实触摸事件序列）
async function swipe(ws, x, y, dx, dy, steps = 12) {
	const pts = [];
	for (let i = 0; i <= steps; i++) pts.push([x + (dx * i) / steps, y + (dy * i) / steps]);
	await wsSend(ws, "Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
	for (let i = 1; i < pts.length; i++) {
		await wsSend(ws, "Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: pts[i][0], y: pts[i][1] }] });
		await sleep(16);
	}
	await wsSend(ws, "Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
	await sleep(400);
}

// ── 启动 Edge ───────────────────────────────────────────────────────────────
let edgeProc = null;
async function ensureBrowser() {
	try { await fetch(CDP + "/json/version", { signal: AbortSignal.timeout(1500) }); console.log("[browser] 复用已监听 9333 的实例"); return; } catch {}
	const ud = `${process.env.TEMP}\\c8-cdp-profile`;
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

// ── 主流程 ──────────────────────────────────────────────────────────────────
(async () => {
	await ensureBrowser();
	const tab = await fetch(CDP + "/json/new?about:blank", { method: "PUT" }).then((x) => x.json());
	const ws = await attach(tab.id);
	await wsSend(ws, "Network.setCookie", { name: "c8_gate", value: TOKEN, url: BASE, path: "/" });

	// ══ ① 移动端视口 390×844 ═══════════════════════════════════════════════
	console.log("\n── ① 移动端 390×844 ──");
	await wsSend(ws, "Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
	await wsSend(ws, "Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
	await wsSend(ws, "Page.navigate", { url: PAGE });
	const ok = await waitExpr(ws, `document.querySelectorAll('.wall-thumb').length > 0 ? 'yes' : null`, 40000);
	console.log("  页面就绪:", ok || "TIMEOUT");

	// 滚到成绩区块
	await evalJs(ws, `document.querySelector('#sec-exam')?.scrollIntoView({block:'start'}); 'ok'`);
	await sleep(2500);
	const exam = await evalJs(ws, `(() => {
		const fills = [...document.querySelectorAll('.bfill')];
		const rows = fills.map(f => ({ w: Math.round(f.getBoundingClientRect().width), target: f.style.getPropertyValue('--w'), revealed: f.classList.contains('revealed') }));
		return {
			stats: document.querySelectorAll('.exam-stat').length,
			panels: document.querySelectorAll('#sec-exam .panel').length,
			fills: fills.length,
			zeroWidth: rows.filter(r => r.w === 0).length,
			notRevealed: rows.filter(r => !r.revealed).length,
			sample: rows.slice(0, 6),
			overflowX: document.documentElement.scrollWidth > window.innerWidth,
			scrollW: document.documentElement.scrollWidth,
			innerW: window.innerWidth
		};
	})()`);
	console.log("  成绩区:", JSON.stringify(exam));
	await shot(ws, "01-exam-mobile");

	// 滚到后墙区块（等懒加载图进入视口）
	await evalJs(ws, `document.querySelector('#sec-wall')?.scrollIntoView({block:'start'}); 'ok'`);
	await sleep(3500);
	const wall = await evalJs(ws, `(() => {
		const th = [...document.querySelectorAll('.wall-thumb')];
		const imgs = th.map(t => t.querySelector('img'));
		return {
			thumbs: th.length,
			loadedClass: th.filter(t => t.classList.contains('loaded')).length,
			imgComplete: imgs.filter(i => i && i.complete && i.naturalWidth > 0).length,
			imgOpacityHidden: imgs.filter(i => i && parseFloat(getComputedStyle(i).opacity) < 0.05).length,
			imgOpacityVisible: imgs.filter(i => i && parseFloat(getComputedStyle(i).opacity) > 0.9).length,
			notLoadedButComplete: th.filter(t => { const i = t.querySelector('img'); return i && i.complete && i.naturalWidth > 0 && !t.classList.contains('loaded'); }).length,
			overflowX: document.documentElement.scrollWidth > window.innerWidth
		};
	})()`);
	console.log("  后墙区:", JSON.stringify(wall));
	await shot(ws, "02-wall-mobile");

	// ══ ② 全景浮层（全屏滚动长图） ═════════════════════════════════════════
	console.log("\n── ② 全景浮层 ──");
	await evalJs(ws, `document.querySelector('.wall-banner')?.click(); 'clicked'`);
	const panoOk = await waitExpr(ws, `document.querySelector('.wall-pano') ? 'yes' : null`, 10000);
	console.log("  浮层出现:", panoOk || "TIMEOUT");
	await sleep(2500);
	const pano = await evalJs(ws, `(() => {
		const box = document.querySelector('.wall-pano-scroll');
		const img = box?.querySelector('img');
		const pane = document.querySelector('.wall-pano');
		if (!box || !img) return { missing: true };
		const br = box.getBoundingClientRect(), ir = img.getBoundingClientRect(), pr = pane.getBoundingClientRect();
		return {
			paneRect: { w: Math.round(pr.width), h: Math.round(pr.height), top: Math.round(pr.top) },
			viewport: { w: window.innerWidth, h: window.innerHeight },
			boxW: Math.round(br.width), boxScrollW: box.scrollWidth, boxScrollLeft: box.scrollLeft,
			imgW: Math.round(ir.width), imgH: Math.round(ir.height),
			imgNaturalW: img.naturalWidth, imgNaturalH: img.naturalHeight,
			imgLeftOffsetInBox: Math.round(ir.left - br.left),
			imgOpacity: getComputedStyle(img).opacity,
			boxDisplay: getComputedStyle(box).display,
			justify: getComputedStyle(box).justifyContent
		};
	})()`);
	console.log("  全景浮层:", JSON.stringify(pano));
	// 可达性：滚到最左 / 最右，看 img 两端能否贴到容器两缘
	const reach = await evalJs(ws, `(() => {
		const box = document.querySelector('.wall-pano-scroll');
		const img = box?.querySelector('img');
		if (!box || !img) return null;
		box.scrollLeft = 0; const atLeft = { sl: box.scrollLeft, imgLeft: Math.round(img.getBoundingClientRect().left - box.getBoundingClientRect().left) };
		box.scrollLeft = box.scrollWidth; const atRight = { sl: box.scrollLeft, imgRight: Math.round(img.getBoundingClientRect().right - box.getBoundingClientRect().right) };
		return { atLeft, atRight, maxScrollLeft: box.scrollWidth - box.clientWidth, imgW: img.getBoundingClientRect().width };
	})()`);
	console.log("  可达性:", JSON.stringify(reach));
	await shot(ws, "03-pano-mobile");
	// 「看全貌」切换
	const fitRes = await evalJs(ws, `(() => {
		const b = document.querySelector('.wall-pano-fit');
		if (!b) return { noBtn: true };
		const before = document.querySelector('.wall-pano-scroll img').getBoundingClientRect().width;
		b.click();
		return { before, label: b.textContent.trim() };
	})()`);
	await sleep(900);
	const fitAfter = await evalJs(ws, `(() => {
		const box = document.querySelector('.wall-pano-scroll');
		const img = box.querySelector('img');
		return { imgW: Math.round(img.getBoundingClientRect().width), boxScrollW: box.scrollWidth, label: document.querySelector('.wall-pano-fit')?.textContent?.trim() };
	})()`);
	console.log("  看全貌切换:", JSON.stringify(fitRes), "→", JSON.stringify(fitAfter));
	await shot(ws, "03b-pano-fit");
	// 切回原始尺寸后触控横滑
	await evalJs(ws, `document.querySelector('.wall-pano-fit')?.click(); 'back to detail'`);
	await sleep(700);
	await evalJs(ws, `document.querySelector('.wall-pano-scroll').scrollLeft = 0; 'reset'`);
	await swipe(ws, 300, 420, -220, 0);
	const afterSwipe = await evalJs(ws, `(() => { const b = document.querySelector('.wall-pano-scroll'); return { scrollLeft: b.scrollLeft }; })()`);
	console.log("  触控横滑后 scrollLeft:", JSON.stringify(afterSwipe));
	await shot(ws, "04-pano-swipe");
	await evalJs(ws, `document.querySelector('.wall-pano-close')?.click(); 'closed'`);
	await sleep(600);

	// ══ ③ 照片灯箱 + 触控切换 ══════════════════════════════════════════════
	console.log("\n── ③ 灯箱 ──");
	await evalJs(ws, `document.querySelectorAll('.wall-thumb')[3]?.click(); 'opened'`);
	const lbOk = await waitExpr(ws, `document.querySelector('.wall-lb') ? 'yes' : null`, 8000);
	console.log("  灯箱出现:", lbOk || "TIMEOUT");
	await sleep(1800);
	const lb1 = await evalJs(ws, `(() => ({ count: document.querySelector('.wall-lb-count')?.textContent?.trim() ?? null, open: !!document.querySelector('.wall-lb') }))()`);
	await shot(ws, "05-lightbox-mobile");
	// 触控右滑 → 下一张（不应误关浮层）
	await swipe(ws, 120, 420, 220, 0);
	const lb2 = await evalJs(ws, `(() => ({ count: document.querySelector('.wall-lb-count')?.textContent?.trim() ?? null, open: !!document.querySelector('.wall-lb') }))()`);
	await shot(ws, "06-lightbox-next");
	console.log(`  灯箱 滑动前=${JSON.stringify(lb1)}  触控右滑后=${JSON.stringify(lb2)}`);
	console.log(`  → 浮层保持打开=${lb2.open === true ? "OK" : "被误关(FAIL)"}；切图=${lb1.count !== lb2.count ? "OK" : "未切换(FAIL)"}`);
	await evalJs(ws, `document.querySelector('.wall-lb-close')?.click(); 'closed'`);
	await sleep(500);

	// ══ ④ 超窄屏 320×568 ═══════════════════════════════════════════════════
	console.log("\n── ④ 超窄屏 320×568 ──");
	await wsSend(ws, "Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
	await wsSend(ws, "Page.navigate", { url: PAGE });
	await waitExpr(ws, `document.querySelectorAll('.wall-thumb').length > 0 ? 'yes' : null`, 30000);
	// 逐个面板滚入视口，等 IntersectionObserver 触发（区分「视口外未展开」与「真没展开」）
	await evalJs(ws, `document.querySelectorAll('#sec-exam .panel').forEach((p,i)=>setTimeout(()=>p.scrollIntoView({block:'center'}), i*700)); 'ok'`);
	await sleep(5000);
	const narrow = await evalJs(ws, `(() => {
		const doc = document.documentElement;
		const over = [...document.querySelectorAll('body *')].filter(el => {
			const r = el.getBoundingClientRect();
			return r.width > 0 && r.right > window.innerWidth + 1;
		}).slice(0, 8).map(el => ({ sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).slice(0,2).join('.') : ''), right: Math.round(el.getBoundingClientRect().right) }));
		const fills = [...document.querySelectorAll('.bfill')];
		return {
			scrollW: doc.scrollWidth, innerW: window.innerWidth,
			overflowX: doc.scrollWidth > window.innerWidth,
			browCols: (() => { const r = document.querySelector('.brow'); return r ? getComputedStyle(r).gridTemplateColumns : null; })(),
			fills: fills.length,
			fillZero: fills.filter(f => f.getBoundingClientRect().width === 0).length,
			fillW: fills.map(f => Math.round(f.getBoundingClientRect().width)).slice(0,6),
			trackW: (() => { const t = document.querySelector('.btrack'); return t ? Math.round(t.getBoundingClientRect().width) : null; })(),
			overEl: over
		};
	})()`);
	console.log("  窄屏:", JSON.stringify(narrow));
	await shot(ws, "07-exam-narrow320");

	// ══ ⑤ 弱网 Slow 3G ════════════════════════════════════════════════════
	console.log("\n── ⑤ 弱网 Slow 3G ──");
	await wsSend(ws, "Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
	await wsSend(ws, "Network.enable");
	await wsSend(ws, "Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 200 * 1024 / 8, connectionType: "cellular3g" });
	await wsSend(ws, "Page.navigate", { url: PAGE });
	await waitExpr(ws, `document.querySelectorAll('.wall-thumb').length > 0 ? 'yes' : null`, 45000);
	const weakEarly = await evalJs(ws, `(() => {
		const th = [...document.querySelectorAll('.wall-thumb')];
		return { thumbs: th.length, loaded: th.filter(t => t.classList.contains('loaded')).length, pending: th.filter(t => !t.classList.contains('loaded')).length };
	})()`);
	console.log("  弱网初始(流光占位):", JSON.stringify(weakEarly));
	await evalJs(ws, `document.querySelector('#sec-wall')?.scrollIntoView({block:'start'}); 'ok'`);
	await sleep(1500);
	await shot(ws, "08-wall-weaknet-shimmer");
	await sleep(9000);
	const weakLate = await evalJs(ws, `(() => {
		const th = [...document.querySelectorAll('.wall-thumb')];
		const imgs = th.map(t => t.querySelector('img'));
		return {
			loaded: th.filter(t => t.classList.contains('loaded')).length,
			pending: th.filter(t => !t.classList.contains('loaded')).length,
			imgComplete: imgs.filter(i => i && i.complete && i.naturalWidth > 0).length,
			brokenImg: imgs.filter(i => i && i.complete && i.naturalWidth === 0).length,
			notLoadedButComplete: th.filter(t => { const i = t.querySelector('img'); return i && i.complete && i.naturalWidth > 0 && !t.classList.contains('loaded'); }).length
		};
	})()`);
	console.log("  弱网 10s 后:", JSON.stringify(weakLate));
	await shot(ws, "09-wall-weaknet-loaded");
	await wsSend(ws, "Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: "none" });

	await fetch(CDP + "/json/close/" + tab.id).catch(() => {});
	console.log("\n=== class8 移动端/窄屏/弱网验证完成 ===");
	process.exit(0);
})().catch(async (e) => { console.error("FATAL:", e); if (edgeProc) { try { process.kill(edgeProc.pid); } catch {} } process.exit(1); });
