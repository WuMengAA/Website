/**
 * 2028届八班 · 字段级加密（AES-256-GCM，应用层）。
 *
 * 目标：姓名（class8_members / class8_leaders）与成绩（class8_scores.score）
 * 落盘即密文，降低「sqlite 文件 / B2 备份」被直接读取时的 PII 泄露面。
 *
 * 设计要点：
 *  - 密钥取自环境变量 CLASS8_ENC_KEY（32 字节，base64）。缺失时**降级为明文**
 *    （仅开发态；生产 .env 必须配置），保证本地构建/测试不因缺密钥而崩。
 *  - 密文统一加前缀 `v1gcm:`，便于识别与向后兼容：
 *    读到一个无前缀的值 → 视为遗留明文，原样返回（迁移前的数据不报错）。
 *  - 聚合（小组均分等）在应用层「读出→解密→计算」，不依赖 SQL AVG。
 *
 * 已知残余风险（部署后向用户说明）：class8-seed.ts 内仍硬编码真实姓名作为
 * 引导数据源（私有仓库、受信边界内）。如需把姓名也移出 git，属独立改造项。
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "v1gcm:";
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

let _key: Buffer | null | undefined;
function getKey(): Buffer | null {
  if (_key !== undefined) return _key;
  const b64 = process.env.CLASS8_ENC_KEY;
  if (!b64) {
    _key = null;
    return _key;
  }
  try {
    const k = Buffer.from(b64, "base64");
    _key = k.length === 32 ? k : null;
  } catch {
    _key = null;
  }
  if (_key === null) {
    // 密钥存在但格式不对（非 32 字节 base64）→ 同样降级明文，避免启动崩溃
    console.warn("[class8-crypto] CLASS8_ENC_KEY 无效（需 32 字节 base64），已降级为明文存储");
  }
  return _key;
}

export function isEncrypted(s: unknown): boolean {
  return typeof s === "string" && s.startsWith(PREFIX);
}

export function encText(plain: string): string {
  const key = getKey();
  if (key === null) return plain;
  if (typeof plain === "string" && plain.startsWith(PREFIX)) return plain;
  const iv = randomBytes(IV_LEN);
  const c = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decText(cipher: unknown): string {
  const key = getKey();
  if (key === null) return typeof cipher === "string" ? cipher : String(cipher ?? "");
  if (typeof cipher !== "string" || !cipher.startsWith(PREFIX)) return typeof cipher === "string" ? cipher : String(cipher ?? "");
  const raw = Buffer.from(cipher.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = raw.subarray(IV_LEN + TAG_LEN);
  const d = createDecipheriv(ALGO, key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export function encNum(n: number): string {
  return encText(String(n));
}

export function decNum(c: unknown): number {
  if (typeof c === "number") return c;
  if (c === null || c === undefined) return 0;
  const s = String(c);
  if (!s.startsWith(PREFIX)) {
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : 0;
  }
  const v = parseFloat(decText(s));
  return Number.isFinite(v) ? v : 0;
}

/** 当前是否处于加密态（供迁移判断）。 */
export function encryptionEnabled(): boolean {
  return getKey() !== null;
}
