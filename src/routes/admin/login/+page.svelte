<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { LogIn, Eye, EyeOff, User as UserIcon } from "@lucide/svelte";
	import StelarithMascot from "$lib/components/stelarith-mascot.svelte";
	import { superForm } from "sveltekit-superforms";
	import { zod4Client, type ClientValidationAdapter } from "sveltekit-superforms/adapters";
	import { toast } from "svelte-sonner";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { safeReturnTo } from "$lib/view-switch-nav.js";
	import type { PageProps } from "./$types";
	import { loginSchema, type LoginForm } from "$lib/schemas/login.js";

	let { data }: PageProps = $props();

	let showPwd = $state(false);

	// 登录后该回哪儿：被 hooks 拦下时带过来的 returnTo。
	// 必须经 safeReturnTo 校验（只认站内路径）——直接信任查询串就是开放重定向漏洞，
	// 一条 /admin/login?returnTo=https://陷阱站 的链接就能把刚登录的老师带走。不合规退回 null。
	// 落点是 null 时保持原行为（服务端按权限分流到 /admin 或 /admin/console）。
	const returnTo = safeReturnTo(page.url.searchParams.get("returnTo"));

	// 不使用 formsnap：其 Field 组件在 SSR 期依赖 form.current.errors 内部 store，
	// 而当前 sveltekit-superforms 版本 form.current 返回表单数据对象，导致 500。
	// 改用 superForm 原生 API（errors/enhance/submitting 均为 SSR 安全的 Svelte store）。
	//
	// 客户端校验器：
	// ⚠️ 两个必须注意的点（都踩过）：
	//   1. 适配器是 zod4Client，不能用 zodClient —— 前者是 zod v4 适配器，后者是 v3。
	//      本项目 zod 是 v4，混用会让校验器拿到不兼容的 schema 而抛异常。
	//   2. 必须把 schema 传进去（zod4Client(loginSchema)），无参调用会让内部对
	//      undefined 调 safeParseAsync 直接崩。
	// 另外这里再包一层 try/catch 兜底：客户端校验器一旦抛异常，会打断 superforms 的
	// 提交流程，按钮将永远停在「登录中...」。兜底放行后由服务端做最终校验，
	// 保证「校验器坏了」永远不会演变成「登录按不动」。
	// 断言说明：superforms 2.30 对 zod v4 的 Infer 映射不完整（会把 Out 推成 ZodObject 本身），
	// 这里显式断言为正确的客户端适配器类型；运行期行为不受影响。
	const clientValidators = (() => {
		const adapter = zod4Client(loginSchema);
		return {
			...adapter,
			validate: async (data: unknown) => {
				try {
					return await adapter.validate(data);
				} catch (e) {
					console.error("[login] 客户端校验异常，已降级为服务端校验", e);
					return { data, success: true as const };
				}
			}
		};
	})() as unknown as ClientValidationAdapter<Partial<LoginForm>>;

	const { form, errors, message, enhance, submitting } = superForm(data.form, {
		validators: clientValidators,
		// 登录成功后直接回到「被拦下之前想去的页面」（returnTo），而不是一律去 /admin。
		//
		// 服务端 action 里的 redirect(302, homeFor(user)) 是「没带来路」时的兜底；有来路时
		// 在这里把 redirect 结果截住改跳 returnTo —— 这是在**不碰** login/+page.server.ts
		// 的前提下唯一能改跳点的地方。cancel() 会阻止 superforms 继续 applyAction
		// （否则它先跳 homeFor）；goto 必须带 invalidateAll: true，强制根布局 load 重跑，
		// 否则沿用的是登录前的缓存数据，data.user 还是 null，侧栏会显示成未登录。
		onResult: ({ result, cancel }) => {
			if (result.type === "redirect" && returnTo) {
				cancel();
				return goto(returnTo, { invalidateAll: true });
			}
		},
		// 注意：这里必须是 onUpdate，不能用 onUpdated。
		//   onUpdate  —— 用于接收「表单动作的返回值」（success / failure），事件形参是 { form, result }
		//   onUpdated —— 用于页面数据刷新后的回调，事件形参只有 { form }，没有 result
		// 之前误用 onUpdated 并解构 result，会在回调里抛 TypeError，导致失败提示永远弹不出来。
		onUpdate: ({ form, result }) => {
			if (result.type === "failure") {
				toast.error(form.message || "登录失败，请检查用户名和密码");
			}
		},
		onError: ({ result }) => {
			// 服务端 5xx / 网络异常：同样必须给出可见反馈，
			// 否则用户点击「登录」后页面毫无反应，会误以为系统卡死。
			toast.error(
				(result as { error?: { message?: string } })?.error?.message ||
					"无法连接服务器，请检查网络或稍后重试"
			);
		}
	});
