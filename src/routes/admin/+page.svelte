<script lang="ts">
	/**
	 * 后台仪表盘 —— 「显示效果与按键位置布局」的落点。
	 *
	 * 三处改造：
	 *  1. 统计卡改为「图标 + 数值 + 标签」三段式，并按组归类（内容 / 互动）——
	 *     原本 9 个同质灰卡铺满一屏，扫读成本很高、也看不出轻重。
	 *  2. 响应式栅格：手机 2 列 / 平板 3 列 / 宽屏 4 列，不再固定 2 列。
	 *  3. 快速操作用带图标的按钮，位置遵循「页头右侧 + 底部网格」的站内按键约定。
	 */
	import { onMount } from "svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import {
		RefreshCw, BookOpen, Rocket, BookMarked, Image, MessageSquare, Megaphone,
		Flag, FileText, Eye, Plus, Upload, FolderOpen, LayoutTemplate, ScanEye, School
	} from "@lucide/svelte";
	import { can, userCan, levelLabelOfXp, type Role, type Action } from "$lib/permissions.js";
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	let postsCount = $state(0);
	let projectsCount = $state(0);
	let docsCount = $state(0);
	let mediaCount = $state(0);
	let commentsCount = $state(0);
	let announcementsCount = $state(0);
	let feedbackCount = $state(0);
	let pagesCount = $state(0);
	let pvToday = $state(0);
	let pvTotal = $state(0);
	let loading = $state(false);
	let ready = $state(false);

	// 权限：仪表盘上每个入口都按能力显隐，避免"看得见、点进去 403"
	const role = $derived(((data as any)?.user?.role ?? null) as Role | null);
	const canContent = $derived(userCan(data.user as any, "manageContent"));
	const canPages = $derived(userCan(data.user as any, "managePages"));
	const canModerate = $derived(userCan(data.user as any, "moderate"));
	// 经验等级（#248：xp→Lv 纯展示，与权限无关）。
	const levelLabel = $derived(levelLabelOfXp((data.user as any)?.xp ?? 0));

	async function loadStats() {
		loading = true;
		try {
			const [p, pr, d, m, c, a, f, pg, s, b] = await Promise.all([
				fetch("/api/posts"),
				fetch("/api/projects"),
				fetch("/api/docs"),
				fetch("/api/media"),
				fetch("/api/comments?all=1"),
				fetch("/api/announcements?all=1"),
				fetch("/api/feedback"),
				fetch("/api/pages"),
				fetch("/api/stats?days=7"),
				fetch("/api/project-board")
			]);
			// 逐项容错：某个接口 403（当前角色无该模块权限）不该让整页统计归零
			const num = async (r: Response) => {
				if (!r.ok) return 0;
				try { const j = await r.json(); return Array.isArray(j) ? j.length : 0; } catch { return 0; }
			};
			postsCount = await num(p);
			projectsCount = await num(pr);
			docsCount = await num(d);
			mediaCount = await num(m);
			commentsCount = await num(c);
			announcementsCount = await num(a);
			feedbackCount = await num(f);
			pagesCount = await num(pg);
			try {
				const stats = s.ok ? await s.json() : {};
				pvToday = stats.today || 0;
				pvTotal = stats.total || 0;
			} catch { /* noop */ }
			try {
				const bj = b.ok ? await b.json() : null;
				gh = bj?.github ?? null;
				const bound = (bj?.boards ?? []).filter((x: any) => x.repo);
				lastSync = bound.length
					? { repo: bound[0].repo, error: bound[0].sync?.error, at: bound[0].sync?.at }
					: null;
			} catch { /* noop */ }
		} catch (e) {
			console.error(e);
		}
		loading = false;
		ready = true;
	}

	// GitHub 同步链路体检（配额 / 是否在冷却），与后台展板页同一数据源。
	let gh = $state<{ hasToken: boolean; quotaPerHour?: number; coolingUntil?: string | null } | null>(null);
	// 最近一次同步的结果。同步挂了必须能在仪表盘一眼看见 ——
	// 否则只有点进「项目展板」才看得到报错，而那里平时没人去。
	let lastSync = $state<{ repo: string; error?: string; at?: string } | null>(null);

	/** 统计卡定义：分组 + 所需能力（无权限的卡整张不渲染）。
	 *  `get: null` 表示这一项没有可统计的数量（纯入口），渲染成「—」——
	 *  而不是像以前那样写 `() => 1`：那个 1 是凭空编的，看着像「有 1 条」，
	 *  实际什么都没统计，只会误导。 */
	const CARDS: { group: string; title: string; href: string; icon: any; get: (() => number) | null; need: Action }[] = [
		{ group: "内容", title: "博客文章", href: "/admin/posts", icon: BookOpen, get: () => postsCount, need: "manageContent" },
		{ group: "内容", title: "项目", href: "/admin/projects", icon: Rocket, get: () => projectsCount, need: "manageContent" },
		{ group: "内容", title: "教程", href: "/admin/docs", icon: BookMarked, get: () => docsCount, need: "manageContent" },
		{ group: "内容", title: "页面", href: "/admin/pages", icon: FileText, get: () => pagesCount, need: "managePages" },
		{ group: "内容", title: "媒体文件", href: "/admin/media", icon: Image, get: () => mediaCount, need: "manageFiles" },
		{ group: "互动", title: "评论", href: "/admin/comments", icon: MessageSquare, get: () => commentsCount, need: "moderate" },
		{ group: "互动", title: "反馈", href: "/admin/feedback", icon: Flag, get: () => feedbackCount, need: "moderate" },
		// 班级栏目没有可计数的实体（它是个独立功能页），不编数字
		{ group: "内容", title: "班级栏目", href: "/admin/class8", icon: School, get: null, need: "manageContent" },
		{ group: "互动", title: "公告", href: "/admin/announcements", icon: Megaphone, get: () => announcementsCount, need: "manageContent" }
	];

	const groups = $derived.by(() => {
		const allowed = CARDS.filter((c) => userCan(data.user as any, c.need));
		return ["内容", "互动"]
			.map((g) => ({ group: g, items: allowed.filter((c) => c.group === g) }))
			.filter((g) => g.items.length > 0);
	});

	onMount(loadStats);
