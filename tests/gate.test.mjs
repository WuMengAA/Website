/**
 * 链路 1 · class8 门禁（/campus/2028/class8）
 *
 * 事故背景：门禁是这块唯一的隐私屏障，而它曾经"看起来在但实际没生效"
 * （同类：.env BOM 让 ADMIN_PASSWORD 从未生效）。所以这里断言的不是"能进"，
 * 而是**每一种进不去的情形都真的进不去**。
 */
import assert from "node:assert/strict";
import test, { before } from "node:test";
import { BASE, gateToken, readEnv, siteUp } from "./_helpers.mjs";

const PAGE = `${BASE}/campus/2028/class8`;
let env;
let up;

before(async () => {
  up = await siteUp();
  env = readEnv();
});

test("站点在跑（否则本文件全部跳过）", (t) => {
  if (!up) return t.skip(`${BASE} 无响应`);
  assert.ok(up);
});

test("无 cookie → 302 跳认证页", async (t) => {
  if (!up) return t.skip("站点未运行");
  const res = await fetch(PAGE, { redirect: "manual" });
  assert.equal(res.status, 302, "未持令牌必须 302，不能直接 200");
  const loc = res.headers.get("location") ?? "";
  assert.match(loc, /\/campus\/2028\/class8\/auth/, `重定向目标应指向认证页，实际 ${loc}`);
});

test("错误签名 → 302（不能因为格式像就放行）", async (t) => {
  if (!up) return t.skip("站点未运行");
  const good = gateToken(env.CLASS8_PASSCODE || "c8-gate");
  const [exp] = good.split(".");
  const forged = `${exp}.${"0".repeat(64)}`;
  const res = await fetch(PAGE, { headers: { Cookie: `c8_gate=${forged}` }, redirect: "manual" });
  assert.equal(res.status, 302, "伪造签名必须被拒");
});

test("已过期令牌 → 302", async (t) => {
  if (!up) return t.skip("站点未运行");
  const expired = gateToken(env.CLASS8_PASSCODE || "c8-gate", -60_000); // 1 分钟前过期
  const res = await fetch(PAGE, { headers: { Cookie: `c8_gate=${expired}` }, redirect: "manual" });
  assert.equal(res.status, 302, "过期令牌必须被拒");
});

test("正确令牌 → 200 且含门禁内内容", async (t) => {
  if (!up) return t.skip("站点未运行");
  const tok = gateToken(env.CLASS8_PASSCODE || "c8-gate");
  const res = await fetch(PAGE, { headers: { Cookie: `c8_gate=${tok}` } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /班级总结/, "持有令牌应看到班级总结区块");
  assert.ok(html.length > 50_000, `页面体量异常偏小（${html.length}），可能是残缺壳`);
});

test("门禁只管页面，静态图片仍可直取（已知边界，需可观测）", async (t) => {
  if (!up) return t.skip("站点未运行");
  const res = await fetch(`${BASE}/campus/2028/class8/wall/manifest.json`, { redirect: "manual" });
  assert.equal(res.status, 200, "静态资源不经路由守卫 —— 这是已记录的边界，若变成 302 说明策略变了");
  const j = await res.json();
  assert.equal(j.count, 42, `后墙图应为 42 张，实际 ${j.count}`);
});
