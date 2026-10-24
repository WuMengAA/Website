<!--
	OAuth 授权页 —— 第三方应用请求用本站账号登录时，用户在这里做决定。

	重构要点（2026-10-24）：
	- 原实现把颜色写死成一套暗色（#0f1115 / #4f7cff），与站点双主题完全脱节：
	  亮色主题下这里仍是一片黑，像进了别人的网站。现在一律走主题 CSS 变量。
	- 原实现用的是 `export let` + `$:`（Svelte 4 语法），而全站其余部分已是 Svelte 5 runes。
	  两种写法混在一个项目里，改一个页面要同时记得两套心智模型。这里改为 runes。
	- 补上「拒绝」按钮：原先不同意只能关标签页，客户端既收不到 code 也收不到 error。
	- 把回拨地址明示出来。授权页不告诉用户「授权完会跳到哪」，等于让用户盲签。
	- 视觉对齐终末地 console 范式：切角、圆角恒 0、细线分区、`//` 眉标、单一强调色做填充。
-->
<script lang="ts">
	type AuthData = {
		authed: boolean;
		user: { username: string; displayName: string; role: string; avatar?: string } | null;
		client: { id: string; name: string; description?: string; loopback?: boolean; scopes?: string[] } | null;
		error: string | null;
		client_id: string;
		redirect_uri: string;
		state: string;
		scope: string;
		response_type: string;
	};

	// 默认值写进解构里，类型注解只描述类型 —— 把 `= null` 写进类型标注是 TS 语法错误，
	// 表现为编译期一条看不懂的 "Unexpected token |"。
	let { data, form = null }: { data: AuthData; form?: { error?: string } | null } = $props();

	// 错误码 → 人话。授权流程里的错误码是给机器看的，直接抛给用户等于没说。
	const errMap: Record<string, string> = {
		unsupported_response_type: "不支持的 response_type（本站只支持 authorization code）",
		unauthorized_client: "未授权的客户端（client_id 未在本站登记）",
		invalid_redirect_uri: "非法的回拨地址（该客户端未登记这个地址）",
		client_not_configured: "该客户端尚未配置密钥，请联系站长先在 .env 里补上",
		client_disabled: "该客户端已被站长停用（配置保留，暂不发放授权）"
	};

	// scope 的中文说明：让用户知道自己到底授权了什么，而不是看到一串英文缩写。
	const scopeLabels: Record<string, string> = {
		profile: "读取你的昵称与头像",
		email: "读取你的邮箱",
		cims: "以你的身份使用集控功能"
	};

	const shownError = $derived(form?.error ?? data.error);
	const clientName = $derived(data.client?.name ?? "第三方应用");
	const granted = $derived((data.scope || "").split(/[\s,]+/).filter(Boolean));
	const scopeText = $derived(granted.map((s) => scopeLabels[s] ?? `访问 ${s}`));
</script>

