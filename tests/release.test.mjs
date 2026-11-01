/**
 * 链路 3 · 发布脚本自检
 *
 * 事故背景：release-site.mjs 是唯一的发布通道，它自己有"构建中重启导致连崩"的
 * 血泪史。它自带 selftest（用假目录验证改名/回滚，不碰生产），这里把它纳入回归，
 * 避免改动发布脚本后无人验证。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const ITH = process.env.STELARITH_ROOT || "D:/Stelarith/Stelarith-website/stelarith";
const SCRIPT = `${ITH}/scripts/release-site.mjs`;

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ITH,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, STELLARITH_BUILD_HEAP_MB: "1536", CODEBUDDY_SAFE_DELETE_ENABLED: "0" },
  });
}

test("发布脚本存在", () => {
  assert.ok(fs.existsSync(SCRIPT), `找不到 ${SCRIPT}`);
});

test("selftest：改名/回滚逻辑自检通过（不碰生产）", () => {
  const r = run(["selftest"]);
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  assert.equal(r.status, 0, `selftest 退出码 ${r.status}\n${out.slice(-800)}`);
});

test("status：能报出当前 build 与监听者", () => {
  const r = run(["status"]);
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  assert.equal(r.status, 0, `status 退出码 ${r.status}\n${out.slice(-800)}`);
  assert.match(out, /build|监听|pid/i, "status 输出应包含 build/监听者信息");
});

test("日志轮转已就位（防止 release-build.log 再长回 34 MB）", () => {
  const src = fs.readFileSync(SCRIPT, "utf8");
  assert.match(src, /MAX_LOG_BYTES/, "缺少日志轮转常量");
  assert.match(src, /renameSync\(BUILD_LOG/, "缺少轮转改名逻辑");
});
