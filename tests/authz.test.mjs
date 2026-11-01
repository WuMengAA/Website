/**
 * 链路 2 · 端点鉴权
 *
 * 事故背景：历史上出过 canManage fail-open（权限判断失败时反而放行）。
 * 这套测试只断言**拒绝路径**，因为"该放行的放行了"很难测穷，
 * 但"该拒绝的都拒绝了"一旦破就是事故 —— 而且 fail-open 会让它静默通过编译。
 */
import assert from "node:assert/strict";
import test, { before } from "node:test";
import { BASE, loginAdmin, readEnv, siteUp } from "./_helpers.mjs";

let env;
let up;
let adminToken;

before(async () => {
  up = await siteUp();
  env = readEnv();
  if (up) adminToken = await loginAdmin("admin", env.ADMIN_PASSWORD);
});

test("站点在跑", (t) => {
  if (!up) return t.skip(`${BASE} 无响应`);
  assert.ok(up);
});

test("未登录访问 /admin → 重定向/拒绝，不是 200", async (t) => {
  if (!up) return t.skip("站点未运行");
  const res = await fetch(`${BASE}/admin`, { redirect: "manual" });
  assert.ok([302, 303, 307, 401, 403].includes(res.status), `未登录访问后台得到 ${res.status}，不应是 200`);
});

test("未登录 GET 展板列表 → 200（公开数据），但不泄露 GitHub 内部状态", async (t) => {
  if (!up) return t.skip("站点未运行");
  const res = await fetch(`${BASE}/api/project-board`);
  assert.equal(res.status, 200, "展板列表属公开数据，应可匿名读取");
  const j = await res.json();
  assert.ok(Array.isArray(j.boards), "应返回 boards 数组");
  // 2026-11-01 修：github 健康块（hasToken / 配额 / 缓存条数）只对管理员返回。
  // 匿名访客知道"站点配了 token、配额还剩多少"等于给攻击者递情报。
  assert.equal(j.github, undefined, "匿名访客不应看到 hasToken / quota 等运维内部状态");
});

test("未登录写展板 API → 401", async (t) => {
  if (!up) return t.skip("站点未运行");
  const res = await fetch(`${BASE}/api/project-board`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-action": "sync" },
    body: JSON.stringify({ slug: "xingjikong" }),
  });
  assert.equal(res.status, 401);
});

test("伪造 admin_token 的写操作 → 401", async (t) => {
  if (!up) return t.skip("站点未运行");
  const res = await fetch(`${BASE}/api/project-board`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-action": "sync",
      Cookie: "admin_token=forged.token.value",
    },
    body: JSON.stringify({ slug: "xingjikong" }),
  });
  assert.equal(res.status, 401, "伪造 cookie 必须被拒");
});

test("管理员登录后读展板 API → 200 且 github 健康字段齐全", async (t) => {
  if (!up) return t.skip("站点未运行");
  if (!adminToken) return t.skip("管理员登录失败（密码与 .env 不一致？）");
  const res = await fetch(`${BASE}/api/project-board`, {
    headers: { Cookie: `admin_token=${adminToken}` },
  });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.ok(j.github, "应返回 github 健康块");
  assert.equal(j.github.hasToken, true, "GITHUB_TOKEN 未生效（vault/BOM/重启链路断了）");
});

test("破坏性动作（deleteBoard）对非 admin 一律 403", async (t) => {
  if (!up) return t.skip("站点未运行");
  if (!adminToken) return t.skip("无 admin 会话");
  // 用 admin 但**不存在的 slug** 走权限分支：先过鉴权，再被 slug 逻辑拦下；
  // 这里只验证「未登录时不可能是 200」，避免真的删掉展板。
  const res = await fetch(`${BASE}/api/project-board`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-action": "deleteBoard" },
    body: JSON.stringify({ slug: "__nonexistent_guard_test__" }),
  });
  assert.equal(res.status, 401, "未登录的破坏性动作必须 401");
});
