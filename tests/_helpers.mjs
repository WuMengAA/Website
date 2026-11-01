/**
 * 关键链路测试的共享工具。
 *
 * 设计取舍：这些测试跑在**真实运行中的站点**上（默认 127.0.0.1:8090），
 * 而不是 import 源码做单测。理由：
 *   1. 项目零测试基础设施，引入 vitest 要动依赖、要配 transform；
 *   2. 真正出过事故的地方（门禁、鉴权、SSR 可见性、脱敏）都是**行为层面**的问题，
 *      HTTP 层断言比函数级单测更贴近事故现场；
 *   3. Node 22 自带 node:test + fetch，零新依赖。
 *
 * 代价：必须先有实例在跑。见 tests/README.md。
 */
import crypto from "node:crypto";
import fs from "node:fs";

export const BASE = process.env.TEST_BASE || "http://127.0.0.1:8090";
export const ENV_FILE = process.env.STELARITH_ENV || "D:/Stelarith/Stelarith-website/stelarith/.env";

/** 读取生产 .env（**剥 BOM**，与 loadenv.cjs 修复后的行为一致）。 */
export function readEnv() {
  const raw = fs.readFileSync(ENV_FILE, "utf8").replace(/^\uFEFF/, "");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}

/**
 * 构造 class8 门禁令牌，规则必须与 src/lib/server/class8/class8-auth.ts 完全一致：
 *   hmacKey = HMAC_SHA256(passcode, "c8-gate-key-v1")
 *   token   = `${expMs}.${HMAC_SHA256(hmacKey, expMs).hex}`
 */
export function gateToken(passcode, ttlMs = 30 * 24 * 3600 * 1000) {
  const hmacKey = crypto.createHmac("sha256", passcode).update("c8-gate-key-v1").digest();
  const exp = String(Date.now() + ttlMs);
  const sig = crypto.createHmac("sha256", hmacKey).update(exp).digest("hex");
  return `${exp}.${sig}`;
}

/** 登录后台，返回 admin_token cookie 值（成功）或 null。 */
export async function loginAdmin(username, password) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", username, password }),
  });
  if (!res.ok) return null;
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const m = /^admin_token=([^;]+)/.exec(c);
    if (m) return m[1];
  }
  const j = await res.json().catch(() => ({}));
  return j.token ?? null;
}

/** 站点是否在跑（用于 skip 而不是让整批测试炸掉）。 */
export async function siteUp() {
  try {
    const r = await fetch(BASE + "/", { signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch {
    return false;
  }
}
