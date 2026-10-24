<script lang="ts">
	// 还原参考 110：半透明蓝图浮层 —— 玻璃面板 + 蓝图网格 + 等距爆炸示意 + 规格字段。
	// 只做展示；字段由调用方传入真实数据（缺项写 "—"）。
	let {
		eyebrow = "Spec / 结构规格",
		title,
		code = "",
		fields = [] as { k: string; v: string }[],
		note = ""
	}: {
		eyebrow?: string;
		title: string;
		code?: string;
		fields?: { k: string; v: string }[];
		note?: string;
	} = $props();
</script>

<section class="bp">
	<header class="bp-head">
		<p class="bp-eyebrow">{eyebrow}</p>
		<div class="bp-titles">
			<h3>{title}</h3>
			{#if code}<span class="bp-code">{code}</span>{/if}
		</div>
	</header>

	<div class="bp-body">
		<div class="bp-figure">
			<svg class="schematic" viewBox="0 0 360 300" aria-hidden="true">
				<line x1="180" y1="18" x2="180" y2="278" class="axis" />

				<g class="plate">
					<polygon points="180,48 268,94 180,140 92,94" />
				</g>
				<g class="plate" transform="translate(0,54)">
					<polygon points="180,48 268,94 180,140 92,94" />
				</g>
				<g class="plate" transform="translate(0,108)">
					<polygon points="180,48 268,94 180,140 92,94" />
				</g>

				<circle cx="180" cy="48" r="2.6" class="screw" />
				<circle cx="268" cy="94" r="2.6" class="screw" />
				<circle cx="180" cy="140" r="2.6" class="screw" />
				<circle cx="92" cy="94" r="2.6" class="screw" />

				<line x1="180" y1="188" x2="268" y2="234" class="plate-edge" />
				<line x1="180" y1="188" x2="92" y2="234" class="plate-edge" />
				<line x1="92" y1="234" x2="180" y2="280" class="plate-edge" />
				<line x1="268" y1="234" x2="180" y2="280" class="plate-edge" />

				<line x1="64" y1="48" x2="64" y2="280" class="dim" />
				<line x1="58" y1="48" x2="70" y2="48" class="dim" />
				<line x1="58" y1="280" x2="70" y2="280" class="dim" />
				<text x="52" y="168" class="dimtxt" transform="rotate(-90 52 168)">3 PLATES</text>

				<line x1="268" y1="94" x2="322" y2="74" class="leader" />
				<circle cx="322" cy="74" r="2" class="dot" />
				<text x="328" y="72" class="callout">PLATE-A</text>

				<line x1="92" y1="202" x2="40" y2="182" class="leader" />
				<circle cx="40" cy="182" r="2" class="dot" />
				<text x="8" y="176" class="callout">SEC-B</text>
			</svg>
		</div>

		<div class="bp-specs">
			<dl>
				{#each fields as f, i (f.k + i)}
					<div class="row">
						<dt>{f.k}</dt>
						<dd>{f.v}</dd>
					</div>
				{/each}
			</dl>
			{#if note}<p class="bp-note">{note}</p>{/if}
		</div>
	</div>
</section>

<style>
	.bp {
		position: relative;
		background: color-mix(in srgb, var(--ex-ink, #161616) 78%, transparent);
		-webkit-backdrop-filter: blur(12px);
		backdrop-filter: blur(12px);
		border: 1px solid color-mix(in srgb, var(--ex-paper, #f4f4f2) 22%, transparent);
		color: var(--ex-paper, #f4f4f2);
		padding: 1.1rem 1.2rem 1.2rem;
		overflow: hidden;
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
	}
	/* 蓝图网格 */
	.bp::before {
		content: "";
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(to right, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
			linear-gradient(to bottom, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
		background-size: 22px 22px;
		pointer-events: none;
	}
	.bp > * {
		position: relative;
	}
	.bp-head {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.14);
		padding-bottom: 0.7rem;
	}
	.bp-eyebrow {
		margin: 0;
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(244, 244, 242, 0.55);
	}
	.bp-titles {
		display: flex;
		align-items: baseline;
		gap: 0.7rem;
	}
	.bp-titles h3 {
		margin: 0;
		font-family: var(--ex-font-ui, inherit);
		font-weight: 800;
		font-size: 1.05rem;
		color: #f4f4f2;
	}
	.bp-code {
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		color: #fffa00;
		font-variant-numeric: tabular-nums;
	}
	.bp-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1rem;
		margin-top: 0.6rem;
		align-items: center;
	}
	.bp-figure {
		min-width: 0;
	}
	.schematic {
		width: 100%;
		height: auto;
		display: block;
	}
	.schematic .axis {
		stroke: rgba(255, 255, 255, 0.35);
		stroke-width: 1;
		stroke-dasharray: 3 6;
	}
	.schematic .plate polygon {
		fill: rgba(255, 250, 0, 0.05);
		stroke: rgba(255, 255, 255, 0.6);
		stroke-width: 1.2;
	}
	.schematic .plate-edge {
		stroke: rgba(255, 255, 255, 0.28);
		stroke-width: 1;
	}
	.schematic .screw {
		fill: #fffa00;
		stroke: none;
	}
	.schematic .dim,
	.schematic .leader {
		stroke: rgba(255, 250, 0, 0.6);
		stroke-width: 1;
	}
	.schematic .dot {
		fill: #fffa00;
		stroke: none;
	}
	.dimtxt,
	.callout {
		fill: rgba(244, 244, 242, 0.65);
		font-family: var(--ex-font-ui, inherit);
		font-size: 8px;
		letter-spacing: 0.08em;
		stroke: none;
	}
	.bp-specs dl {
		margin: 0;
		display: flex;
		flex-direction: column;
	}
	.bp-specs .row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.8rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}
	.bp-specs dt {
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.68rem;
		color: rgba(244, 244, 242, 0.5);
		white-space: nowrap;
	}
	.bp-specs dd {
		margin: 0;
		font-family: var(--ex-font-ui, inherit);
		font-size: 0.74rem;
		color: #f4f4f2;
		text-align: right;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.bp-note {
		margin: 0.7rem 0 0;
		font-size: 0.68rem;
		line-height: 1.6;
		color: rgba(244, 244, 242, 0.5);
	}
	@media (max-width: 640px) {
		.bp-body {
			grid-template-columns: 1fr;
		}
	}
</style>
