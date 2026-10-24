<script lang="ts">
	// 采购中心 · 真 3D（three.js）+ 角色档案视频。
	// 还原参考：217 的 3D 物件+侧栏 HUD、191 的径向索引、102 的高对比黄、ZMD 立绘视频。
	// 整页走暗色控制台（终末地游戏 UI 底色），黑底立绘视频无缝融入；黄色单一强调色。
	import "../endfield-kit.css";
	import Seo from "$lib/components/Seo.svelte";
	import { onMount } from "svelte";

	type Item = {
		group: string;
		code: string;
		name: string;
		en: string;
		note: string;
		href: string;
		tag: string;
		free: string;
	};

	const tabs = [
		{ k: "featured", zh: "精选", en: "Featured" },
		{ k: "client", zh: "客户端", en: "Client" },
		{ k: "tpl", zh: "模板", en: "Templates" },
		{ k: "tool", zh: "工具", en: "Tools" },
		{ k: "doc", zh: "教程", en: "Docs" }
	];

	const items: Item[] = [
		{ group: "client", code: "No.001", name: "星集控 · 桌面端", en: "Stelarith Desktop", note: "教室设备集控，Windows 安装包与更新通道同源。", href: "/download", tag: "Windows", free: "开源免费" },
		{ group: "client", code: "No.002", name: "站点源码", en: "Site Source", note: "SvelteKit + PostgreSQL，含终末地主题全家桶。", href: "/projects", tag: "SvelteKit", free: "开源免费" },
		{ group: "tpl", code: "No.003", name: "文章模板 · 终末地", en: "Article Template", note: "reading 范式正文骨架，编号分节与字段行齐备。", href: "/docs", tag: "Markdown", free: "开源免费" },
		{ group: "tpl", code: "No.004", name: "页面模板预设", en: "Layout Presets", note: "版心宽度、侧栏目录、页面主色一步到位。", href: "/pages", tag: "Preset", free: "开源免费" },
		{ group: "tool", code: "No.005", name: "配色工具", en: "Color Tool", note: "终末地色板取值与对比度校验。", href: "/tools/color-tool", tag: "Web", free: "在线使用" },
		{ group: "tool", code: "No.006", name: "封面生成器", en: "Cover Generator", note: "批量出图，宽体标签与黄块编号。", href: "/tools/cover-generator", tag: "Web", free: "在线使用" },
		{ group: "tool", code: "No.007", name: "图床 / 图片处理", en: "Image Tool", note: "压图、加水印、批量导出。", href: "/tools/image-tool", tag: "Web", free: "在线使用" },
		{ group: "doc", code: "No.008", name: "部署到 CF 边缘", en: "CF Edge", note: "Tunnel 接入、优选与安全收口全流程。", href: "/docs", tag: "Guide", free: "免费阅读" }
	];

	const chars = [
		{ key: "luoxi", zh: "洛茜", en: "LUOXI", code: "// 01", enter: "/media/zmd/luoxi-enter.mp4", idle: "/media/zmd/luoxi-idle.mp4" },
		{ key: "si", zh: "祀", en: "SI", code: "// 02", enter: "/media/zmd/si-enter.mp4", idle: "/media/zmd/si-idle.mp4" }
	];

	let tab = $state("featured");
	let sel = $state(0);
	let mode = $state<Record<string, "enter" | "idle">>({ luoxi: "enter", si: "enter" });

	const list = $derived(tab === "featured" ? items : items.filter((i) => i.group === tab));
	const cur = $derived<Item>(items[sel] ?? items[0]);

	let stageEl: HTMLDivElement | undefined = $state();
	let api: any = null;

	function pickTab(k: string) {
		tab = k;
		const first = items.findIndex((i) => k === "featured" || i.group === k);
		if (first >= 0) sel = first;
	}

	function pickItem(it: Item) {
		sel = items.indexOf(it);
	}

	onMount(() => {
		let disposed = false;
		(async () => {
			const THREE: any = await import("three");
			if (disposed || !stageEl) return;
			api = buildStage(THREE, stageEl, items, (i: number) => {
				sel = i;
			});
			api.select(sel);
		})();
		return () => {
			disposed = true;
			api?.dispose?.();
			api = null;
		};
	});

	$effect(() => {
		const s = sel;
		if (api) api.select(s);
	});

	function buildStage(THREE: any, el: HTMLDivElement, data: Item[], onPick: (i: number) => void) {
		const W = () => el.clientWidth || 1;
		const H = () => el.clientHeight || 1;

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.setSize(W(), H());
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		el.appendChild(renderer.domElement);

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 200);
		camera.position.set(0, 0.35, 9.6);
		camera.lookAt(0, 0, 0);

		scene.add(new THREE.AmbientLight(0xffffff, 1.05));
		const dir = new THREE.DirectionalLight(0xffffff, 1.5);
		dir.position.set(3.5, 6, 4);
		scene.add(dir);
		const acc = new THREE.PointLight(0xfffa00, 16, 40, 2);
		acc.position.set(-3.5, 3, 3.5);
		scene.add(acc);

		// 平面多卡片：卡片沿 X 轴排开、正面朝相机；选中项居中，切换时横向滑动。
		const carousel = new THREE.Group();
		scene.add(carousel);
		const N = data.length;
		const SPACING = 2.55;
		const panels: any[] = [];
		data.forEach((it, i) => {
			const mat = new THREE.MeshBasicMaterial({ map: panelTexture(THREE, it, i), transparent: true });
			const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.375), mat);
			mesh.position.set(i * SPACING, 0, 0);
			mesh.userData.index = i;
			carousel.add(mesh);
			panels.push(mesh);
		});

		// 地面基线（横向黄线，弱）
		const baseLine = new THREE.Line(
			new THREE.BufferGeometry().setFromPoints([
				new THREE.Vector3(-16, -1.2, 0),
				new THREE.Vector3(16, -1.2, 0)
			]),
			new THREE.LineBasicMaterial({ color: 0xfffa00, transparent: true, opacity: 0.22 })
		);
		scene.add(baseLine);

		let focus = 0;
		let focusTarget = 0;
		let dragging = false;
		let lastX = 0;
		let moved = 0;
		let raf = 0;

		function select(i: number) {
			focusTarget = Math.max(0, Math.min(N - 1, i));
		}

		const elCanvas = renderer.domElement;
		elCanvas.style.touchAction = "pan-y";
		elCanvas.style.cursor = "grab";

		function onDown(e: PointerEvent) {
			dragging = true;
			lastX = e.clientX;
			moved = 0;
			elCanvas.style.cursor = "grabbing";
		}
		function onMove(e: PointerEvent) {
			if (!dragging) return;
			const dx = e.clientX - lastX;
			lastX = e.clientX;
			moved += Math.abs(dx);
			focus -= dx * 0.0045;
			focus = Math.max(-0.6, Math.min(N - 1 + 0.6, focus));
			focusTarget = focus;
		}
		function onUp() {
			if (!dragging) return;
			dragging = false;
			elCanvas.style.cursor = "grab";
			const snapped = Math.max(0, Math.min(N - 1, Math.round(focus)));
			focusTarget = snapped;
			if (moved > 8) onPick(snapped);
		}
		elCanvas.addEventListener("pointerdown", onDown);
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onUp);

		const ray = new THREE.Raycaster();
		const ndc = new THREE.Vector2();
		function onClick(e: MouseEvent) {
			if (moved > 8) return;
			const r = elCanvas.getBoundingClientRect();
			ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
			ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
			ray.setFromCamera(ndc, camera);
			const hits = ray.intersectObjects(panels, false);
			if (hits.length) {
				const idx = hits[0].object.userData.index;
				select(idx);
				onPick(idx);
			}
		}
		elCanvas.addEventListener("click", onClick);

		function tick() {
			raf = requestAnimationFrame(tick);
			focus += (focusTarget - focus) * 0.14;
			const sel = Math.round(focus);
			for (let i = 0; i < panels.length; i++) {
				const p = panels[i];
				const d = Math.abs(i - focus);
				p.position.x = (i - focus) * SPACING;
				p.position.z = -Math.min(1.4, d * 0.42);
				const s = 1 - Math.min(0.3, d * 0.16);
				p.scale.x = s;
				p.scale.y = s;
				p.material.opacity = 1 - Math.min(0.72, d * 0.34);
				p.renderOrder = i === sel ? 2 : 1;
			}
			renderer.render(scene, camera);
		}
		tick();

		const ro = new ResizeObserver(() => {
			const w = W();
			const h = H();
			renderer.setSize(w, h);
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
		});
		ro.observe(el);

		return {
			select,
			dispose() {
				cancelAnimationFrame(raf);
				ro.disconnect();
				elCanvas.removeEventListener("pointerdown", onDown);
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				window.removeEventListener("pointercancel", onUp);
				elCanvas.removeEventListener("click", onClick);
				scene.traverse((o: any) => {
					if (o.geometry) o.geometry.dispose?.();
					if (o.material) {
						const m = o.material;
						if (m.map) m.map.dispose?.();
						m.dispose?.();
					}
				});
				renderer.dispose();
				if (elCanvas.parentNode) elCanvas.parentNode.removeChild(elCanvas);
			}
		};
	}

	function radialTexture(THREE: any) {
		const s = 1024;
		const c = document.createElement("canvas");
		c.width = c.height = s;
		const g = c.getContext("2d")!;
		g.clearRect(0, 0, s, s);
		g.strokeStyle = "rgba(237,237,237,0.5)";
		g.lineWidth = 1.5;
		const cx = s / 2;
		for (let r = 40; r < s / 2; r += 46) {
			g.globalAlpha = Math.max(0.05, 0.5 - r / s);
			g.beginPath();
			g.arc(cx, cx, r, 0, Math.PI * 2);
			g.stroke();
		}
		g.globalAlpha = 0.28;
		for (let i = 0; i < 36; i++) {
			const a = (i / 36) * Math.PI * 2;
			g.beginPath();
			g.moveTo(cx, cx);
			g.lineTo(cx + Math.cos(a) * (s / 2), cx + Math.sin(a) * (s / 2));
			g.stroke();
		}
		g.globalAlpha = 1;
		const tex = new THREE.CanvasTexture(c);
		tex.colorSpace = THREE.SRGBColorSpace;
		return tex;
	}

	function panelTexture(THREE: any, it: Item, i: number) {
		const w = 640;
		const h = 400;
		const c = document.createElement("canvas");
		c.width = w;
		c.height = h;
		const g = c.getContext("2d")!;
		g.fillStyle = "#f4f4f2";
		g.fillRect(0, 0, w, h);
		g.strokeStyle = "#161616";
		g.lineWidth = 8;
		g.strokeRect(4, 4, w - 8, h - 8);
		g.fillStyle = "#fffa00";
		g.beginPath();
		g.moveTo(w - 96, 4);
		g.lineTo(w - 4, 96);
		g.lineTo(w - 4, 4);
		g.closePath();
		g.fill();
		g.fillStyle = "#161616";
		g.font = '800 40px "Saira", system-ui, sans-serif';
		g.fillText(String(i + 1).padStart(2, "0"), w - 70, 46);
		g.fillStyle = "#5c5c5c";
		g.font = '600 24px "Saira", system-ui, sans-serif';
		g.fillText(it.code, 40, 62);
		g.fillStyle = "#161616";
		g.fillRect(40, 84, 132, 34);
		g.fillStyle = "#f4f4f2";
		g.font = '700 18px "Saira", system-ui, sans-serif';
		g.fillText(it.tag, 54, 108);
		g.fillStyle = "#161616";
		g.font = '800 38px "Saira", system-ui, sans-serif';
		wrap(g, it.name, 40, 178, w - 80, 46);
		g.fillStyle = "#5c5c5c";
		g.font = '400 20px system-ui, "Noto Sans SC", sans-serif';
		wrap(g, it.note, 40, 286, w - 80, 30);
		g.fillStyle = "#161616";
		g.font = '800 28px "Saira", system-ui, sans-serif';
		g.fillText(it.free, 40, h - 34);
		const tex = new THREE.CanvasTexture(c);
		tex.colorSpace = THREE.SRGBColorSpace;
		tex.anisotropy = 4;
		return tex;
	}

	function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
		let line = "";
		for (const ch of text) {
			const test = line + ch;
			if (g.measureText(test).width > maxW && line) {
				g.fillText(line, x, y);
				line = ch;
				y += lh;
			} else line = test;
		}
		if (line) g.fillText(line, x, y);
	}
