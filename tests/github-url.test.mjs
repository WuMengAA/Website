/**
 * 业务逻辑 · parseRepoUrl（src/lib/server/github.ts）
 *
 * 守的历史坑：后台「GitHub 地址改不了」—— 从地址栏复制的 github.com/owner/name
 * （缺协议）曾被 new URL 直接抛错、误判成「地址无法识别」。2026-11-01 修复。
 * 这组用例把「用户会真实粘贴的每一种形态」全部钉死。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseRepoUrl } from "../src/lib/server/github.ts";

const cases = [
	// [输入, 期望 owner, 期望 name]
	["WuMengAA/Website", "WuMengAA", "Website"], // 裸 owner/name
	["WuMengAA/Website.git", "WuMengAA", "Website"], // 裸 + .git
	["https://github.com/WuMengAA/Website", "WuMengAA", "Website"],
	["https://github.com/WuMengAA/Website/", "WuMengAA", "Website"], // 尾斜杠
	["https://github.com/WuMengAA/Website.git", "WuMengAA", "Website"],
	["http://github.com/WuMengAA/Website", "WuMengAA", "Website"],
	["github.com/WuMengAA/Website", "WuMengAA", "Website"], // ⭐ 缺协议（历史 bug）
	["gh.245959623.xyz/WuMengAA/Website", "WuMengAA", "Website"], // 自建域 + 缺协议
	["git@github.com:WuMengAA/Website.git", "WuMengAA", "Website"], // scp 形态
	["git@gitlab.example.com:group/proj", "group", "proj"],
	["https://gh.245959623.xyz/WuMengAA/Website", "WuMengAA", "Website"],
];

test("合法形态全表：owner/name 解析正确", () => {
	for (const [input, owner, name] of cases) {
		assert.deepEqual(parseRepoUrl(input), { owner, name }, `输入 "${input}"`);
	}
});

test("垃圾输入一律 null（不抛异常）", () => {
	for (const bad of [null, undefined, "", "   ", "just-a-word", "https://github.com/only-owner"]) {
		assert.equal(parseRepoUrl(bad), null, `输入 ${JSON.stringify(bad)} 应为 null`);
	}
});

test("「首段含点」才补协议 —— 不把 裸owner/name 误当 host", () => {
	// 这两条都合法但走不同分支：裸形式由正则兜底，不会被加 https:// 变成 host=owner
	assert.deepEqual(parseRepoUrl("a.b/c/d"), { owner: "c", name: "d" }); // 首段含点 → 被当 host，c/d 才是 owner/name
	assert.deepEqual(parseRepoUrl("owner/name"), { owner: "owner", name: "name" }); // 无点 → 裸形式
});

test("路径尾部多余段被忽略（取前两段）", () => {
	assert.deepEqual(parseRepoUrl("https://github.com/o/n/tree/main/src"), { owner: "o", name: "n" });
});
