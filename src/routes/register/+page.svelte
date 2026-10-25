<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { UserPlus, Eye, EyeOff, Mail, User as UserIcon, ShieldCheck } from "@lucide/svelte";
	import { toast } from "svelte-sonner";
import Seo from "$lib/components/Seo.svelte";

	let username = $state("");
	let displayName = $state("");
	let email = $state("");
	let password = $state("");
	let password2 = $state("");
	let showPwd = $state(false);
	let inviteCode = $state("");
	let submitting = $state(false);

	// 注册成功后的状态：账号立即可用（未认证身份），邮箱验证为可选增强。
	let done = $state(false);
	let mailAvailable = $state(false);
	let errMsg = $state("");

	async function submit() {
		errMsg = "";
		if (!username.trim() || !password) {
			errMsg = "用户名和密码必填";
			return;
		}
		if (password.length < 6) {
			errMsg = "密码至少 6 位";
			return;
		}
		if (password !== password2) {
			errMsg = "两次输入的密码不一致";
			return;
		}
		submitting = true;
		try {
			const res = await fetch("/api/auth", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "register",
					username: username.trim(),
					displayName: displayName.trim(),
					email: email.trim(),
					inviteCode: inviteCode.trim(),
					password
				})
			});
			const d = await res.json();
			if (res.ok && d.ok) {
				// 邮箱验证为可选增强：仅据服务端邮件渠道是否可用决定提示文案，
				// 验证链接由服务端拼好发到邮箱（token 不离开服务端），前端不持有。
				mailAvailable = d.mailAvailable === true;
				done = true;
				toast.success("注册成功，可直接登录");
			} else {
				errMsg = d.error || "注册失败，请稍后重试";
			}
		} catch {
			errMsg = "无法连接服务器，请检查网络或稍后重试";
		}
		submitting = false;
	}
</script>

<Seo title="注册账号"
	description="注册 Stelarith 账号。"
	path="/register"
	noindex
/>

<div class="flex min-h-[70vh] items-center justify-center px-4 py-10">
	<div class="w-full max-w-md space-y-6">
		<div class="flex flex-col items-center gap-2 text-center">
			<div class="flex size-12 items-center justify-center rounded-xl bg-primary font-heading text-lg font-semibold text-primary-foreground">S</div>
			<h1 class="font-heading text-2xl font-semibold">注册账号</h1>
			<p class="text-sm text-muted-foreground">加入 Stelarith 社区，创建你的公开主页</p>
		</div>

		{#if done}
			<div class="space-y-4 rounded-xl border border-border/60 bg-card p-6 text-center">
				<div class="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
					<ShieldCheck class="size-6" />
				</div>
				<h2 class="font-heading text-lg font-semibold">注册成功，可直接登录</h2>
				{#if mailAvailable}
					<p class="text-sm text-muted-foreground">验证邮件已发送至你的邮箱（可选，不验证也能正常使用，仅作为「未认证用户」）。</p>
				{:else}
					<p class="text-sm text-muted-foreground">账号已创建，可直接登录使用。当前环境未配置邮件服务，邮箱验证暂不可用——不影响正常使用，你将以「未认证用户」身份登录，验证可在日后配置邮件后于账号页完成。</p>
				{/if}
				<!-- 注册即 active+未认证：直接去登录即可，无需先验证邮箱 -->
				<Button class="w-full" href="/admin/login?unverified=1">
					去登录（以未认证用户身份）
				</Button>
			</div>
		{:else}
			<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-4 rounded-xl border border-border/60 bg-card p-6">
				<div class="space-y-2">
					<Label for="reg-username">用户名</Label>
					<div class="relative">
						<UserIcon class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input id="reg-username" bind:value={username} placeholder="2-20 位字母/数字/下划线/汉字" class="pl-9" autocomplete="username" required />
					</div>
				</div>

				<div class="space-y-2">
					<Label for="reg-display">显示名称（可选）</Label>
					<Input id="reg-display" bind:value={displayName} placeholder="昵称，默认为用户名" />
				</div>

				<div class="space-y-2">
					<Label for="reg-email">邮箱</Label>
					<div class="relative">
						<Mail class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input id="reg-email" type="email" bind:value={email} placeholder="用于接收验证链接" class="pl-9" autocomplete="email" />
					</div>
				</div>

				<div class="space-y-2">
					<Label for="reg-password">密码</Label>
					<div class="relative">
						<Input id="reg-password" type={showPwd ? "text" : "password"} bind:value={password} placeholder="至少 6 位" class="pr-10" autocomplete="new-password" required />
						<button type="button" onclick={() => (showPwd = !showPwd)} class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
							{#if showPwd}<EyeOff class="size-4" />{:else}<Eye class="size-4" />{/if}
						</button>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="reg-password2">确认密码</Label>
					<Input id="reg-password2" type={showPwd ? "text" : "password"} bind:value={password2} placeholder="再次输入密码" autocomplete="new-password" required />
				</div>

				{#if errMsg}
					<p class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{errMsg}</p>
				{/if}

				<Button type="submit" class="w-full" disabled={submitting}>
					<UserPlus class="mr-2 size-4" />
					{submitting ? "提交中..." : "注册"}
				</Button>

				<p class="text-center text-xs text-muted-foreground">
					已有账号？
					<a href="/admin/login" class="text-primary underline underline-offset-4">去登录</a>
				</p>
			</form>
		{/if}
	</div>
</div>