</script>

<!-- 页头：左侧标题 + 右侧动作（与站内其它页面同一条按键心智线） -->
<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
	<div>
		<div class="flex items-center gap-2">
			<h1 class="font-heading text-2xl font-semibold tracking-tight">仪表盘</h1>
			<Badge variant="outline" class="text-[10px]">{levelLabel}</Badge>
		</div>
		<p class="mt-0.5 text-sm text-muted-foreground">内容概览与快速操作</p>
	</div>
	<Button variant="outline" size="sm" onclick={loadStats} disabled={loading}>
		<RefreshCw class="mr-1.5 size-3.5 {loading ? 'animate-spin' : ''}" />
		{loading ? "刷新中…" : "刷新"}
	</Button>
</div>

<!-- 两张概要宽卡：流量（势头）与内容总量（存量），性质不同于逐项计数 -->
<div class="mb-6 grid gap-3 sm:grid-cols-2">
	<div class="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4">
		<div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
			<Eye class="size-5" />
		</div>
		<div class="min-w-0">
			<div class="font-heading text-2xl font-semibold tabular-nums">{pvToday.toLocaleString()}</div>
			<div class="text-xs text-muted-foreground">今日浏览量 · 累计 {pvTotal.toLocaleString()}</div>
		</div>
	</div>
	<div class="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4">
		<div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
			<FolderOpen class="size-5" />
		</div>
		<div class="min-w-0">
			<div class="font-heading text-2xl font-semibold tabular-nums">
				{(postsCount + projectsCount + docsCount + pagesCount).toLocaleString()}
			</div>
			<div class="text-xs text-muted-foreground">内容条目总数（文章 + 项目 + 教程 + 页面）</div>
		</div>
	</div>
</div>

