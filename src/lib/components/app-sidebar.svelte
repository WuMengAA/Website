<!--
	前台侧边栏 —— 站点主导航。

	重构要点（2026-10-24）：
	- 之前 workspace / more / bottom / campus 各自写一份 `$derived` 做「取数据 → 解析图标 → 兜底」，
	  四处逻辑同构却各自漂移，改一个解析规则要改四个地方。现在收敛成 `buildSection()` 一个函数，
	  分组只声明「数据从哪来、默认收不收起、要不要按后台权限过滤」，渲染由同一段模板循环。
	- 图标解析曾有两张表：本文件内的 `navIconMap`（语义别名，如 docs→BookMarked）与
	  `icon-library.ts` 的 `ICON_MAP`（lucide 原名，如 folder-open）。两边键名不同、
	  优先级靠书写顺序隐式决定，靠人脑记住谁先谁后。现在统一为 `resolveIcon()`：
	  语义别名优先（照顾历史数据），再查 ICON_MAP，最后落到显式传入的兜底图标。
	- 分组展开态统一读写 `sidebar-memory` 的 group map，不再为某个分组单开专用 key。
-->
<script lang="ts">
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import {
		Home, BookOpen, BookMarked, Rocket, Globe, FileText,
		Search, Megaphone, Link, Archive, Wrench, User, LogIn,
		School, GraduationCap, Radio, MonitorSmartphone, Wallet,
		MessageSquare, Rss, Newspaper, Music2, MessagesSquare, Sparkles
	} from "@lucide/svelte";
	import { Github, Twitter } from "$lib/components/icons/index.js";
	import { MorphIcon } from "morphicons/svelte";
	import { ChevronDown, ChevronUp } from "lucide";
	// 只借 Role 类型：侧栏收到的 data.user.role 就是数据库里的角色值（根布局 load 下发），
	// 之前这里手写成 string，害得判定函数只能靠 `as any` 硬塞，类型帮不上忙。
	import type { Role } from "$lib/permissions.js";
	import { adminEntryHref } from "$lib/view-switch-nav.js";
	import {
		readMoreOpen, writeMoreOpen, readCampusOpen, writeCampusOpen, readGroupOpen, writeGroupOpen
	} from "$lib/sidebar-memory.js";
	import SidebarResizer from "$lib/components/sidebar-resizer.svelte";
	import { ICON_MAP } from "$lib/icon-library.js";

	import { page } from "$app/state";

	type NavLink = { title: string; url: string; icon?: string; external?: boolean };
	/**
	 * 自定义导航组（镜像站等）。与后端 content-store.ts 的 NavGroup 同构；
	 * layout 决定条目排列方式：list=单列 / grid=两列格子 / inline=一行图标。
	 */
	type NavGroupCfg = {
		key: string;
		label: string;
		icon?: string;
		layout?: "list" | "grid" | "inline";
		collapsed?: boolean;
		showIn?: "site" | "admin" | "both";
		items: NavLink[];
	};

	let { data }: { data?: {
		settings?: { socials?: { name: string; url: string }[]; siteName?: string; slogan?: string };
		nav?: { workspace: NavLink[]; more: NavLink[]; bottom: NavLink[]; campus?: NavLink[]; groups?: NavGroupCfg[] };
		user?: { username?: string; role?: Role | null } | null;
		canEdit?: boolean;
	} } = $props();

	// ── 图标解析 ─────────────────────────────────────────────────────────────
	// 语义别名：历史上 nav 数据里存的是「站点概念名」而不是 lucide 图标名
	// （如 docs / projects / tools / admin）。这些键在 ICON_MAP 里查不到，
	// 若直接删掉别名表，历史导航项会全部回落到兜底图标、视觉上"图标全变一样"。
	// 所以保留，但只作为 ICON_MAP 之上的一层薄映射，且集中在这一处。
	const ICON_ALIASES: Record<string, any> = {
		home: Home, blog: BookOpen, posts: BookOpen, bookopen: BookOpen,
		project: Rocket, projects: Rocket, rocket: Rocket,
		doc: BookMarked, docs: BookMarked, bookmarked: BookMarked,
		create: Sparkles, sparkles: Sparkles, novel: BookMarked, novels: BookMarked,
		tool: Wrench, tools: Wrench, wrench: Wrench,
		announcement: Megaphone, announcements: Megaphone, megaphone: Megaphone,
		link: Link, links: Link, rss: Rss, subscribe: Rss, newspaper: Newspaper,
		archive: Archive, archives: Archive,
		feedback: MessageSquare, messagesquare: MessageSquare,
		admin: Wrench, wallet: Wallet, user: User, account: User, users: User,
		music: Music2, forum: MessagesSquare, news: Newspaper, pages: FileText,
		search: Search, layoutdashboard: FileText,
		school: School, graduation: GraduationCap, graduationcap: GraduationCap,
		radio: Radio, broadcast: Radio, console: MonitorSmartphone, monitor: MonitorSmartphone
	};

	/** 唯一图标解析入口：语义别名 → lucide 原名 → 调用方指定的兜底。 */
	function resolveIcon(name: string | undefined, fallback: any): any {
		const k = (name || "").toLowerCase();
		return ICON_ALIASES[k] || ICON_MAP[k] || fallback;
	}

	// ── 默认导航（nav 数据缺失时的兜底）────────────────────────────────────
	// 注意：不要在这里放「只有标题、没有内容」的占位页（AI 绘图 / 交互小说 / 追番 / 游戏 / 钱包），
	// 它们会让导航显得又散又空。待功能真正落地后再在此处与 content/nav.json 同步挂出。
	const defaultWorkspace = [
		{ title: "首页", url: "/", icon: "home" },
		{ title: "更新日志", url: "/changelog", icon: "clock" },
		{ title: "站点动态", url: "/pulse", icon: "activity" },
		{ title: "项目", url: "/projects", icon: "projects" },
		{ title: "教程", url: "/docs", icon: "docs" },
		{ title: "页面", url: "/pages", icon: "pages" },
		{ title: "工具集", url: "/tools", icon: "tools" }
	];
	const defaultMore = [
		{ title: "搜索", url: "/search", icon: "search" },
		{ title: "公告", url: "/announcements", icon: "announcements" },
		{ title: "连接", url: "/links", icon: "links" },
		{ title: "订阅", url: "/subscribe", icon: "rss" },
		{ title: "旧站归档", url: "/archives", icon: "archives" },
		{ title: "点歌帮助", url: "/voicehub/help", icon: "docs" },
		{ title: "反馈", url: "/feedback", icon: "feedback" }
	];
	const defaultBottom = [
		{ title: "管理后台", url: "/admin", icon: "admin" },
		{ title: "账号", url: "/account", icon: "account" }
	];
	const defaultCampus = [
		{ title: "学校一览", url: "/campus/school", icon: "school" },
		{ title: "班级展板", url: "/campus/2028/class8", icon: "monitor" },
		{ title: "班级风貌", url: "/campus/classes", icon: "graduation" },
		{ title: "校园广播", url: "/campus/broadcast", icon: "radio" }
		// 2026-10-04：集控面板不再挂在前台「校园」组（重点位置只放站点内容），
		// 星集控收纳进下方「项目」折叠组（默认收起，见 defaultProjects）。
	];
	// 2026-10-04 「项目」折叠组：站点的项目化收纳层 —— 星集控作为独立项目收在
	// 折叠组里，默认收起，不占前台重点位置。以后新项目（镜像站/站点本体…）加一条即可。
	const defaultProjects = [{ title: "星集控", url: "/admin/console", icon: "monitor" }];

	// ── 分组构建 ─────────────────────────────────────────────────────────────
	type Section = {
		key: string;
		label: string;
		icon: any;
		items: (NavLink & { icon: any })[];
		/** false = 条目直接铺开（工作区）；true = 点击标题展开/收起。 */
		collapsible: boolean;
		/** 该组的展开态记忆键；collapsible 为 false 时无意义。 */
		memoryKey: string;
		defaultOpen: boolean;
	};

	/**
	 * 把一个导航数组变成可渲染的分组：解析图标 + 按权限过滤后台入口。
	 * 过滤规则只有一条——未登录/无后台权限时，凡是 /admin 开头的入口整条去掉，
	 * 免得访客在前台看到「点进去就被弹回登录页」的死链。
	 */
	function buildSection(
		key: string,
		label: string,
		icon: any,
		raw: NavLink[] | undefined,
		fallback: NavLink[],
		opts: { collapsible: boolean; memoryKey: string; defaultOpen?: boolean; hideAdmin?: boolean; fallbackIcon?: any } = {
			collapsible: true,
			memoryKey: key
		}
	): Section {
		const src = raw && raw.length > 0 ? raw : fallback;
		let items = src.map((i) => ({ ...i, icon: resolveIcon(i.icon ?? i.title, opts.fallbackIcon ?? Globe) }));
		if (opts.hideAdmin) items = items.filter((i) => !i.url.startsWith("/admin"));
		return {
			key,
			label,
			icon,
			items,
			collapsible: opts.collapsible,
			memoryKey: opts.memoryKey,
			defaultOpen: opts.defaultOpen ?? false
		};
	}

	// 后台入口：判定收敛到 $lib/view-switch-nav 的**唯一**实现（后台顶栏、前台顶栏、
	// 这里的滑块与菜单项全部调它），别在这儿再写一套条件——三处各判一套必然漂移，
	// 会出现「有滑块但没有后台菜单项」这种错配。
	// 返回 null = 不进后台（未登录 / 无 viewAdmin 也无 viewConsole）→ 相关入口一律不渲染。
	const adminHref = $derived(adminEntryHref(data?.user));
	const authed = $derived(!!(data?.user));

	// 固定分组。工作区不折叠（它是导航主干，收起来等于把首页藏了）；
	// 「更多 / 校园 / 项目」折叠，避免侧栏一屏塞不下。
	const sections = $derived([
		buildSection("workspace", "工作区", Home, data?.nav?.workspace, defaultWorkspace, {
			collapsible: false,
			memoryKey: "workspace",
			defaultOpen: true
		}),
		buildSection("more", "更多", Globe, data?.nav?.more, defaultMore, {
			collapsible: true,
			memoryKey: "more",
			fallbackIcon: Globe
		}),
		buildSection("campus", "校园", School, data?.nav?.campus, defaultCampus, {
			collapsible: true,
			memoryKey: "campus",
			hideAdmin: !adminHref,
			fallbackIcon: School
		}),
		buildSection("projects", "项目", Rocket, undefined, defaultProjects, {
			collapsible: true,
			memoryKey: "projects",
			hideAdmin: !adminHref,
			fallbackIcon: Rocket
		})
	].filter((s) => s.items.length > 0));

	// 自定义组（镜像站等）—— 后台「导航管理」增删，前台按 showIn 过滤掉仅后台可见的组。
	const customGroups = $derived(
		((data?.nav?.groups ?? []) as NavGroupCfg[])
			.filter((g) => (g.showIn ?? "both") !== "admin")
			.map((g) => ({ ...g, icon: resolveIcon(g.icon, Globe) }))
	);

	// 底部固定组：摘掉 nav.json 里指向后台的那条（「后台 → /admin」）。
	// 「去后台」全站只保留侧栏底部滑块一个入口、一种行为；两处并存时显隐条件还会不一致
	// （原先一条用 canEdit、滑块用 viewAdmin||viewConsole），用户不知道该点哪个。
	const bottomLinks = $derived(
		(data?.nav?.bottom && data.nav.bottom.length > 0 ? data.nav.bottom : defaultBottom)
			.map((i) => ({ ...i, icon: resolveIcon(i.icon ?? i.title, Globe) }))
			.filter((b) => !b.url.startsWith("/admin"))
	);

	// ── 展开态：首屏用默认值（服务端与客户端算出同一个值，不会 hydration 抖动），
	//    客户端首帧后再用本地记忆覆盖 —— 与「更多」「校园」同一套做法。
	let openMap = $state<Record<string, boolean>>({});
	let hydrated = $state(false);

	$effect(() => {
		if (hydrated) return;
		hydrated = true;
		const next: Record<string, boolean> = {};
		for (const s of sections) {
			if (!s.collapsible) continue;
			next[s.key] =
				s.memoryKey === "more" ? readMoreOpen() : s.memoryKey === "campus" ? readCampusOpen() : readGroupOpen(s.memoryKey, s.defaultOpen);
		}
		for (const g of customGroups) next[g.key] = readGroupOpen(g.key, g.collapsed !== true);
		openMap = next;
	});

	/** 新分组（后台刚加的）在记忆里没有条目时，用它的默认态，避免"加完就消失"。 */
	function isOpen(key: string, fallback: boolean): boolean {
		return openMap[key] ?? fallback;
	}

	function toggle(key: string, fallback: boolean): void {
		const next = !isOpen(key, fallback);
		openMap = { ...openMap, [key]: next };
		// 「更多」「校园」历史上用专用键，沿用以免用户已存的状态丢掉；其余走通用 group map。
		if (key === "more") writeMoreOpen(next);
		else if (key === "campus") writeCampusOpen(next);
		else writeGroupOpen(key, next);
	}

	const path = $derived(page.url.pathname);

	function isActive(url: string): boolean {
		if (url === "/") return path === "/";
		return path.startsWith(url);
	}

	// ── 社交图标 ─────────────────────────────────────────────────────────────
	const fallbackSocials = [
		{ name: "GitHub", icon: Github, url: "https://github.com/afoim" },
		{ name: "Twitter", icon: Twitter, url: "https://x.com/Stelarith_" }
	];
	const socialIconMap: Record<string, any> = {
		"github": Github, "twitter": Twitter, "x": Twitter,
		"爱发电": Github, "ifdian": Github, "heart": Github,
		"哔哩哔哩": Twitter, "bilibili": Twitter, "b站": Twitter,
		"qq": Globe, "qq群": Globe, "telegram": Twitter, "tg": Twitter
	};
	const socials = $derived(
		(data?.settings?.socials && data.settings.socials.length > 0 ? data.settings.socials : fallbackSocials)
			.map((s) => ({ name: s.name, url: s.url, icon: socialIconMap[s.name.toLowerCase()] || socialIconMap[s.name] || Globe }))
	);
