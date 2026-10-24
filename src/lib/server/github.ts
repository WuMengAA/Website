/**
 * GitHub REST 客户端 —— 项目展板的「同步仓库」数据源。
 *
 * 设计要点：
 * - 令牌取自环境变量 `GITHUB_TOKEN`（只读 public_repo 权限即可）。**未配置时自动降级为
 *   匿名调用**（60 次/小时），并在返回值里带 `anonymous: true` 让后台显示醒目提示 ——
 *   而不是直接抛错，这样「没配令牌也能先把界面跑起来」。
 * - 提交活跃度用 `/repos/{o}/{r}/commits` 分页聚合，而非 GraphQL contributionsCollection：
 *   REST 端点对细粒度 PAT 更友好，且不要求 GraphQL 权限。代价是要翻页，故设页数上限。
 * - 所有失败都归一化为 `GithubError`，带上 status / rateLimitReset，由调用方决定是
 *   「跳过这个仓库」还是「整体报错」。
 */

import { env } from "$env/dynamic/private";

const API = "https://api.github.com";

/**
 * API 根地址：**可配置**（2026-10-24）。
 *
 * 为什么要留这个口子：部署机所在的网络未必能直连 api.github.com —— 本机实测就是
 * DNS 能解析（20.205.243.168）但 TCP 连不上，`fetch failed`。这种情况下无论配不配
 * GITHUB_TOKEN、无论怎么调配额，同步都不可能成功，而错误信息只会说「网络无法访问 GitHub」，
 * 看不出是"墙"还是"GitHub 挂了"，更看不出有解。
 *
 * 给一个 `GITHUB_API_BASE`，就能指向自己的加速/反代端点（例如自建的 Cloudflare Worker，
 * 见 deploy/site/cloudflare/github-api-worker/），不必改一行代码。留空即用官方地址。
 * ⚠️ 注意：gh.245959623.xyz 这类端点只反代 **git 协议**（clone/pull/push），
 *    并不反代 REST API；要让本站的「同步仓库」可用，必须另建一个 api.github.com 反代。
 *
 * ⚠️ 指向第三方端点等于把请求交给它中转：官方端点请务必用 https，
 * 且只填自己可控的地址 —— 令牌会被发往这个地址。
 */
function apiBase(): string {
	const raw = (env.GITHUB_API_BASE ?? "").trim();
	return (raw || API).replace(/\/+$/, "");
}

/** GitHub API 错误（含限流信息），便于上层区分「配额用尽」与「仓库不存在」。 */
export class GithubError extends Error {
	status: number;
	rateLimitReset: string | null;
	constructor(message: string, status: number, rateLimitReset: string | null = null) {
		super(message);
		this.name = "GithubError";
		this.status = status;
		this.rateLimitReset = rateLimitReset;
	}
}

export interface RepoMeta {
	owner: string;
	name: string;
	fullName: string;
	url: string;
	description: string;
	homepage: string;
	language: string;
	license: string;
	stars: number;
	forks: number;
	watchers: number;
	openIssues: number;
	defaultBranch: string;
	pushedAt: string;
	createdAt: string;
	archived: boolean;
	topics: string[];
	anonymous: boolean;
}

export interface GithubRelease {
	tag: string;
	name: string;
	body: string;
	url: string;
	prerelease: boolean;
	draft: boolean;
	publishedAt: string;
	assets: { name: string; url: string; size: number; downloads: number }[];
}

export function githubToken(): string {
	return (env.GITHUB_TOKEN ?? "").trim();
}

export function hasGithubToken(): boolean {
	return githubToken().length > 0;
}

function headers(): Record<string, string> {
	const h: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "Stelarith-Project-Board"
	};
	const t = githubToken();
	if (t) h.Authorization = `Bearer ${t}`;
	return h;
}

// ── 三层防护：缓存 / 单飞 / 熔断 ────────────────────────────────────────────
// 为什么要这三样（2026-10-24 检修时补上）：
// 未配 GITHUB_TOKEN 时匿名配额只有 **60 次/小时**，而同步一个仓库就要发 2～3 个请求
// （元数据 + 提交分页 + 可选的发行列表）。后台多点几次「同步」、或同一时刻来了两个访客，
// 配额就见底了 —— 之后的每一次点击都变成一次新的失败，用户看到的是「同步一直红」，
// 却不知道这只是被限流了。
//
// ① 缓存：GET 结果按 URL 记 5 分钟。仓库元数据与提交活跃度本就是慢变量，
//    5 分钟内重复读没有意义，却实实在在消耗配额。
// ② 单飞：同一 URL 的并发请求合并成一个，后来的复用前者的 Promise。
//    没有它，页面上一个组件读 repo、另一个读 releases，同一份数据会被取两遍。
// ③ 熔断：真的被限流后，按 GitHub 给的 reset 时间闭嘴，期间不再发请求，
//    直接抛「冷却中」。这比让每个请求都撞一次 403 要好：既省下重试的开销，
//    又让错误信息保持稳定（"冷却到 14:30"，而不是每次都说"稍后"）。

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; data: any }>();
const inflight = new Map<string, Promise<{ data: any; headers: Headers }>>();
let circuitOpenUntil = 0;