<!-- 分组统计卡：手机 2 列 / 平板 3 列 / 宽屏 4 列 -->
{#each groups as g (g.group)}
	<section class="mb-6">
		<h2 class="mb-3 text-xs font-medium tracking-wide text-muted-foreground">{g.group}</h2>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
			{#each g.items as c (c.href)}
				<a
					href={c.href}
					class="group flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4 transition-[border-color,transform] duration-200 hover:border-primary/50 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
				>
					<div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
						<c.icon class="size-4" />
					</div>
					<div class="min-w-0">
						<div class="font-heading text-xl font-semibold tabular-nums">
							{#if !ready}
								<ScanEye class="size-4 animate-pulse" />
							{:else if c.get}
								{c.get().toLocaleString()}
							{:else}
								<!-- 这一项没有可统计的数量。给「—」而不是 0，
								     0 会被读成"真的一条都没有"，— 才是"不适用"。 -->
								<span class="text-muted-foreground/60">—</span>
							{/if}
						</div>
						<div class="truncate text-xs text-muted-foreground">{c.title}</div>
					</div>
				</a>
			{/each}
		</div>
	</section>
{/each}

<!-- 底部两栏：快速操作（按钮网格）+ 存储说明 -->
<div class="grid gap-4 lg:grid-cols-2">
	<div class="rounded-xl border border-border/60 bg-card p-4">
		<h3 class="mb-3 font-heading font-medium">快速操作</h3>
		<div class="flex flex-wrap gap-2">
			{#if canContent}
				<Button href="/admin/posts" size="sm" variant="outline">
					<Plus class="mr-1.5 size-3.5" />新建文章
				</Button>
				<Button href="/admin/docs" size="sm" variant="outline">
					<Plus class="mr-1.5 size-3.5" />新建教程
				</Button>
				<Button href="/admin/media" size="sm" variant="outline">
					<Upload class="mr-1.5 size-3.5" />上传媒体
				</Button>
			{/if}
			{#if canPages}
				<Button href="/admin/pages/new" size="sm" variant="outline">
					<LayoutTemplate class="mr-1.5 size-3.5" />新建页面
				</Button>
			{/if}
			{#if canModerate}
				<Button href="/admin/comments" size="sm" variant="ghost">评论审核</Button>
				<Button href="/admin/feedback" size="sm" variant="ghost">处理反馈</Button>
			{/if}
			{#if !canContent && !canPages && !canModerate}
				<p class="text-sm text-muted-foreground">
					当前账号（{levelLabel} · 无编辑或审核称号）无可编辑模块，可前往有权限的模块处理事务。
				</p>
			{/if}
		</div>
	</div>
	<!-- 系统状态：把「数据在哪、同步还活着吗」摆在站长眼前。
	     这类问题平时没人看，出事时才翻日志，而那时往往已经晚了。 -->
	<div class="rounded-xl border border-border/60 bg-card p-4">
		<h3 class="mb-3 font-heading font-medium">系统状态</h3>
		<dl class="space-y-2 text-sm">
			<div class="flex items-center justify-between gap-3">
				<dt class="text-muted-foreground">内容存储</dt>
				<dd class="text-right">
					<code class="rounded bg-muted px-1.5 py-0.5 text-xs">content/</code>
					<span class="ml-1.5 text-xs text-muted-foreground">Markdown · 可 Git 版本控制</span>
				</dd>
			</div>
			<div class="flex items-center justify-between gap-3">
				<dt class="text-muted-foreground">附件存储</dt>
				<dd class="text-right">
					<code class="rounded bg-muted px-1.5 py-0.5 text-xs">uploads/</code>
					<span class="ml-1.5 text-xs text-muted-foreground">本地磁盘（2026-10-24 起不再用 R2）</span>
				</dd>
			</div>
			<div class="flex items-center justify-between gap-3">
				<dt class="text-muted-foreground">账号与互动数据</dt>
				<dd class="text-right">
					<code class="rounded bg-muted px-1.5 py-0.5 text-xs">stelarith.db</code>
					<span class="ml-1.5 text-xs text-muted-foreground">SQLite</span>
				</dd>
			</div>
			<div class="flex items-center justify-between gap-3">
				<dt class="text-muted-foreground">GitHub 同步</dt>
				<dd class="text-right">
					{#if !gh}
						<span class="text-xs text-muted-foreground">读取中…</span>
					{:else if gh.coolingUntil}
						<span class="text-xs text-rose-600 dark:text-rose-400">配额冷却至 {gh.coolingUntil}</span>
					{:else}
						<span class="text-xs {gh.hasToken ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">
							{gh.hasToken ? "已授权" : "匿名"} · {gh.quotaPerHour ?? 60} 次/时
						</span>
					{/if}
				</dd>
			</div>
			{#if lastSync}
				<div class="flex items-start justify-between gap-3">
					<dt class="text-muted-foreground">仓库同步</dt>
					<dd class="max-w-[60%] text-right">
						{#if lastSync.error}
							<span class="text-xs text-rose-600 dark:text-rose-400" title={lastSync.error}>
								{lastSync.error.length > 28 ? lastSync.error.slice(0, 28) + "…" : lastSync.error}
							</span>
						{:else}
							<span class="text-xs text-emerald-600 dark:text-emerald-400" title={lastSync.repo}>正常</span>
						{/if}
						<div class="text-[11px] text-muted-foreground">{lastSync.repo}</div>
					</dd>
				</div>
			{/if}
		</dl>
		{#if gh && !gh.hasToken && !gh.coolingUntil}
			<p class="mt-3 border-l-2 border-amber-500/60 pl-2.5 text-xs leading-relaxed text-muted-foreground">
				未配置 GITHUB_TOKEN，按匿名配额同步；仓库较多时容易触发限流。在 .env 补上只读令牌即可提升额度。
			</p>
		{/if}
	</div>
</div>
