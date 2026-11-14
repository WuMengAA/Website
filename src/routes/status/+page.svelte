<script lang="ts">
	// ══════════════════════════════════════════════════════════════════════
	//  数据区：替换这里即可接入真实监控（Better Stack / 自建探针 / UptimeRobot…）
	//  本页仅用站点设计令牌（bg-background / text-foreground / text-primary /
	//  border-border / bg-card）渲染，自动继承「克劳德风格」主题。
	// ══════════════════════════════════════════════════════════════════════
	let { data } = $props();
	const siteName = (data as any)?.settings?.title ?? "Stelarith";

	const updated = "Last updated on Nov 14, 2026 at 8:02am UTC";
	const allOperational = true;

	const monitors = [
		{ name: "主站 / 博客", status: "up" as const, uptime: "99.98% uptime" },
		{ name: "API 网关", status: "up" as const, uptime: "99.95% uptime" },
		{ name: "图床 / 静态资源", status: "up" as const, uptime: "100.00% uptime" },
	];

	// 90 天刻度：键 = 距今天数（0 = 今天），值 = 状态；缺省为 up
	const history: Record<number, "up" | "down" | "maint" | "deg"> = {
		0: "down", 3: "down", 14: "down", 21: "down", 28: "down",
		39: "down", 45: "down", 54: "maint", 62: "down", 69: "down",
		74: "down", 82: "down", 88: "down",
	};
	const ticks = Array.from({ length: 90 }, (_, i) => history[89 - i] ?? "up");

	const rawIncidents = [
		{ date: "Nov 14, 2026", type: "down", title: "计划外停机", duration: "1 hour 14 minutes" },
		{ date: "Nov 12, 2026", type: "down", title: "计划外停机", duration: "2 hours 47 minutes" },
		{ date: "Nov 11, 2026", type: "down", title: "计划外停机", duration: "6 hours 32 minutes" },
		{ date: "Oct 31, 2026", type: "down", title: "计划外停机", duration: "5 minutes" },
		{ date: "Oct 21, 2026", type: "maint", title: "硬件升级", duration: "4 hours" },
		{ date: "Oct 16, 2026", type: "down", title: "计划外停机", duration: "43 minutes" },
		{ date: "Oct 06, 2026", type: "down", title: "计划外停机", duration: "3 minutes" },
		{ date: "Sep 20, 2026", type: "maint", title: "重大架构升级", duration: "8 hours 39 minutes" },
		{ date: "Sep 07, 2026", type: "down", title: "计划外停机", duration: "1 day" },
		{ date: "Sep 06, 2026", type: "down", title: "计划外停机", duration: "21 hours 25 minutes" },
		{ date: "Sep 05, 2026", type: "down", title: "计划外停机", duration: "6 hours 30 minutes" },
		{ date: "Aug 18, 2026", type: "down", title: "计划外停机", duration: "3 minutes" },
	];

	// 按日期分组（日期降序）
	const groups = (() => {
		const map = new Map<string, typeof rawIncidents>();
		for (const it of rawIncidents) {
			if (!map.has(it.date)) map.set(it.date, []);
			map.get(it.date)!.push(it);
		}
		return [...map.entries()].map(([date, items]) => ({ date, items }));
	})();

	function tickColor(s: string): string {
		switch (s) {
			case "down": return "var(--destructive-solid)";
			case "maint": return "var(--primary)";
			case "deg": return "var(--warning)";
			default: return "var(--success)";
		}
	}
</script>

<svelte:head>
	<title>站点状态 · {siteName}</title>
	<meta name="description" content="{siteName} 服务状态与历史事故记录" />
</svelte:head>

<main class="mx-auto max-w-[802px] px-5 py-14">
	<!-- 状态头部 -->
	<header class="text-center">
		<div
			class="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-primary/15 text-primary"
		>
			{#if allOperational}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-8 w-8">
					<path d="M5 13l4 4L19 7" />
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-8 w-8">
					<path d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.7 3h16.96a2 2 0 0 0 1.7-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
				</svg>
			{/if}
		</div>
		<h1 class="font-heading text-3xl font-semibold tracking-tight text-foreground">
			{allOperational ? "All systems operational" : "Some systems disrupted"}
		</h1>
		<p class="mt-2 text-sm font-medium text-muted-foreground">{updated}</p>
	</header>

	<!-- 监控组件 -->
	<section class="mt-10 space-y-3">
		{#each monitors as m}
			<div class="rounded-xl border border-border bg-card p-4">
				<div class="flex items-center gap-2 font-semibold">
					<span
						class="h-2.5 w-2.5 shrink-0 rounded-full"
						class:bg-primary={m.status === "up"}
						class:bg-destructive-solid={m.status !== "up"}
					></span>
					<span class="min-w-0 flex-1 truncate text-foreground">{m.name}</span>
					<span class="shrink-0 text-sm font-semibold text-primary">{m.uptime}</span>
				</div>
				<div class="mt-4 flex h-8 gap-[2px]">
					{#each ticks as t}
						<div
							class="flex-1 rounded-[1px] transition-opacity hover:opacity-60"
							style="background-color: {tickColor(t)}"
							title={t}
						></div>
					{/each}
				</div>
				<div class="mt-2 flex justify-between text-xs text-muted-foreground">
					<span>90 days ago</span>
					<span>Today</span>
				</div>
			</div>
		{/each}
	</section>

	<!-- 事件历史 -->
	<h2 class="mb-3 mt-12 text-xs font-bold uppercase tracking-wider text-muted-foreground">
		Incident history
	</h2>
	<div class="space-y-3">
		{#each groups as g}
			<div class="overflow-hidden rounded-xl border border-border bg-card">
				<div class="border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground">
					{g.date}
				</div>
				{#each g.items as it}
					<div class="flex items-center gap-3 px-4 py-3 {it === g.items[g.items.length - 1] ? '' : 'border-b border-border'}">
						{#if it.type === "down"}
							<svg viewBox="0 0 24 24" fill="none" stroke="var(--destructive-solid)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 shrink-0">
								<path d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.7 3h16.96a2 2 0 0 0 1.7-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
							</svg>
						{:else}
							<svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 shrink-0">
								<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.1-.4-.4-2.1 2.4-2.3Z" />
							</svg>
						{/if}
						<span class="flex-1 font-semibold text-foreground">{it.title}</span>
						<span class="shrink-0 text-xs font-semibold text-muted-foreground">{it.duration}</span>
					</div>
				{/each}
			</div>
		{/each}
	</div>

	<p class="mt-10 text-center text-xs text-muted-foreground">
		Powered by <span class="text-primary">{siteName}</span> · 状态页仿制自 status.2x.nz
	</p>
</main>