/** 真正发一次请求。成功写缓存；被限流则拉起熔断。 */
async function ghFetch(url: string): Promise<{ data: any; headers: Headers }> {
	let res: Response;
	try {
		res = await fetch(url, { headers: headers() });
	} catch (err) {
		throw new GithubError(`网络无法访问 GitHub：${(err as Error).message}`, 0);
	}

	const reset = res.headers.get("x-ratelimit-reset");
	if (!res.ok) {
		if (res.status === 403 || res.status === 429) {
			const remaining = res.headers.get("x-ratelimit-remaining");
			if (remaining === "0") {
				// 熔断到 GitHub 告知的恢复时刻；它没给就按 15 分钟算，避免永久封死。
				circuitOpenUntil = reset
					? Number(reset) * 1000
					: Date.now() + 15 * 60 * 1000;
				const resetAt = new Date(circuitOpenUntil).toLocaleString("zh-CN");
				throw new GithubError(
					`GitHub API 配额已用尽（${hasGithubToken() ? "已认证 5000/时" : "匿名仅 60/时，建议配置 GITHUB_TOKEN"}），将于 ${resetAt} 恢复`,
					res.status,
					reset
				);
			}
		}
		if (res.status === 404) throw new GithubError("仓库不存在或不可访问（私有仓库需令牌授权）", 404, reset);
		throw new GithubError(`GitHub 返回 ${res.status}`, res.status, reset);
	}
	const data = await res.json();
	cache.set(url, { at: Date.now(), data });
	return { data, headers: res.headers };
}

