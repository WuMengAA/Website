// 站点索引 · 真实数据：导航条目 + 各分区内容计数（来自 content-store，不造第二份）。
import { listItems, getNav } from "$lib/server/content-store";

export const load = () => {
	const counts = {
		posts: listItems("posts").length,
		projects: listItems("projects").length,
		docs: listItems("docs").length,
		pages: listItems("pages").length
	};
	const total = counts.posts + counts.projects + counts.docs + counts.pages;
	const level = Math.min(9, Math.floor(total / 10) + 1);
	return {
		nav: getNav() as any,
		counts,
		total,
		level,
		cur: total % 10,
		max: 10
	};
};
