/**
 * 业务逻辑 · 权限矩阵（src/lib/permissions.ts，纯函数直接导入）
 *
 * 守的历史坑：
 *   - 旧模型「等级累积偏序」会把等级平移变成权限放大（#181 techrep 2→3 被动拿到
 *     全校广播）。现行模型是称号驱动，这里锚定它的关键不变量。
 *   - #249/#249v2：设备轴收紧 —— 「能碰设备」只剩 owner/admin/homeroom，
 *     techrep/teacher 的设备粗档必须为空（内容权限再高也不给远控学生机的默认）。
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
	ACTION_LABELS,
	ROLE_TITLES,
	can,
	canDevice,
	userCan,
	titlesOf,
} from "../src/lib/permissions.ts";

const ALL_ACTIONS = Object.keys(ACTION_LABELS);
const ROLES = Object.keys(ROLE_TITLES);

test("fail-closed：空值角色对任何动作一律 false", () => {
	for (const a of ALL_ACTIONS) {
		assert.equal(can(null, a), false, `can(null, ${a}) 必须拒绝`);
		assert.equal(can(undefined, a), false);
	}
	assert.equal(canDevice(null, "manage"), false);
});

test("未知角色回退 visitor（不是报错、不是管理员、也不是全 false）", () => {
	// 设计行为：ROLE_TITLES[role] ?? ["visitor"]。锚定它，防止有人改成
	// 「未知角色继承全部」这种 fail-open。
	for (const a of ALL_ACTIONS) {
		assert.equal(can("no-such-role", a), can("viewer", a), `未知角色应与 viewer 同权（${a}）`);
	}
});

test("称号包含关系：admin ⊇ editor ⊇ viewer（角色表不被意外倒挂）", () => {
	for (const a of ALL_ACTIONS) {
		if (can("editor", a)) assert.ok(can("admin", a), `editor 有 ${a} 而 admin 没有 —— 角色表倒挂`);
		if (can("viewer", a)) assert.ok(can("editor", a), `viewer 有 ${a} 而 editor 没有`);
	}
});

test("确实存在 admin 专属动作（否则「称号模型」退化为全员同权也不报警）", () => {
	const adminOnly = ALL_ACTIONS.filter((a) => can("admin", a) && !can("editor", a));
	assert.ok(adminOnly.length > 0, "admin 与 editor 完全同权 —— 矩阵可能被压平了");
});

test("#249 设备轴：techrep / teacher 不能碰设备（内容等级再高也不给远控默认）", () => {
	assert.equal(canDevice("techrep", "watch"), false);
	assert.equal(canDevice("techrep", "control"), false);
	assert.equal(canDevice("techrep", "remote"), false);
	assert.equal(canDevice("teacher", "remote"), false);
});

test("设备轴包含语义：owner 全档；homeroom 到 remote 不到 manage", () => {
	assert.equal(canDevice("owner", "manage"), true);
	assert.equal(canDevice("admin", "remote"), true);
	assert.equal(canDevice("homeroom", "remote"), true);
	assert.equal(canDevice("homeroom", "manage"), false, "manage 是设备管理动作，班主任不应持有");
});

test("userCan 显式称号完全覆盖：可降权也可提权", () => {
	// 降权：admin 被显式只挂 visitor → 失去管理动作
	const demoted = { role: "admin", titles: ["visitor"] };
	for (const a of ALL_ACTIONS) {
		if (can("viewer", a)) assert.ok(userCan(demoted, a));
		else assert.equal(userCan(demoted, a), false, `admin 被显式降为 visitor 却仍有 ${a}`);
	}
	// 提权：viewer 挂上 stationmaster 称号（admin 预设里含它）→ 获得对应动作
	const stationActions = ALL_ACTIONS.filter((a) => can("admin", a) && !can("editor", a));
	if (stationActions.length) {
		const promoted = { role: "viewer", titles: ["stationmaster"] };
		for (const a of stationActions) {
			assert.equal(userCan(promoted, a), true, `挂 stationmaster 称号应获得 ${a}`);
		}
	}
});

test("userCan 空 titles 回退角色预设；user 对象为空一律 false", () => {
	for (const a of ALL_ACTIONS) {
		assert.equal(userCan({ role: "editor" }, a), can("editor", a));
		assert.equal(userCan({ role: "editor", titles: [] }, a), can("editor", a), "空数组应回退而非清空");
		assert.equal(userCan(null, a), false);
		assert.equal(userCan(undefined, a), false);
	}
});

test("titlesOf：空值 → visitor 基础档", () => {
	assert.deepEqual(titlesOf(null), ["visitor"]);
	assert.deepEqual(titlesOf(undefined), ["visitor"]);
});