async function gh(pathOrUrl: string): Promise<{ data: any; headers: Headers }> {
	const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${apiBase()}${pathOrUrl}`;

	// ① 熔断期内不再打扰 GitHub
	if (Date.now() < circuitOpenUntil) {
		throw new GithubError(
			`GitHub 配额冷却中，${new Date(circuitOpenUntil).toLocaleString("zh-CN")} 后自动恢复（期间不再发起请求）`,
			429,
			String(Math.floor(circuitOpenUntil / 1000))
		);
	}

	// ② 缓存命中
	const hit = cache.get(url);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
		return { data: hit.data, headers: new Headers() };
	}

	// ③ 单飞：同 URL 并发只发一次
	const pending = inflight.get(url);
	if (pending) return pending;

	const p = ghFetch(url);
	inflight.set(url, p);
	try {
		return await p;
	} finally {
		inflight.delete(url);
	}
}

/**
 * 同步链路体检 —— 给后台「仓库同步」页直接显示，免得排查时靠猜。
 * 重点回答三个问题：配额够不够、现在是不是在冷却、有没有缓存可退。
 */
export function githubHealth(): {
	tokenConfigured: boolean;
	quotaPerHour: number;
	coolingUntil: string | null;
	cachedRequests: number;
} {
	return {
		tokenConfigured: hasGithubToken(),
		quotaPerHour: hasGithubToken() ? 5000 : 60,
		coolingUntil: Date.now() < circuitOpenUntil ? new Date(circuitOpenUntil).toLocaleString("zh-CN") : null,
		cachedRequests: cache.size
	};
}

/** 清空缓存与熔断（后台「强制刷新」用；正常路径不需要调）。 */
export function resetGithubCache(): void {
	cache.clear();
	circuitOpenUntil = 0;
}

/**
 * 从各种写法里解析出 owner/name。
 * 支持：`https://github.com/o/n`、`https://github.com/o/n.git`、`git@github.com:o/n.git`、
 * 自建代理域名（如 gh.245959623.xyz）、以及裸的 `o/n`。
 */
export function parseRepoUrl(input: string | null | undefined): { owner: string; name: string } | null {
	const raw = (input ?? "").trim();
	if (!raw) return null;

	// 裸 "owner/name"（不含协议与域名）
	if (/^[\w.-]+\/[\w.-]+$/.test(raw)) {
		const [owner, name] = raw.split("/");
		return { owner, name: name.replace(/\.git$/, "") };
	}

	// git@host:owner/name.git
	const scp = raw.match(/^[\w.+-]+@[^:]+:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
	if (scp) return { owner: scp[1], name: scp[2] };

	try {
		const u = new URL(raw);
		const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
		if (parts.length >= 2) {
			return { owner: parts[0], name: parts[1].replace(/\.git$/, "") };
		}
	} catch {
		/* 交给下面返回 null */
	}
	return null;
}

export async function fetchRepo(owner: string, name: string): Promise<RepoMeta> {
	const { data } = await gh(`/repos/${owner}/${name}`);
	return {
		owner,
		name,
		fullName: data.full_name,
		url: data.html_url,
		description: data.description ?? "",
		homepage: data.homepage ?? "",
		language: data.language ?? "",
		license: data.license?.spdx_id ?? data.license?.name ?? "",
		stars: data.stargazers_count ?? 0,
		forks: data.forks_count ?? 0,
		watchers: data.subscribers_count ?? data.watchers_count ?? 0,
		openIssues: data.open_issues_count ?? 0,
		defaultBranch: data.default_branch ?? "main",
		pushedAt: data.pushed_at ?? "",
		createdAt: data.created_at ?? "",
		archived: !!data.archived,
		topics: Array.isArray(data.topics) ? data.topics : [],
		anonymous: !hasGithubToken()
	};
}

/**
 * 拉取近 `days` 天默认分支的提交，按「提交日期」聚合为热力图桶。
 * 返回 `{ buckets: { 'YYYY-MM-DD': 次数 }, truncated: 是否因页数上限被截断 }`。
 * 页数上限 10 页（100/页 = 1000 次提交），足够覆盖个人项目一年的活跃度，
 * 又能把单次同步的耗时与配额控制在可接受范围。
 */
export async function fetchCommitBuckets(
	owner: string,
	name: string,
	branch: string,
	days = 371
): Promise<{ buckets: Record<string, number>; truncated: boolean; total: number }> {
	const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
	const buckets: Record<string, number> = {};
	const MAX_PAGES = 10;
	let page = 1;
	let truncated = false;
	let total = 0;

	for (; page <= MAX_PAGES; page++) {
		const { data } = await gh(
			`/repos/${owner}/${name}/commits?sha=${encodeURIComponent(branch)}&since=${encodeURIComponent(since)}&per_page=100&page=${page}`
		);
		if (!Array.isArray(data) || data.length === 0) break;
		for (const c of data) {
			const iso: string = c?.commit?.author?.date ?? c?.commit?.committer?.date ?? "";
			if (!iso) continue;
			const day = iso.slice(0, 10);
			buckets[day] = (buckets[day] ?? 0) + 1;
			total++;
		}
		if (data.length < 100) break;
		if (page === MAX_PAGES) truncated = true;
	}
	return { buckets, truncated, total };
}

export async function fetchReleases(owner: string, name: string, limit = 30): Promise<GithubRelease[]> {
	const { data } = await gh(`/repos/${owner}/${name}/releases?per_page=${Math.min(limit, 100)}`);
	if (!Array.isArray(data)) return [];
	return data.map((r: any) => ({
		tag: r.tag_name ?? "",
		name: r.name || r.tag_name || "",
		body: r.body ?? "",
		url: r.html_url ?? "",
		prerelease: !!r.prerelease,
		draft: !!r.draft,
		publishedAt: r.published_at ?? r.created_at ?? "",
		assets: Array.isArray(r.assets)
			? r.assets.map((a: any) => ({
					name: a.name ?? "",
					url: a.browser_download_url ?? "",
					size: a.size ?? 0,
					downloads: a.download_count ?? 0
				}))
			: []
	}));
}

/** 供后台「测试连接」用：返回当前令牌身份与剩余配额。 */
export async function fetchRateLimit(): Promise<{
	authenticated: boolean;
	login: string;
	remaining: number;
	limit: number;
	resetAt: string;
}> {
	const { data, headers } = await gh(hasGithubToken() ? "/user" : "/rate_limit");
	const remaining = Number(headers.get("x-ratelimit-remaining") ?? -1);
	const limit = Number(headers.get("x-ratelimit-limit") ?? -1);
	const reset = Number(headers.get("x-ratelimit-reset") ?? 0);
	return {
		authenticated: hasGithubToken(),
		login: hasGithubToken() ? (data?.login ?? "") : "",
		remaining,
		limit,
		resetAt: reset ? new Date(reset * 1000).toISOString() : ""
	};
}