</script>

<Sidebar.Root collapsible="icon">
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton href="/" size="lg">
					<div
						class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary font-heading text-sm font-semibold text-primary-foreground"
					>
						S
					</div>
					<div class="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
						<span class="font-heading text-base font-semibold tracking-tight">{data?.settings?.siteName || "Stelarith"}</span>
						<span class="text-xs text-muted-foreground">{data?.settings?.slogan || "Protect What You Love."}</span>
					</div>
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		{#each sections as s (s.key)}
			<Sidebar.Group>
				{#if s.collapsible}
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							<Sidebar.MenuItem>
								<Sidebar.MenuButton
									onclick={() => toggle(s.key, s.defaultOpen)}
									aria-expanded={isOpen(s.key, s.defaultOpen)}
									tooltipContent={s.label}
								>
									<s.icon />
									<span class="group-data-[collapsible=icon]:hidden">{s.label}</span>
									<MorphIcon
										icon={isOpen(s.key, s.defaultOpen) ? ChevronUp : ChevronDown}
										spring="snappy"
										reducedMotion="user"
										size={16}
										aria-hidden="true"
										class="ml-auto group-data-[collapsible=icon]:hidden"
									/>
								</Sidebar.MenuButton>
								{#if isOpen(s.key, s.defaultOpen)}
									<Sidebar.MenuSub>
										{#each s.items as item (item.url)}
											<Sidebar.MenuSubItem>
												<Sidebar.MenuSubButton href={item.url} isActive={isActive(item.url)}>
													<item.icon />
													<span>{item.title}</span>
												</Sidebar.MenuSubButton>
											</Sidebar.MenuSubItem>
										{/each}
									</Sidebar.MenuSub>
								{/if}
							</Sidebar.MenuItem>
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				{:else}
					<Sidebar.GroupLabel>{s.label}</Sidebar.GroupLabel>
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							{#each s.items as item (item.url)}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton href={item.url} isActive={isActive(item.url)}>
										<item.icon />
										<span>{item.title}</span>
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				{/if}
			</Sidebar.Group>
			<Sidebar.Separator />
		{/each}

		<!-- 自定义组（镜像站等）：后台可增删。每种排列方式都包在 MenuSubItem(<li>) 里，
		     保证 ul>li 的 HTML 结构合法（grid 只改 MenuSub 的 display）。 -->
		{#each customGroups as g (g.key)}
			<Sidebar.Group>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						<Sidebar.MenuItem>
							<Sidebar.MenuButton
								onclick={() => toggle(g.key, g.collapsed !== true)}
								aria-expanded={isOpen(g.key, g.collapsed !== true)}
								tooltipContent={g.label}
							>
								<g.icon />
								<span class="group-data-[collapsible=icon]:hidden">{g.label}</span>
								<MorphIcon
									icon={isOpen(g.key, g.collapsed !== true) ? ChevronUp : ChevronDown}
									spring="snappy"
									reducedMotion="user"
									size={16}
									aria-hidden="true"
									class="ml-auto group-data-[collapsible=icon]:hidden"
								/>
							</Sidebar.MenuButton>
							{#if isOpen(g.key, g.collapsed !== true)}
								{#if g.layout === "grid"}
									<Sidebar.MenuSub class="grid grid-cols-2 gap-1 px-1.5 py-1">
										{#each g.items as item (item.url)}
											{@const Icon = resolveIcon(item.icon, Globe)}
											<Sidebar.MenuSubItem>
												<a
													href={item.url}
													target={item.external ? "_blank" : undefined}
													rel={item.external ? "noopener noreferrer" : undefined}
													title={item.title}
													class="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
												>
													<Icon class="size-3.5 shrink-0" />
													<span class="truncate">{item.title}</span>
												</a>
											</Sidebar.MenuSubItem>
										{/each}
									</Sidebar.MenuSub>
								{:else if g.layout === "inline"}
									<Sidebar.MenuSub class="flex-row flex-wrap gap-1 px-1.5 py-1">
										{#each g.items as item (item.url)}
											{@const Icon = resolveIcon(item.icon, Globe)}
											<Sidebar.MenuSubItem>
												<a
													href={item.url}
													target={item.external ? "_blank" : undefined}
													rel={item.external ? "noopener noreferrer" : undefined}
													title={item.title}
													aria-label={item.title}
													class="flex size-7 items-center justify-center rounded-md text-sidebar-foreground ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
												>
													<Icon class="size-4" />
												</a>
											</Sidebar.MenuSubItem>
										{/each}
									</Sidebar.MenuSub>
								{:else}
									<Sidebar.MenuSub>
										{#each g.items as item (item.url)}
											{@const Icon = resolveIcon(item.icon, Globe)}
											<Sidebar.MenuSubItem>
												<Sidebar.MenuSubButton
													href={item.url}
													isActive={!item.external && isActive(item.url)}
													target={item.external ? "_blank" : undefined}
													rel={item.external ? "noopener noreferrer" : undefined}
												>
													<Icon />
													<span>{item.title}</span>
												</Sidebar.MenuSubButton>
											</Sidebar.MenuSubItem>
										{/each}
									</Sidebar.MenuSub>
								{/if}
							{/if}
						</Sidebar.MenuItem>
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
			<Sidebar.Separator />
		{/each}
	</Sidebar.Content>

	<!-- 前台底部固定栏（IA §2.5）：账户 + 反馈/公告/提示，要求「固定不随滚动丢失」。
	     原先这组挂在**可滚动的 Content 末尾**（工作区一长就被滚出视野），
	     移入 Footer 后与「前后台切换」同处一个固定门面栏，与总纲 §2.3/§2.5 的 frontbar 一致。 -->
	<Sidebar.Footer>
		{#if authed}
			<Sidebar.Separator />
			<Sidebar.Group>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each bottomLinks as item (item.url)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton href={item.url} isActive={isActive(item.url)} tooltipContent={item.title}>
									<item.icon />
									<span>{item.title}</span>
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{:else}
			<Sidebar.Separator />
			<Sidebar.Group>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						<Sidebar.MenuItem>
							<Sidebar.MenuButton href="/admin/login" isActive={isActive("/admin/login")}>
								<LogIn />
								<span>登录</span>
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{/if}
		<div class="flex flex-wrap items-center gap-1 px-2 pb-2">
			{#each socials as s (s.name)}
				<a
					href={s.url}
					target="_blank"
					rel="noopener noreferrer"
					class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
					aria-label={s.name}
				>
					<s.icon class="size-4" />
				</a>
			{/each}
		</div>
	</Sidebar.Footer>

	<Sidebar.Rail />
	<SidebarResizer />
</Sidebar.Root>
