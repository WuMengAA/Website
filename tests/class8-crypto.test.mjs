// 字段级加密单元测试（无服务依赖，直接验 class8-crypto.ts 的加解密与兼容行为）。
// 运行：node --test --experimental-strip-types tests/class8-crypto.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const KEY = "kVk4hvLnCvjB19vnZacdmoloBIXihPNQ9XXZbKhX4YY=";

// 每次用不同 query 强制 Node 重新求值模块，使模块内 _key 缓存按当前 env 重新初始化。
async function loadMod(withKey) {
  if (withKey) process.env.CLASS8_ENC_KEY = KEY;
  else delete process.env.CLASS8_ENC_KEY;
  const q = (withKey ? "?k=on&t=" : "?k=off&t=") + Math.random().toString(36).slice(2);
  return import("../src/lib/server/class8/class8-crypto.ts" + q);
}

test("enc/dec 文本 round-trip（有密钥）", async () => {
  const m = await loadMod(true);
  const plain = "张彭俊";
  const c = m.encText(plain);
  assert.ok(c.startsWith("v1gcm:"), "密文应带前缀");
  assert.notEqual(c, plain, "密文不应等于明文");
  assert.equal(m.decText(c), plain, "解密应还原");
});

test("enc/dec 数字 round-trip（有密钥）", async () => {
  const m = await loadMod(true);
  for (const v of [0, 46.5, 134, 99.5, 546]) {
    const c = m.encNum(v);
    assert.ok(c.startsWith("v1gcm:"));
    assert.equal(m.decNum(c), v, `数字 ${v} 解密应还原`);
  }
});

test("无密钥时降级为明文（兼容开发态）", async () => {
  const m = await loadMod(false);
  const plain = "王博泽";
  assert.equal(m.encText(plain), plain, "无密钥 encText 应原样返回");
  assert.equal(m.decText(plain), plain, "无密钥 decText 应原样返回");
  assert.equal(m.encryptionEnabled(), false);
});

test("遗留明文向后兼容（有密钥时 dec 不报错）", async () => {
  const m = await loadMod(true);
  assert.equal(m.decText("雷艺含"), "雷艺含", "无前缀明文应原样返回");
  assert.equal(m.decNum(108), 108, "数字明文应原样返回");
  assert.equal(m.decNum("108"), 108, "数字字符串明文应解析");
  assert.equal(m.isEncrypted("v1gcm:abc"), true);
  assert.equal(m.isEncrypted("王博泽"), false);
});

test("不同 IV 产生不同密文（语义安全）", async () => {
  const m = await loadMod(true);
  const a = m.encText("李思怡");
  const b = m.encText("李思怡");
  assert.notEqual(a, b, "同明文两次加密应不同（随机 IV）");
  assert.equal(m.decText(a), "李思怡");
  assert.equal(m.decText(b), "李思怡");
});
