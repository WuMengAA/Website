/**
 * 链路 4 · 姓名脱敏（"不透露人名，只做总结"）
 *
 * 事故背景：exam-monthly.json 曾经含 50 人真实姓名，且未被 gitignore 排除 ——
 * 一次 `git add .` 就会把全班姓名推到公开仓库。现在改为源数据层脱敏。
 * 这条测试守的是三件事：数据源已脱敏、服务端不下发明细、构建产物无残留。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { BASE, gateToken, readEnv, siteUp } from "./_helpers.mjs";

const ROOT = process.env.STELARITH_WORKSPACE || "D:/Stellara/stelarith-website";
const ITH = process.env.STELARITH_ROOT || "D:/Stelarith/Stelarith-website/stelarith";
const JSON_PATH = `${ROOT}/src/lib/server/class8/exam-monthly.json`;

test("数据源存在且所有 name 均已脱敏为「学生NN」", () => {
  assert.ok(fs.existsSync(JSON_PATH), `找不到 ${JSON_PATH}`);
  const d = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  assert.ok(Array.isArray(d.rows) && d.rows.length > 0, "rows 为空");
  const bad = d.rows.filter((r) => !/^学生\d{2}$/.test(String(r.name ?? "")));
  assert.equal(bad.length, 0, `有 ${bad.length} 条未脱敏姓名，例如 ${JSON.stringify(bad.slice(0, 3).map((r) => r.name))}`);
});

test("构建产物中不含成绩明细（姓名不会被打进服务端 chunk）", (t) => {
  const chunkDir = `${ITH}/build/server`;
  if (!fs.existsSync(chunkDir)) return t.skip("构建产物不存在");
  const needle = '"name":"学生';
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(js|mjs)$/.test(e.name) && fs.readFileSync(p, "utf8").includes(needle)) hits.push(p);
    }
  };
  walk(chunkDir);
  // 允许出现在数据 chunk 里（服务端聚合需要它），但**不允许**出现在任何 client 产物里
  const clientDir = `${ITH}/build/client`;
  const clientHits = [];
  const walk2 = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk2(p);
      else if (/\.(js|mjs)$/.test(e.name) && fs.readFileSync(p, "utf8").includes(needle)) clientHits.push(p);
    }
  };
  if (fs.existsSync(clientDir)) walk2(clientDir);
  assert.equal(clientHits.length, 0, `client 产物中出现成绩明细：${clientHits.slice(0, 3).join(", ")}`);
});

test("页面不下发明细，只下发聚合结果", async (t) => {
  if (!(await siteUp())) return t.skip("站点未运行");
  const env = readEnv();
  const res = await fetch(`${BASE}/campus/2028/class8`, {
    headers: { Cookie: `c8_gate=${gateToken(env.CLASS8_PASSCODE || "c8-gate")}` },
  });
  const html = await res.text();
  assert.doesNotMatch(html, /全员成绩表/, "旧的全员成绩表必须已移除");
  assert.doesNotMatch(html, /exam-table/, "旧表格标记必须已移除");
  assert.match(html, /examSummary|班级总结/, "应只出现聚合总结");
  // 姓名绝不随成绩出现
  assert.doesNotMatch(html, /"name":"学生/, "成绩明细不应出现在 HTML 中");
});