<svelte:head>
	<title>授权登录 | Stelarith</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="wrap">
	<div class="panel">
		<div class="bar">
			<span class="eyebrow">// 授权请求</span>
			<span class="bar-line"></span>
		</div>

		<h1>{data.authed ? "确认授权" : "登录后授权"}</h1>
		<p class="sub">{data.client?.description ?? `${clientName} 请求使用你的 Stelarith 账号登录`}</p>

		{#if shownError}
			<p class="err">{errMap[shownError] ?? shownError}</p>
		{/if}

		{#if data.client}
			<div class="tri"><i></i><i></i><i></i></div>

			<div class="app">
				<span class="app-name">{clientName}</span>
				<span class="app-id">{data.client.id}</span>
			</div>

			{#if scopeText.length > 0}
				<p class="label">// 将获得的权限</p>
				<ul class="scopes">
					{#each scopeText as s (s)}
						<li>{s}</li>
					{/each}
				</ul>
			{/if}

			<!-- 回拨地址明示：授权完会跳到哪，必须让用户看得见。
			     这是授权页的最后一道防钓鱼 —— 一个把用户送去陌生域名的授权请求，
			     只要地址写在页面上，就很容易被察觉。 -->
			<p class="label">// 授权后跳转至</p>
			<p class="uri" title={data.redirect_uri}>{data.redirect_uri}</p>

			{#if !data.authed}
				<!-- 未登录：在此登录（登录后即网站会话）。用原生提交，确保登录成功后 303 回跳被浏览器跟随 -->
				<form method="POST" action="?/login" class="fields">
					<input type="hidden" name="client_id" value={data.client_id} />
					<input type="hidden" name="redirect_uri" value={data.redirect_uri} />
					<input type="hidden" name="state" value={data.state} />
					<input type="hidden" name="scope" value={data.scope} />
					<label>
						<span>用户名 / 邮箱</span>
						<input name="username" autocomplete="username" required />
					</label>
					<label>
						<span>密码</span>
						<input name="password" type="password" autocomplete="current-password" required />
					</label>
					<button type="submit" class="primary">登录并继续</button>
				</form>
			{:else}
				<p class="who">
					{#if data.user?.avatar}
						<img class="avatar" src={data.user.avatar} alt="" />
					{/if}
					<span>当前登录：<b>{data.user?.displayName ?? data.user?.username}</b></span>
					<span class="role">（{data.user?.role}）</span>
				</p>

				<div class="acts">
					<form method="POST" action="?/consent">
						<input type="hidden" name="client_id" value={data.client_id} />
						<input type="hidden" name="redirect_uri" value={data.redirect_uri} />
						<input type="hidden" name="state" value={data.state} />
						<input type="hidden" name="scope" value={data.scope} />
						<button type="submit" class="primary">授权并继续</button>
					</form>
					<!-- 拒绝：与同意同等显眼的出路。回拨 error=access_denied，
					     让客户端知道「用户不同意」而不是干等超时。 -->
					<form method="POST" action="?/deny">
						<input type="hidden" name="client_id" value={data.client_id} />
						<input type="hidden" name="redirect_uri" value={data.redirect_uri} />
						<input type="hidden" name="state" value={data.state} />
						<button type="submit" class="ghost">拒绝</button>
					</form>
				</div>

				<p class="hint">
					{#if data.client?.loopback}
						授权后浏览器会跳回本地桌面端（http://127.0.0.1），你可关闭此页面。
					{:else}
						授权后浏览器会跳回 {clientName}，你可关闭此页面。
					{/if}
				</p>
			{/if}
		{/if}
	</div>
</div>

<style>
	/* 一律走主题变量：原先写死暗色，亮色主题下这里仍是一片黑 */
	.wrap {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px 16px;
		background: var(--background);
		color: var(--foreground);
		font-family: var(--font-sans, system-ui, -apple-system, "Segoe UI", sans-serif);
	}

	/* 终末地：切角、圆角恒 0、细线边框，不用柔和投影 */
	.panel {
		width: 420px;
		max-width: 100%;
		background: var(--card, var(--background));
		border: 1px solid var(--border);
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
		padding: 24px 22px 22px;
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 14px;
	}
	.eyebrow {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		white-space: nowrap;
	}
	.bar-line {
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	h1 {
		font-size: 20px;
		font-weight: 600;
		margin: 0 0 6px;
		letter-spacing: -0.01em;
	}
	.sub {
		margin: 0 0 16px;
		color: var(--muted-foreground);
		font-size: 13px;
		line-height: 1.6;
	}

	.err {
		border-left: 2px solid var(--destructive);
		background: color-mix(in srgb, var(--destructive) 10%, transparent);
		color: var(--destructive);
		padding: 8px 10px;
		font-size: 13px;
		margin: 0 0 14px;
	}

	/* 三色条：仅用于标题下方的分区标记（终末地规范：全站只两处） */
	.tri {
		display: flex;
		gap: 3px;
		margin-bottom: 14px;
	}
	.tri i {
		display: block;
		width: 22px;
		height: 3px;
		background: var(--primary);
	}
	.tri i:nth-child(2) {
		opacity: 0.55;
	}
	.tri i:nth-child(3) {
		opacity: 0.28;
	}

	.app {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		border: 1px solid var(--border);
		padding: 10px 12px;
		margin-bottom: 14px;
	}
	.app-name {
		font-size: 14px;
		font-weight: 600;
	}
	.app-id {
		font-size: 11px;
		color: var(--muted-foreground);
		font-variant-numeric: tabular-nums;
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
	}

	.label {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		margin: 0 0 6px;
	}

	.scopes {
		margin: 0 0 14px;
		padding: 0;
		list-style: none;
		color: var(--foreground);
		font-size: 12.5px;
		line-height: 1.8;
	}
	.scopes li {
		border-bottom: 1px solid var(--border);
		padding: 3px 0;
	}
	.scopes li::before {
		content: "—";
		color: var(--muted-foreground);
		margin-right: 8px;
	}

	.uri {
		margin: 0 0 16px;
		font-size: 11.5px;
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
		color: var(--muted-foreground);
		word-break: break-all;
		border-left: 2px solid var(--border);
		padding-left: 8px;
	}

	.fields label {
		display: block;
		font-size: 12px;
		color: var(--muted-foreground);
		margin-bottom: 10px;
	}
	.fields label span {
		display: block;
		margin-bottom: 4px;
	}
	input {
		width: 100%;
		padding: 9px 11px;
		border: 1px solid var(--border);
		border-radius: 0;
		background: var(--background);
		color: var(--foreground);
		box-sizing: border-box;
		font-size: 13px;
	}
	input:focus {
		outline: 1px solid var(--primary);
		outline-offset: -1px;
	}

	button {
		width: 100%;
		padding: 10px;
		border-radius: 0;
		border: 1px solid var(--border);
		cursor: pointer;
		font-size: 13.5px;
		font-weight: 600;
		background: transparent;
		color: var(--foreground);
		transition: filter 0.12s ease;
	}
	button:hover {
		filter: brightness(1.08);
	}
	/* 单一强调色只做填充 —— 同意是这里唯一的主操作 */
	button.primary {
		background: var(--primary);
		border-color: var(--primary);
		color: var(--primary-foreground);
	}

	.who {
		font-size: 13px;
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 14px;
	}
	.avatar {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		object-fit: cover;
		margin: 0;
	}
	.role {
		color: var(--muted-foreground);
		font-size: 12px;
	}

	.acts {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
	}
	.acts form {
		display: contents;
	}
	button.ghost {
		width: auto;
		padding: 10px 18px;
		color: var(--muted-foreground);
	}

	.hint {
		font-size: 12px;
		color: var(--muted-foreground);
		margin: 12px 0 0;
		line-height: 1.6;
	}

	@media (max-width: 480px) {
		.acts {
			grid-template-columns: 1fr;
		}
		button.ghost {
			width: 100%;
		}
	}
</style>
