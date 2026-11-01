// 加载 .env 到 process.env（轻量，无第三方依赖；与 dotenv 语义兼容）。
// 被 node -r 预加载：`node -r loadenv.cjs build/index.js`
// ⚠️ 必须剥离 UTF-8 BOM（2026-11-01 实测事故）：
//    .env 被记事本/Excel 之类的编辑器保存后会带上 EF BB BF 三个字节，
//    不剥离的话第一行的键名会变成 "\uFEFFADMIN_PASSWORD"，
//    于是 process.env.ADMIN_PASSWORD 永远是 undefined ——
//    表现为「在 .env 改了管理员密码，其实改了个寂寞」。只影响首行，所以只有第一个键中招。
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname);
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