</script>

<Seo title="采购中心" description="站点资源采购中心：3D 陈列、客户端、模板、工具与教程。" path="/store" />

<div class="ex store">
	<header class="topbar">
		<a class="brand" href="/"><span class="seal">S</span>采购中心</a>
		<nav class="tabs" aria-label="资源分类">
			{#each tabs as t (t.k)}
				<button type="button" class:on={tab === t.k} onclick={() => pickTab(t.k)}>
					{t.zh}<small>{t.en}</small>
				</button>
			{/each}
		</nav>
		<div class="wallet">
			<span class="coin"><i aria-hidden="true">◈</i>21</span>
			<span class="coin"><i aria-hidden="true">◇</i>2,190</span>
			<a class="close" href="/" aria-label="离开采购中心">✕</a>
		</div>
	</header>

	<div class="stage-wrap">
		<div class="canvas" bind:this={stageEl} aria-hidden="true"></div>

		<aside class="hud left" aria-label="商品列表">
			<p class="hud-title">// Shelf</p>
			<ol>
				{#each list as it (it.code)}
					<li>
						<button type="button" class:cur={items.indexOf(it) === sel} onclick={() => pickItem(it)}>
							<span class="nm">{it.name}</span>
							<span class="cd">{it.code}</span>
						</button>
					</li>
				{/each}
			</ol>
		</aside>

		<aside class="hud right" aria-live="polite">
			<p class="hud-title slash">{cur.en}</p>
			<h1>{cur.name}</h1>
			<p class="note">{cur.note}</p>
			<dl class="facts">
				<div><dt>编号</dt><dd>{cur.code}</dd></div>
				<div><dt>类型</dt><dd>{cur.tag}</dd></div>
				<div><dt>获取</dt><dd>{cur.free}</dd></div>
			</dl>
			<a class="cta" href={cur.href}>前往获取 <span aria-hidden="true">→</span></a>
		</aside>

		<div class="band">
			<span class="flag">限时</span>
			<span>横向切换 · 拖动滑动 / 点击选中 · 全部开源免费</span>
			<span class="hint">// DRAG · CLICK</span>
		</div>
	</div>

	<section class="chars">
		<header class="chars-head">
			<p class="ex-eyebrow slash">Character Archive</p>
			<h2>角色档案</h2>
			<span class="ex-field">立绘动作 · 入场 / 待机</span>
		</header>
		{#each chars as c (c.key)}
			<figure class="char">
				<div class="vid">
					{#key mode[c.key]}
						<video
							src={mode[c.key] === "idle" ? c.idle : c.enter}
							autoplay
							muted
							loop
							playsinline
							preload="metadata"
						></video>
					{/key}
					<div class="cap">
						<span class="cno">{c.code}</span>
						<span class="cn">{c.zh}</span>
						<span class="cen">{c.en}</span>
					</div>
				</div>
				<div class="modes">
					<button type="button" class:on={mode[c.key] === "enter"} onclick={() => (mode[c.key] = "enter")}>入场</button>
					<button type="button" class:on={mode[c.key] === "idle"} onclick={() => (mode[c.key] = "idle")}>待机</button>
				</div>
			</figure>
		{/each}
	</section>
</div>

<style>
	.store {
		min-height: 100dvh;
		background: #0e0e0d;
		color: #ededed;
		display: flex;
		flex-direction: column;
	}
	.topbar {
		display: flex;
		align-items: center;
		gap: 1.2rem;
		padding: 0.7rem 1.2rem;
		background: #000;
		border-bottom: 1px solid #2a2a28;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--ex-font-ui, inherit);
		font-weight: 700;
		font-size: 0.9rem;
		color: #ededed;
		text-decoration: none;
	}
	.seal {
		display: inline-grid;
		place-items: center;
		width: 1.4rem;
		height: 1.4rem;
		background: #fffa00;
		color: #161616;
		font-weight: 800;
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%);
	}
	.tabs {
		display: flex;
		gap: 0.15rem;
	}
	.tabs button {
		background: none;
		border: 0;
		color: rgba(237, 237, 237, 0.55);
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.8rem;
		font-weight: 600;
		padding: 0.45rem 0.9rem;
		cursor: pointer;
		display: inline-flex;
		align-items: baseline;
		gap: 0.4rem;
	}
	.tabs button small {
		font-size: 0.54rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.65;
	}
	.tabs button.on {
		background: #fffa00;
		color: #161616;
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%);
	}
	.wallet {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
	}
	.coin i {
		font-style: normal;
		color: #fffa00;
	}
	.close {
		color: #ededed;
		text-decoration: none;
		margin-left: 0.4rem;
		opacity: 0.8;
	}
	.stage-wrap {
		position: relative;
		height: clamp(460px, 66vh, 780px);
		overflow: hidden;
		background:
			radial-gradient(120% 90% at 50% 0%, rgba(255, 250, 0, 0.06), transparent 60%),
			radial-gradient(120% 100% at 50% 100%, rgba(237, 237, 237, 0.05), transparent 55%),
			#0e0e0d;
	}
	.canvas {
		position: absolute;
		inset: 0;
	}
	.canvas :global(canvas) {
		display: block;
		width: 100% !important;
		height: 100% !important;
	}
	.hud {
		position: absolute;
		top: 0;
		bottom: 0;
		background: linear-gradient(180deg, rgba(10, 10, 9, 0.82), rgba(10, 10, 9, 0.62));
		-webkit-backdrop-filter: blur(6px);
		backdrop-filter: blur(6px);
		padding: 1rem;
		overflow-y: auto;
	}
	.hud.left {
		left: 0;
		width: 15rem;
		border-right: 1px solid #2a2a28;
	}
	.hud.right {
		right: 0;
		width: 19rem;
		border-left: 1px solid #2a2a28;
		display: flex;
		flex-direction: column;
	}
	.hud-title {
		margin: 0 0 0.7rem;
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(237, 237, 237, 0.5);
	}
	.hud.left ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.hud.left button {
		width: 100%;
		text-align: left;
		background: none;
		border: 0;
		padding: 0.55rem 0.6rem;
		cursor: pointer;
		color: rgba(237, 237, 237, 0.6);
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
		border-left: 3px solid transparent;
	}
	.hud.left button .nm {
		font-size: 0.8rem;
	}
	.hud.left button .cd {
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.58rem;
		opacity: 0.6;
	}
	.hud.left button:hover {
		color: #ededed;
	}
	.hud.left button.cur {
		color: #161616;
		background: #fffa00;
		font-weight: 700;
	}
	.hud.right h1 {
		margin: 0.2rem 0 0;
		font-family: var(--ex-font-ui, inherit);
		font-weight: 800;
		font-size: 1.5rem;
		line-height: 1.15;
		color: #ededed;
	}
	.hud.right .note {
		margin: 0.6rem 0 0;
		font-size: 0.8rem;
		line-height: 1.65;
		color: rgba(237, 237, 237, 0.62);
	}
	.facts {
		margin: 1.1rem 0 0;
		border-top: 1px solid #2a2a28;
	}
	.facts div {
		display: flex;
		justify-content: space-between;
		padding: 0.5rem 0;
		border-bottom: 1px solid #2a2a28;
	}
	.facts dt {
		font-size: 0.72rem;
		color: rgba(237, 237, 237, 0.5);
	}
	.facts dd {
		margin: 0;
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.78rem;
		color: #ededed;
	}
	.cta {
		margin-top: auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		background: #fffa00;
		color: #161616;
		font-family: var(--ex-font-ui, inherit);
		font-weight: 800;
		font-size: 0.92rem;
		text-decoration: none;
		padding: 0.85rem 1.4rem;
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
		transition: transform 0.14s var(--ex-mech, cubic-bezier(0.7, 0, 0.2, 1));
	}
	.cta:hover {
		transform: translateY(-1px);
	}
	.band {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.55rem 1rem;
		background: linear-gradient(0deg, rgba(0, 0, 0, 0.9), transparent);
		font-size: 0.72rem;
		color: rgba(237, 237, 237, 0.7);
	}
	.flag {
		background: #fffa00;
		color: #161616;
		font-family: var(--ex-font-ui, inherit);
		font-weight: 700;
		padding: 0.12rem 0.5rem;
	}
	.band .hint {
		margin-left: auto;
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		opacity: 0.45;
	}
	.chars {
		padding: 1.4rem clamp(1rem, 4vw, 2.5rem) 3rem;
		border-top: 1px solid #2a2a28;
	}
	.chars-head {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin-bottom: 1.2rem;
	}
	.chars-head h2 {
		margin: 0;
		font-family: var(--ex-font-ui, inherit);
		font-weight: 800;
		font-size: 1.4rem;
		color: #ededed;
	}
	.chars-head .ex-field {
		margin-left: auto;
	}
	.char {
		margin: 0 0 1.6rem;
	}
	.vid {
		position: relative;
		background: #000;
		border: 1px solid #2a2a28;
		overflow: hidden;
	}
	.vid video {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 1600 / 450;
		object-fit: cover;
	}
	.vid .cap {
		position: absolute;
		left: 0;
		bottom: 0;
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		padding: 1rem 1.2rem;
		background: linear-gradient(0deg, rgba(0, 0, 0, 0.75), transparent);
	}
	.cno {
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.64rem;
		color: #fffa00;
		letter-spacing: 0.1em;
	}
	.cn {
		font-family: var(--ex-font-ui, inherit);
		font-weight: 800;
		font-size: 1.15rem;
		color: #ededed;
	}
	.cen {
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.66rem;
		letter-spacing: 0.14em;
		color: rgba(237, 237, 237, 0.6);
	}
	.modes {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.5rem;
	}
	.modes button {
		background: none;
		border: 1px solid #2a2a28;
		color: rgba(237, 237, 237, 0.6);
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.74rem;
		padding: 0.35rem 0.9rem;
		cursor: pointer;
	}
	.modes button.on {
		border-color: #fffa00;
		color: #fffa00;
	}
	@media (max-width: 900px) {
		.stage-wrap {
			height: auto;
			display: flex;
			flex-direction: column;
		}
		.canvas {
			position: relative;
			height: 320px;
		}
		.hud {
			position: relative;
			width: 100%;
			border: 0;
			border-top: 1px solid #2a2a28;
		}
		.hud.right {
			width: 100%;
		}
		.band {
			position: relative;
			background: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.cta {
			transition: none;
		}
	}
</style>
