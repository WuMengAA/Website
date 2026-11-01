<script lang="ts">
  import { page } from "$app/state";

  let password = $state("");
  let err = $state("");
  let busy = $state(false);

  const next = $derived(page.url.searchParams.get("next") ?? "/campus/2028/class8");

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    err = "";
    busy = true;
    try {
      const r = await fetch("/api/campus/class8/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, next })
      });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.ok) {
        window.location.href = j.next ?? "/campus/2028/class8";
        return;
      }
      err = j?.error ?? "认证失败，请重试";
    } catch {
      err = "网络错误，请重试";
    } finally {
      busy = false;
    }
  }
</script>

<div class="c8-gate">
  <form class="gate-card" onsubmit={submit}>
    <span class="gate-badge">2028·8</span>
    <h1 class="gate-title">班级展板 · 访问认证</h1>
    <p class="gate-sub">本区域仅向本班同学与老师开放，请输入访问密码。</p>
    <input
      class="gate-input"
      type="password"
      bind:value={password}
      placeholder="访问密码"
      autocomplete="current-password"
      autofocus
    />
    {#if err}<p class="gate-err" role="alert">{err}</p>{/if}
    <button class="gate-btn" type="submit" disabled={busy || !password}>
      {busy ? "验证中…" : "进入班级展板"}
    </button>
  </form>
</div>

<style>
  .c8-gate { min-height: 62vh; display: flex; align-items: center; justify-content: center; padding: 2rem 1rem; }
  .gate-card { width: min(26rem, 100%); display: flex; flex-direction: column; gap: .8rem; padding: 2.2rem 2rem; background: #fffdf7; border: 1px solid rgba(42,38,32,.12); border-radius: 1.2rem; box-shadow: 0 24px 48px -32px rgba(42,38,32,.4); }
  .gate-badge { align-self: flex-start; background: #c8542e; color: #fff; font-weight: 700; font-size: .72rem; padding: .18rem .55rem; border-radius: .4rem; letter-spacing: .1em; }
  .gate-title { font-family: var(--font-heading); font-weight: 700; font-size: 1.35rem; letter-spacing: -.01em; margin: 0; }
  .gate-sub { color: #8a8178; font-size: .85rem; margin: 0; line-height: 1.6; }
  .gate-input { padding: .7rem .9rem; font-size: .95rem; border: 1px solid rgba(42,38,32,.2); border-radius: .6rem; background: #faf6ee; color: #2a2620; outline: none; transition: border-color .2s; }
  .gate-input:focus { border-color: #c8542e; }
  .gate-err { color: #b3261e; font-size: .82rem; margin: 0; }
  .gate-btn { margin-top: .3rem; padding: .7rem 1rem; font-weight: 700; font-size: .92rem; color: #fff; background: linear-gradient(120deg, #c8542e, #b8891a); border: 0; border-radius: .6rem; cursor: pointer; transition: opacity .2s, transform .2s; }
  .gate-btn:hover:not(:disabled) { transform: translateY(-1px); }
  .gate-btn:disabled { opacity: .55; cursor: not-allowed; }
</style>
