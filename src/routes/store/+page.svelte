<script lang="ts">
	// 采购中心 · 3D 透视队列（还原参考 192：等阶晋升的斜向卡片队列 + 冰蓝弧光）。
	// 变体：coldstore（ice 强调 / cool 纸 / grid 地面 / calm），符合 skill 的变体体系。
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

	const cur = $derived<Item>(items[sel] ?? items[0]);

	let stageEl: HTMLDivElement | undefined = $state();
	let api: any = null;

	function pickTab(k: string) {
		tab = k;
		const first = items.findIndex((i) => k === "featured" || i.group === k);
		if (first >= 0) sel = first;
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
		scene.fog = new THREE.Fog(0xeef1f4, 12, 27);

		const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 120);
		camera.position.set(2.9, 1.9, 10.4);
		camera.lookAt(-0.8, 0.3, -1.7);

		// 网格地面（coldstore 的 grid）
		const grid = new THREE.GridHelper(60, 60, 0xaeb8c2, 0xd3d9e0);
		grid.position.y = -1.95;
		scene.add(grid);

		const N = data.length;
		const STEP_X = 1.6;
		const STEP_Y = 0.5;
		const STEP_Z = 1.75;
		const panels: any[] = [];
		data.forEach((it, i) => {
			const mat = new THREE.MeshBasicMaterial({
				map: cardTexture(THREE, it, i),
				transparent: true,
				depthWrite: false
			});
			const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.95, 1.86), mat);
			mesh.rotation.set(0.14, -0.38, 0);
			mesh.userData.index = i;
			scene.add(mesh);
			panels.push(mesh);
		});

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
			focus -= dx * 0.0042;
			focus = Math.max(-0.5, Math.min(N - 1 + 0.5, focus));
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
			const hits = ray.intersectObjects(panels.filter((p) => p.visible), false);
			if (hits.length) {
				const idx = hits[0].object.userData.index;
				select(idx);
				onPick(idx);
			}
		}
		elCanvas.addEventListener("click", onClick);

		function tick() {
			raf = requestAnimationFrame(tick);
			focus += (focusTarget - focus) * 0.11;
			for (let i = 0; i < panels.length; i++) {
				const p = panels[i];
				const d = i - focus;
				p.position.set(d * STEP_X - 1.05, d * STEP_Y - 0.55, -d * STEP_Z);
				p.rotation.set(0.14, -0.38, 0);
				const near = Math.abs(d) < 0.5;
				const s = near ? 1.06 : 1;
				p.scale.set(s, s, s);
				const op = d < 0 ? Math.max(0, 1 + d * 2.6) : 1 - Math.min(0.8, d * 0.16);
				p.material.opacity = op;
				p.visible = op > 0.02;
				p.renderOrder = 100 - Math.round(d * 4);
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

	// 深色玻璃卡 + 冰蓝弧光（还原 192 的卡面）
	function cardTexture(THREE: any, it: Item, i: number) {
		const w = 760;
		const h = 480;
		const c = document.createElement("canvas");
		c.width = w;
		c.height = h;
		const g = c.getContext("2d")!;

		const grad = g.createLinearGradient(0, 0, 0, h);
		grad.addColorStop(0, "rgba(27,30,34,0.97)");
		grad.addColorStop(1, "rgba(11,13,16,0.97)");
		g.fillStyle = grad;
		g.fillRect(0, 0, w, h);

		// 右下等高线质感
		g.strokeStyle = "rgba(255,255,255,0.05)";
		g.lineWidth = 1;
		for (let r = 36; r < 340; r += 17) {
			g.beginPath();
			g.arc(w - 100, h - 26, r, Math.PI, Math.PI * 1.5);
			g.stroke();
		}

		// 边框
		g.strokeStyle = "rgba(255,255,255,0.2)";
		g.lineWidth = 2;
		g.strokeRect(1, 1, w - 2, h - 2);

		// 冰蓝弧光（顶部括号）
		g.strokeStyle = "#37c3f0";
		g.lineWidth = 34;
		g.lineCap = "round";
		g.beginPath();
		g.moveTo(64, 172);
		g.quadraticCurveTo(64, 66, 178, 66);
		g.lineTo(w - 178, 66);
		g.quadraticCurveTo(w - 64, 66, w - 64, 172);
		g.stroke();

		// 右上圆形徽记
		g.strokeStyle = "rgba(255,255,255,0.5)";
		g.lineWidth = 3;
		g.beginPath();
		g.arc(w - 100, 124, 22, 0, Math.PI * 2);
		g.stroke();
		g.fillStyle = "#37c3f0";
		g.beginPath();
		g.arc(w - 100, 124, 8, 0, Math.PI * 2);
		g.fill();

		// 左下六边形图标
		g.strokeStyle = "rgba(255,255,255,0.4)";
		g.lineWidth = 3;
		const hx = 96;
		const hy = h - 92;
		const hr = 26;
		g.beginPath();
		for (let k = 0; k < 6; k++) {
			const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
			const px = hx + Math.cos(a) * hr;
			const py = hy + Math.sin(a) * hr;
			if (k) g.lineTo(px, py);
			else g.moveTo(px, py);
		}
		g.closePath();
		g.stroke();

		// 文本
		g.fillStyle = "#8b939c";
		g.font = '600 22px "Saira", system-ui, sans-serif';
		g.fillText(it.code, 64, 218);

		g.fillStyle = "#f2f5f7";
		g.font = '800 40px "Saira", system-ui, sans-serif';
		wrap(g, it.name, 64, 272, w - 128, 48);

		g.fillStyle = "rgba(55,195,240,0.16)";
		g.fillRect(64, 352, 156, 38);
		g.strokeStyle = "rgba(55,195,240,0.6)";
		g.lineWidth = 1.5;
		g.strokeRect(64, 352, 156, 38);
		g.fillStyle = "#7fe0ff";
		g.font = '700 20px "Saira", system-ui, sans-serif';
		g.fillText(it.tag, 78, 378);

		g.fillStyle = "#f2f5f7";
		g.font = '800 26px "Saira", system-ui, sans-serif';
		g.textAlign = "right";
		g.fillText(it.free, w - 64, h - 56);
		g.textAlign = "left";

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

<Seo title="采购中心" description="站点资源采购中心：3D 透视陈列、客户端、模板、工具与教程。" path="/store" />

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
		<div class="util">
			<span class="meta">共 {items.length} 项 · 开源免费</span>
			<a class="close" href="/" aria-label="离开采购中心">✕</a>
		</div>
	</header>

	<div class="stage-wrap">
		<div class="canvas" bind:this={stageEl} aria-hidden="true"></div>

		<!-- 左上：当前等阶式读数 -->
		<div class="hud-tl">
			<p class="eyebrow slash">Procurement / 采购中心</p>
			<p class="cap">当前选中</p>
			<div class="big">
				<span class="num">{String(sel + 1).padStart(2, "0")}</span>
				<span class="of">/ {String(items.length).padStart(2, "0")}</span>
			</div>
			<p class="pname">{cur.name}<span class="pen">{cur.en}</span></p>
			<p class="pfields">{cur.code} <i aria-hidden="true">│</i> {cur.tag} <i aria-hidden="true">│</i> {cur.free}</p>
		</div>

		<!-- 右侧：等阶式索引栏 -->
		<aside class="ladder" aria-label="资源索引">
			<ol>
				{#each items as it, i (it.code)}
					<li>
						<button type="button" class:cur={i === sel} onclick={() => (sel = i)}>
							<span class="ln">{String(i + 1).padStart(2, "0")}</span>
							<span class="lc">{it.code}</span>
						</button>
					</li>
				{/each}
			</ol>
			<div class="ladder-big">
				<span class="pill">当前选择</span>
				<b>{String(sel + 1).padStart(2, "0")}</b>
			</div>
		</aside>

		<!-- 右下：获取 -->
		<div class="hud-br">
			<span class="free">{cur.free}</span>
			<a class="cta" href={cur.href}>前往获取 <span aria-hidden="true">→</span></a>
		</div>

		<div class="band">
			<span class="flag">透视队列</span>
			<span>拖动切换 / 点击卡片选中</span>
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
		background: #eef1f4;
		color: #16181a;
		display: flex;
		flex-direction: column;
		--ice: #2fb9f0;
		--ice-ink: #06202b;
	}
	.topbar {
		display: flex;
		align-items: center;
		gap: 1.2rem;
		padding: 0.7rem 1.2rem;
		background: #f7f9fa;
		border-bottom: 1px solid #d5dbe1;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--ex-font-ui, inherit);
		font-weight: 700;
		font-size: 0.9rem;
		color: #16181a;
		text-decoration: none;
	}
	.seal {
		display: inline-grid;
		place-items: center;
		width: 1.4rem;
		height: 1.4rem;
		background: var(--ice);
		color: var(--ice-ink);
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
		color: #6c757e;
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
		opacity: 0.6;
	}
	.tabs button.on {
		background: var(--ice);
		color: var(--ice-ink);
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%);
	}
	.util {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.8rem;
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.72rem;
		color: #7b848d;
		font-variant-numeric: tabular-nums;
	}
	.close {
		color: #16181a;
		text-decoration: none;
		opacity: 0.7;
	}

	.stage-wrap {
		position: relative;
		height: clamp(500px, 70vh, 840px);
		overflow: hidden;
		background:
			radial-gradient(90% 70% at 72% 8%, #ffffff 0%, #eef1f4 46%, #dde3e9 100%);
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

	.hud-tl {
		position: absolute;
		left: clamp(1rem, 3vw, 2.2rem);
		top: clamp(0.9rem, 2.4vw, 1.6rem);
		max-width: 22rem;
		pointer-events: none;
	}
	.eyebrow {
		margin: 0;
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.64rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #6c757e;
	}
	.cap {
		margin: 1rem 0 0;
		font-size: 0.72rem;
		color: #5f6871;
	}
	.big {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-top: 0.1rem;
	}
	.big .num {
		font-family: var(--ex-font-ui, inherit);
		font-weight: 800;
		font-size: clamp(2.4rem, 5vw, 3.6rem);
		line-height: 0.95;
		color: #16181a;
		font-variant-numeric: tabular-nums;
	}
	.big .of {
		font-family: var(--ex-font-ui, inherit);
		font-weight: 600;
		font-size: 0.9rem;
		color: #7b848d;
		font-variant-numeric: tabular-nums;
	}
	.pname {
		margin: 0.5rem 0 0;
		font-family: var(--ex-font-ui, inherit);
		font-weight: 800;
		font-size: 1.15rem;
		color: #16181a;
	}
	.pname .pen {
		margin-left: 0.5rem;
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #7b848d;
	}
	.pfields {
		margin: 0.35rem 0 0;
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.7rem;
		color: #5f6871;
		font-variant-numeric: tabular-nums;
	}
	.pfields i {
		font-style: normal;
		opacity: 0.4;
		margin: 0 0.2rem;
	}

	.ladder {
		position: absolute;
		right: 0;
		top: 0;
		bottom: 0;
		width: 7.5rem;
		padding: 1rem 0.9rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: flex-end;
		gap: 0.1rem;
		pointer-events: none;
	}
	.ladder ol {
		list-style: none;
		margin: 0;
		padding: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
	}
	.ladder button {
		width: 100%;
		display: flex;
		justify-content: flex-end;
		align-items: baseline;
		gap: 0.4rem;
		background: none;
		border: 0;
		cursor: pointer;
		padding: 0.14rem 0.45rem;
		font-family: var(--ex-font-ui, inherit);
		color: #97a0a8;
		pointer-events: auto;
	}
	.ladder .ln {
		font-size: 0.95rem;
		font-variant-numeric: tabular-nums;
	}
	.ladder .lc {
		font-size: 0.56rem;
		opacity: 0.6;
	}
	.ladder button:hover {
		color: #16181a;
	}
	.ladder button.cur {
		background: #16181a;
		color: #fff;
	}
	.ladder-big {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.6rem;
	}
	.ladder-big .pill {
		background: #16181a;
		color: #fff;
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.6rem;
		padding: 0.12rem 0.4rem;
	}
	.ladder-big b {
		font-family: var(--ex-font-ui, inherit);
		font-weight: 800;
		font-size: 2.6rem;
		line-height: 1;
		color: #16181a;
		font-variant-numeric: tabular-nums;
	}

	.hud-br {
		position: absolute;
		right: clamp(1rem, 3vw, 2.2rem);
		bottom: 1.1rem;
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.free {
		font-family: var(--ex-font-ui, inherit);
		font-weight: 800;
		font-size: 1.15rem;
		color: #16181a;
	}
	.cta {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--ice);
		color: var(--ice-ink);
		font-family: var(--ex-font-ui, inherit);
		font-weight: 800;
		font-size: 0.9rem;
		text-decoration: none;
		padding: 0.75rem 1.5rem;
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
		transition: transform 0.14s var(--ex-mech, cubic-bezier(0.7, 0, 0.2, 1));
	}
	.cta:hover {
		transform: translateY(-1px);
	}
	.band {
		position: absolute;
		left: clamp(1rem, 3vw, 2.2rem);
		bottom: 1.1rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.7rem;
		color: #6c757e;
	}
	.flag {
		background: #16181a;
		color: #fff;
		font-family: var(--ex-font-ui, inherit);
		font-weight: 700;
		padding: 0.12rem 0.45rem;
	}
	.band .hint {
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.58rem;
		letter-spacing: 0.14em;
		opacity: 0.5;
	}

	.chars {
		background: #0b0b0c;
		color: #ededed;
		padding: 1.4rem clamp(1rem, 4vw, 2.5rem) 3rem;
		border-top: 1px solid #22252a;
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
		border: 1px solid #22252a;
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
		color: #7fe0ff;
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
		border: 1px solid #22252a;
		color: rgba(237, 237, 237, 0.6);
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.74rem;
		padding: 0.35rem 0.9rem;
		cursor: pointer;
	}
	.modes button.on {
		border-color: #7fe0ff;
		color: #7fe0ff;
	}

	@media (max-width: 900px) {
		.stage-wrap {
			height: 360px;
		}
		.ladder {
			width: 5.5rem;
			padding: 0.6rem;
		}
		.ladder .lc {
			display: none;
		}
		.ladder-big b {
			font-size: 1.8rem;
		}
		.hud-tl {
			max-width: 60%;
		}
		.big .num {
			font-size: 2.2rem;
		}
		.hud-br {
			bottom: 0.8rem;
		}
		.band {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.cta {
			transition: none;
		}
	}
</style>
