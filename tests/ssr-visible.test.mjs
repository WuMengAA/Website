/**
 * 链路 5 · SSR 可见性（防"内容看不到"类事故复发）
 *
 * 事故背景：同一个坑踩了三次 ——
 *   ① 10-31 board 照片墙：reveal-wipe 的 clip-path 初态等 JS 解除；
 *   ② 11-01 class8 42 张缩略图全白：Svelte unused-CSS 剪枝删掉了 `.loaded img{opacity:1}`；
 *   ③ 11-01 条形图：reveal-late 兜底漏了 width，永远是空条。
 * 三者同源：**初始态由 CSS 藏、终态靠 JS 补**。
 * 所以这里断言两件事：(a) 关键内容在 SSR HTML 里就有；(b) 可见性走的是 inline style
 * 而非"运行时类名 + CSS 规则"（后者会被剪枝）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { BASE, gateToken, readEnv, siteUp } from "./_helpers.mjs";

const ITH = process.env.STELARITH_ROOT || "D:/Stelarith/Stelarith-website/stelarith";
const ASSETS = `${ITH}/build/client/_app/immutable/assets`;

function assetsWith(ext) {
  if (!fs.existsSync(ASSETS)) return [];
  return fs.readdirSync(ASSETS).filter((f) => f.endsWith(ext)).map((f) => `${ASSETS}/${f}`);
}

function findInAssets(ext, needle) {
  const hits = [];
  for (const p of assetsWith(ext)) {
    if (fs.readFileSync(p, "utf8").includes(needle)) hits.push(p.split(/[\\/]/).pop());
  }
  return hits;
}

test("class8 页 SSR HTML 已含全部关键内容（不依赖 JS 才可见）", async (t) => {
  if (!(await siteUp())) return t.skip("站点未运行");
  const env = readEnv();
  const html = await (
    await fetch(`${BASE}/campus/2028/class8`, {
      headers: { Cookie: `c8_gate=${gateToken(env.CLASS8_PASSCODE || "c8-gate")}` },
    })
  ).text();

  // Tab 化后 SSR 仅渲染首屏 overview 面板；学业追踪/班级后墙等其余 tab 走客户端切换。
  // 此处断言 overview 关键内容在 SSR HTML 中就位（不依赖 JS 才可见）+ Tab 导航存在（保证其余板块可达）。
  for (const kw of ["班级总览", "励思笃行", "环境育人", "2028届8班"]) {
    assert.match(html, new RegExp(kw), `SSR HTML 缺少「${kw}」—— 首屏内容被藏到 JS 之后了`);
  }
  const tablist = (html.match(/role="tablist"/g) ?? []).length;
  assert.ok(tablist >= 1, "应渲染 Tab 导航（学业追踪/班级后墙等板块经 Tab 可达）");
});

test("缩略图可见性走 inline style（防止回退到会被剪枝的 CSS 类方案）", () => {
  // 页面组件的编译产物在 build/client/_app/immutable/nodes/ 下，不在 assets/，
  // 所以这里扫整个 client 目录。
  const clientDir = `${ITH}/build/client`;
  if (!fs.existsSync(clientDir)) return;
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js") && fs.readFileSync(p, "utf8").includes("style.opacity")) hits.push(e.name);
    }
  };
  walk(clientDir);
  assert.ok(
    hits.length > 0,
    "client JS 里找不到 style.opacity —— 可见性可能又改回 CSS 类驱动（会被 unused-CSS 剪枝吃掉）"
  );
});

test("流光占位动画仍在 CSS 产物里（未被误剪）", () => {
  const hits = findInAssets(".css", "wallShimmer");
  assert.ok(hits.length > 0, "CSS 产物中缺少 wallShimmer 关键帧 —— 加载动画丢了");
});

test("条形图有 reveal-late 宽度兜底（JS 没跑起来时不能是空条）", () => {
  const css = assetsWith(".css").map((p) => fs.readFileSync(p, "utf8")).join("\n");
  assert.match(css, /reveal-late[^{]*\.bfill|\.bfill[^{]*\{[^}]*width:var\(--w\)/s,
    "缺少 .bfill 的宽度兜底 —— JS 失效时图表会全是空条");
});

test("首页 SSR 有实质内容（防整站空白）", async (t) => {
  if (!(await siteUp())) return t.skip("站点未运行");
  const res = await fetch(BASE + "/");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.length > 20_000, `首页 HTML 只有 ${html.length} 字节，疑似残缺壳`);
});
