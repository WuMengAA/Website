/**
 * 业务逻辑 · class8 门禁令牌（src/lib/server/class8/class8-auth.ts）
 *
 * 这是全班隐私内容的唯一闸门。HTTP 层（gate.test.mjs）已覆盖「站点接受什么」，
 * 这里下探一层测「令牌本身的安全性质」：签名绑定、篡改必拒、改密码即全体失效。
 * $env/dynamic/private 由 tests/_ts-hooks.mjs 代理到 process.env。
 */
import assert from "node:assert/strict";
import test, { before } from "node:test";
import {
	GATE_COOKIE,
	gateEnabled,
	verifyPasscode,
	issueToken,
	verifyGateToken,
	safeNext,
} from "../src/lib/server/class8/class8-auth.ts";

const PW = "unit-test-passcode-α";
let token;

before(() => {
	process.env.CLASS8_PASSCODE = PW;
});

test("门禁开关与常数时间校验", () => {
	assert.equal(gateEnabled(), true);
	assert.equal(verifyPasscode(PW), true);
	assert.equal(verifyPasscode(" wrong "), false); // 两端空白不宽容（trim 后不等）
	assert.equal(verifyPasscode(""), false);
	assert.equal(GATE_COOKIE, "c8_gate");
});

test("签发 → 校验往返成立；格式为 <过期毫秒>.<hex签名>", () => {
	const { token: t, maxAgeSec } = issueToken();
	assert.equal(maxAgeSec, 30 * 24 * 3600);
	assert.match(t, /^\d+\.[0-9a-f]{64}$/, "令牌必须是 exp.hmac-sha256-hex 结构");
	assert.equal(verifyGateToken(t), true);
	token = t;
});

test("篡改 payload（改一位过期时间）必拒", () => {
	const [exp, sig] = token.split(".");
	const tampered = `${Number(exp) + 1}.${sig}`;
	assert.equal(verifyGateToken(tampered), false, "改 exp 不重签必须失效");
});

test("篡改签名（换一位 hex）必拒", () => {
	const [exp, sig] = token.split(".");
	const flip = sig[0] === "0" ? "1" + sig.slice(1) : "0" + sig.slice(1);
	assert.equal(verifyGateToken(`${exp}.${flip}`), false);
});

test("签名正确但已过期必拒", async () => {
	const past = Date.now() - 1000;
	// 用「同一密码派生的签名」签一个过去的时间 —— 只有过期检查能拦它
	const crypto = await import("node:crypto");
	const hmacKey = crypto.createHmac("sha256", PW).update("c8-gate-key-v1").digest();
	const forgedButCorrectlySigned = `${past}.${crypto.createHmac("sha256", hmacKey).update(String(past)).digest("hex")}`;
	assert.equal(verifyGateToken(forgedButCorrectlySigned), false, "正确签名 + 过期时间必须被时间检查拦下");
});

test("格式攻击：缺点号 / 空串 / 纯数字 / undefined", () => {
	assert.equal(verifyGateToken("not-a-token"), false);
	assert.equal(verifyGateToken(""), false);
	assert.equal(verifyGateToken("12345"), false);
	assert.equal(verifyGateToken(undefined), false);
	assert.equal(verifyGateToken(null), false);
});

test("改密码 = 全体旧令牌立即失效（设计承诺，必须钉死）", () => {
	assert.equal(verifyGateToken(token), true, "前置：旧令牌在旧密码下有效");
	process.env.CLASS8_PASSCODE = PW + "-rotated";
	assert.equal(verifyGateToken(token), false, "密码轮换后旧令牌必须失效");
	// 新密码下签发的令牌有效
	const fresh = issueToken().token;
	assert.equal(verifyGateToken(fresh), true);
	process.env.CLASS8_PASSCODE = PW; // 还原
});

test("safeNext：回跳白名单只放行本班级区路径（防开放重定向）", () => {
	assert.equal(safeNext("/campus/2028/class8/board"), "/campus/2028/class8/board");
	assert.equal(safeNext("/campus/2028/class8"), "/campus/2028/class8");
	// 外部/协议相对/其他区一律打回默认页
	assert.equal(safeNext("https://evil.example.com/phish"), "/campus/2028/class8");
	assert.equal(safeNext("//evil.example.com"), "/campus/2028/class8");
	assert.equal(safeNext("/admin"), "/campus/2028/class8");
	assert.equal(safeNext(null), "/campus/2028/class8");
	assert.equal(safeNext(""), "/campus/2028/class8");
});