</script>

<svelte:head>
	<title>登录 | Stelarith CMS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!--
	视觉框架对齐终末地（2026-10-24 重构）：切角面板、圆角恒 0、`//` 眉标、
	三色条分区、单一强调色只做主按钮填充。表单逻辑一行未动 ——
	superForm 的校验降级、returnTo 跳回、错误提示都保持原样，
	因为这些是踩过坑才稳定的行为，不值得为换皮冒险。
-->
<div class="stage">
	<div class="panel">
		<div class="bar">
			<span class="eyebrow">// 身份校验</span>
			<span class="bar-line"></span>
			<span class="tag">CMS</span>
		</div>

		<div class="brand">
			<!-- 2026-10-05：星集控吉祥物（状态机+弹簧动效） -->
			<StelarithMascot size={72} />
			<div class="brand-txt">
				<h1>Stelarith CMS</h1>
				<p>登录管理后台</p>
			</div>
		</div>

		<div class="tri"><i></i><i></i><i></i></div>

		<form method="POST" use:enhance class="form">
			<div class="field">
				<Label for="username">用户名</Label>
				<div class="ctl">
					<UserIcon class="ctl-icon" />
					<Input id="username" name="username" bind:value={$form.username} placeholder="用户名" class="in-left" autocomplete="username" />
				</div>
				{#if $errors.username}
					<p class="ferr">{$errors.username.join(" ")}</p>
				{/if}
			</div>

			<div class="field">
				<Label for="password">密码</Label>
				<div class="ctl">
					<Input id="password" name="password" type={showPwd ? "text" : "password"} bind:value={$form.password} placeholder="密码" class="in-right" autocomplete="current-password" />
					<button type="button" class="ctl-btn" onclick={() => (showPwd = !showPwd)} aria-label={showPwd ? "隐藏密码" : "显示密码"}>
						{#if showPwd}
							<EyeOff class="ctl-icon" />
						{:else}
							<Eye class="ctl-icon" />
						{/if}
					</button>
				</div>
				{#if $errors.password}
					<p class="ferr">{$errors.password.join(" ")}</p>
				{/if}
			</div>

			{#if $message}
				<p class="msg">{$message}</p>
			{/if}

			<!--
				必须显式写 type="submit"：Button 组件的 type 默认是 "button"，
				缺省时按钮不会触发表单提交，点击「登录」将毫无反应（既不请求也不跳转）。
				表单内有两个输入框，浏览器也不会做隐式提交，所以这是唯一的提交入口。
			-->
			<Button type="submit" class="submit" disabled={$submitting}>
				<LogIn class="btn-icon" />
				{$submitting ? "校验中..." : "登 录"}
			</Button>
		</form>

		<div class="foot">
			<p>
				还没有账号？
				<a href="/register">注册一个</a>
			</p>
			<p class="note">首次登录默认密码为生成值，请立即修改（或通过 ADMIN_PASSWORD 环境变量设置）</p>
		</div>
	</div>
</div>

<style>
	.stage {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px 16px;
		background: var(--background);
	}

	/* 切角 + 圆角恒 0：终末地的基本形状语言，与站点其余终末地页面一致 */
	.panel {
		width: 380px;
		max-width: 100%;
		background: var(--card, var(--background));
		border: 1px solid var(--border);
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%);
		padding: 20px 22px 18px;
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 18px;
	}
	.eyebrow {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
	.bar-line {
		flex: 1;
		height: 1px;
		background: var(--border);
	}
	.tag {
		font-size: 10px;
		letter-spacing: 0.1em;
		font-variant-numeric: tabular-nums;
		color: var(--muted-foreground);
		border: 1px solid var(--border);
		padding: 1px 5px;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.brand-txt h1 {
		font-size: 19px;
		font-weight: 600;
		margin: 0;
		letter-spacing: -0.01em;
	}
	.brand-txt p {
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--muted-foreground);
	}

	.tri {
		display: flex;
		gap: 3px;
		margin: 16px 0 18px;
	}
	.tri i {
		display: block;
		width: 26px;
		height: 3px;
		background: var(--primary);
	}
	.tri i:nth-child(2) {
		opacity: 0.55;
	}
	.tri i:nth-child(3) {
		opacity: 0.28;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.field :global(label) {
		display: block;
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		margin-bottom: 6px;
	}

	/* 输入控件：0 圆角，聚焦用描边而非发光 */
	.ctl {
		position: relative;
		display: flex;
		align-items: center;
	}
	.ctl :global(.ctl-icon) {
		position: absolute;
		left: 10px;
		top: 50%;
		transform: translateY(-50%);
		size: 15px;
		width: 15px;
		height: 15px;
		color: var(--muted-foreground);
		pointer-events: none;
	}
	.ctl :global(input) {
		width: 100%;
		border-radius: 0 !important;
		border: 1px solid var(--border);
		background: var(--background);
		font-size: 13.5px;
		padding-top: 9px;
		padding-bottom: 9px;
	}
	.ctl :global(.in-left) {
		padding-left: 32px !important;
	}
	.ctl :global(.in-right) {
		padding-right: 36px !important;
	}
	.ctl :global(input:focus) {
		outline: 1px solid var(--primary);
		outline-offset: -1px;
		border-color: var(--primary);
	}

	.ctl-btn {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: 0;
		padding: 4px;
		cursor: pointer;
		display: flex;
		color: var(--muted-foreground);
	}
	.ctl-btn:hover {
		color: var(--foreground);
	}

	.ferr {
		margin: 6px 0 0;
		font-size: 12px;
		color: var(--destructive);
	}
	.msg {
		margin: 0;
		border-left: 2px solid var(--destructive);
		background: color-mix(in srgb, var(--destructive) 10%, transparent);
		color: var(--destructive);
		padding: 8px 10px;
		font-size: 12.5px;
	}

	/* 主按钮：单一强调色填充，全站登录只有一个主操作 */
	.form :global(.submit) {
		width: 100%;
		border-radius: 0 !important;
		background: var(--primary);
		color: var(--primary-foreground);
		border: 1px solid var(--primary);
		font-weight: 600;
		letter-spacing: 0.04em;
		padding: 10px;
		margin-top: 2px;
	}
	.form :global(.submit:hover) {
		filter: brightness(1.08);
	}
	.form :global(.submit:disabled) {
		opacity: 0.6;
	}
	.form :global(.btn-icon) {
		width: 15px;
		height: 15px;
		margin-right: 8px;
	}

	.foot {
		margin-top: 16px;
		border-top: 1px solid var(--border);
		padding-top: 12px;
		text-align: center;
	}
	.foot p {
		margin: 0;
		font-size: 12px;
		color: var(--muted-foreground);
	}
	.foot a {
		color: var(--primary);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.note {
		margin-top: 8px !important;
		font-size: 11px !important;
		line-height: 1.6;
	}
</style>
