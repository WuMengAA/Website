<script lang="ts">
	// 站点索引 · 径向菜单（还原参考 191：中心读数 + 环形入口 + 右侧等阶式索引）。
	// 数据全部来自真实内容：导航条目与各分区计数由 +page.server.ts 注入。
	import "../endfield-kit.css";
	import Seo from "$lib/components/Seo.svelte";
	import LevelBoard from "$lib/components/endfield/level-board.svelte";

	let { data }: { data: any } = $props();

	const items = $derived(
		[...(data.nav?.workspace ?? []), ...(data.nav?.more ?? [])].filter((x: any) => x && x.url)
	);

	function cnt(u: string): number | null {
		if (u.startsWith("/posts")) return data.counts.posts;
		if (u.startsWith("/projects")) return data.counts.projects;
		if (u.startsWith("/docs")) return data.counts.docs;
		if (u.startsWith("/pages")) return data.counts.pages;
		return null;
	}
	const isExt = (u: string) => /^https?:/.test(u);
</script>

<Seo title="站点索引" description="全站入口的径向索引，附真实内容计数与内容等阶。" path="/index" />

<div class="ex map">
	<header class="head">
		<a class="brand" href="/"><span class="seal">S</span>站点索引</a>
		<p class="eyebrow slash">Index / Radial</p>
		<a class="back" href="/">← 返回首页</a>
	</header>

	<div class="stage">
		<svg class="rings" viewBox="0 0 1000 1000" aria-hidden="true">
			<circle cx="500" cy="500" r="180" />
			<circle cx="500" cy="500" r="300" />
			<circle cx="500" cy="500" r="420" />
			<circle cx="500" cy="500" r="530" class="faint" />
		</svg>

		<div class="core">
			<p class="ceyebrow">// SITE INDEX</p>
			<h1>STELARITH</h1>
			<p class="cstats">{data.total} 项内容 <i aria-hidden="true">│</i> {items.length} 个入口</p>
		</div>

		{#each items as it, i (it.url + i)}
			{@const a = -90 + i * (360 / Math.max(1, items.length))}
			<div class="orbit" style="--a:{a}deg">
				<a
					class="node"
					href={it.url}
					style="--a:{a}deg"
					class:ext={isExt(it.url)}
					target={isExt(it.url) ? "_blank" : undefined}
					rel={isExt(it.url) ? "noopener noreferrer" : undefined}
				>
					<span class="zh">{it.title}</span>
					{#if cnt(it.url) !== null}<span class="c">{cnt(it.url)}</span>{/if}
					<span class="dot" aria-hidden="true"></span>
				</a>
			</div>
		{/each}
	</div>

	<section class="rank">
		<div class="rank-head">
			<p class="ex-eyebrow slash">Content Rank / 内容等阶</p>
			<h2>累积内容</h2>
			<span class="ex-field">按已入库条目计算 · 每 10 项升一阶</span>
		</div>
		<div class="dark">
			<LevelBoard
				eyebrow="Content Rank / 内容等阶"
				title="累积内容"
				level={data.level}
				cur={data.cur}
				max={data.max}
				rewardLabel="下一等阶"
				rewardFrom={data.level}
				rewardTo={Math.min(9, data.level + 1)}
			/>
		</div>
		<ul class="counts">
			<li><span>文章</span><b>{data.counts.posts}</b></li>
			<li><span>项目</span><b>{data.counts.projects}</b></li>
			<li><span>教程</span><b>{data.counts.docs}</b></li>
			<li><span>页面</span><b>{data.counts.pages}</b></li>
		</ul>
	</section>
</div>

<style>
	.map {
		min-height: 100dvh;
		background: #0e0e0d;
		color: #ededed;
		display: flex;
		flex-direction: column;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.7rem 1.2rem;
		border-bottom: 1px solid #24262a;
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
	.head .eyebrow {
		margin: 0;
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.6rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(237, 237, 237, 0.45);
	}
	.back {
		margin-left: auto;
		color: rgba(237, 237, 237, 0.7);
		text-decoration: none;
		font-size: 0.72rem;
	}

	.stage {
		position: relative;
		flex: 1;
		min-height: 620px;
		overflow: hidden;
	}
	.rings {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 78vmin;
		height: 78vmin;
		transform: translate(-50%, -50%);
		opacity: 0.5;
	}
	.rings circle {
		fill: none;
		stroke: rgba(237, 237, 237, 0.14);
		stroke-width: 1;
		stroke-dasharray: 3 7;
	}
	.rings circle.faint {
		stroke: rgba(255, 250, 0, 0.16);
	}

	.core {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		width: min(24rem, 60vw);
	}
	.ceyebrow {
		margin: 0;
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.6rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(237, 237, 237, 0.5);
	}
	.core h1 {
		margin: 0.3rem 0 0;
		font-family: var(--ex-font-ui, inherit);
		font-weight: 800;
		font-stretch: 125%;
		font-size: clamp(1.8rem, 4.6vw, 3rem);
		letter-spacing: 0.02em;
		color: #ededed;
		line-height: 1;
	}
	.cstats {
		margin: 0.6rem 0 0;
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.7rem;
		color: rgba(237, 237, 237, 0.55);
		font-variant-numeric: tabular-nums;
	}
	.cstats i {
		font-style: normal;
		opacity: 0.4;
		margin: 0 0.3rem;
	}

	.orbit {
		position: absolute;
		inset: 0;
		transform: rotate(var(--a));
		pointer-events: none;
	}
	.node {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%) translateY(calc(var(--r, 30vmin) * -1)) rotate(calc(var(--a) * -1));
		pointer-events: auto;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.42rem 0.7rem;
		text-decoration: none;
		color: rgba(237, 237, 237, 0.8);
		background: rgba(20, 22, 25, 0.82);
		border: 1px solid #2b2e33;
		white-space: nowrap;
		transition: background 0.16s var(--ex-mech, cubic-bezier(0.7, 0, 0.2, 1)), color 0.16s,
			border-color 0.16s;
	}
	.node .zh {
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.78rem;
		font-weight: 600;
	}
	.node .c {
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.6rem;
		color: rgba(237, 237, 237, 0.45);
		font-variant-numeric: tabular-nums;
	}
	.node .dot {
		width: 5px;
		height: 5px;
		background: #fffa00;
		opacity: 0;
	}
	.node:hover,
	.node:focus-visible {
		background: #fffa00;
		color: #161616;
		border-color: #fffa00;
		outline: none;
	}
	.node:hover .c,
	.node:focus-visible .c {
		color: rgba(22, 22, 22, 0.6);
	}
	.node:hover .dot,
	.node:focus-visible .dot {
		opacity: 1;
		background: #161616;
	}
	.node.ext::after {
		content: "↗";
		font-size: 0.6rem;
		opacity: 0.6;
	}

	.rank {
		border-top: 1px solid #24262a;
		padding: 1.6rem clamp(1rem, 4vw, 2.5rem) 3rem;
		background: #0b0b0c;
	}
	.rank-head {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	.rank-head h2 {
		margin: 0;
		font-family: var(--ex-font-ui, inherit);
		font-weight: 800;
		font-size: 1.3rem;
		color: #ededed;
	}
	.rank-head .ex-field {
		margin-left: auto;
	}
	.rank .dark {
		max-width: 52rem;
	}
	.counts {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1rem 0 0;
		padding: 0;
	}
	.counts li {
		display: inline-flex;
		align-items: baseline;
		gap: 0.5rem;
		border: 1px solid #2b2e33;
		padding: 0.35rem 0.7rem;
		font-size: 0.72rem;
		color: rgba(237, 237, 237, 0.6);
	}
	.counts b {
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.9rem;
		color: #ededed;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 860px) {
		.stage {
			min-height: 0;
			padding: 1rem;
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
		}
		.rings,
		.core {
			display: none;
		}
		.orbit {
			position: static;
			inset: auto;
			transform: none;
			pointer-events: auto;
		}
		.node {
			position: static;
			transform: none;
			display: flex;
			justify-content: space-between;
			width: 100%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.node {
			transition: none;
		}
	}
</style>
