/**
 * 出厂导航 —— 站点导航的**默认值真源**。
 *
 * 为什么把一份 JSON 挪进 .ts（2026-10-24）：
 * 导航此前只有 `content/nav.json` 一份真源，而它在 .gitignore 里（属运行时数据）。
 * 于是「站长在后台排好的导航分类」和「代码」是两笔账：换一台机器、或 content/ 被重置，
 * nav.json 没了，导航会退回 getNav() 里那套**写死在函数体内**的旧默认值
 * —— 顺序、分组、图标全是几个月前的样子，跟前台实际在用的对不上，
 * 而没人能一眼看出「少了哪些、为什么不一样」。
 *
 * 现在分两层，各司其职：
 *   · 本文件（进 git）= **出厂默认值**，是产品决策：站点默认该有哪些入口、怎么分组排序。
 *   · content/nav.json（不进 git）= **运行时覆盖**，是站长的个人化：他加的、删的、挪的。
 *
 * 换机时 nav.json 缺失 → 自动落回这里的出厂值 → 导航完整、跟代码一致，
 * 不会出现「首页侧栏空了一块」这种说不清哪来又查不出原因的现象。
 *
 * 改这里的代价要想清楚：它会**改变所有尚未自定义过导航的部署**的侧栏。
 * 只影响新装/重置的场景，已经存过 nav.json 的站点不会被覆盖（覆盖层优先）。
 */

import type { NavConfig } from "./content-store.js";

export const DEFAULT_NAV: NavConfig = {
	// 工作区：导航主干，直接铺开不折叠。
	// 只放真正常用的核心入口 —— 曾经这里塞了 12 项，结果是一条谁也不看的滚动列表。
	workspace: [
		{ title: "首页", url: "/", icon: "home" },
		{ title: "文档", url: "/docs", icon: "folder-open" },
		{ title: "项目", url: "/projects", icon: "sparkles" },
		{ title: "下载中心", url: "/download", icon: "download" },
		{ title: "论坛社区", url: "/forum", icon: "globe" },
		{ title: "关于", url: "/pages/about", icon: "bookmark" }
	],

	// 更多：内容型入口，折叠起来，避免和主干抢视觉。
	more: [
		{ title: "更新", url: "/changelog", icon: "clock" },
		{ title: "站点动态", url: "/pulse", icon: "activity" },
		{ title: "新闻", url: "/news", icon: "tv" },
		{ title: "归档", url: "/archive", icon: "archive" },
		{ title: "站点索引", url: "/index", icon: "layout" },
		{ title: "工具", url: "/tools", icon: "hammer" },
		{ title: "友情链接", url: "/links", icon: "link" },
		{ title: "订阅", url: "/rss.xml", icon: "star" }
	],

	// 底部固定栏：与账号相关的动作，登录后才完整显示。
	bottom: [
		{ title: "公告", url: "/announcements", icon: "bell" },
		{ title: "反馈", url: "/feedback", icon: "message-circle" },
		{ title: "账号", url: "/account", icon: "user" }
	],

	groups: [
		{
			key: "lab",
			label: "终末地实验室",
			icon: "layers",
			layout: "grid",
			collapsed: true,
			showIn: "site",
			items: [
				{ title: "采购中心", url: "/store", icon: "tag" },
				{ title: "界面还原", url: "/lab/endfield", icon: "layers" }
			]
		}
	]
};
