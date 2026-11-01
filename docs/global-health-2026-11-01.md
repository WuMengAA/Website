# 全局体检报告（2026-11-01）

> 视角：跳出 class8 单模块，看**整个项目**的结构健康度。
> 依据：全部为实测数据（源码统计 / 构建产物 / 运行时探针 / .env 与日志实读），非推测。
> 性质：**审计与判断，未改动任何生产代码**。文中「修法」是建议，待点单。

---

## 一、一句话结论

**功能不缺，缺的是「单一事实源」。**

这个站有 123 个页面、116 个 API、74k 行代码，能力远超一个班级站该有的体量；
但**没有任何一处能被信任为「当前真相」**：git 历史不可考、任务台账失信、配置与实际不符、
两棵树靠人肉同步、零测试。所有「反复踩同一个坑」的现象都是这个病根的溢出。

---

## 二、体检数据

| 维度 | 实测值 |
|---|---|
| 源码规模 | 620 文件 / **74,158 行**（routes 39,193 + lib 34,765） |
| 路由 | **123 个页面** / 116 个 API 端点 / 59 个 page.server |
| 内容 | 40 篇 md（posts 6 + docs 15 + projects 5 + pages 4 + archive 10） |
| 依赖 | 30 deps + 15 devDeps（关键：svelte 5 / kit 2 / three 0.183 / pg 8） |
| **自动化测试** | **0 个测试文件，无测试配置** |
| TODO/FIXME | 仅 3 处（干净得反常 —— 债务没被标记，不等于没有） |
| git 历史 | **仅 8 条提交**承载 74k 行（首末：2026-10-25 ~ 11-01，历史被重写过） |
| 构建产物 | 66 MB；单文件 CSS **216 KB** 未分块 |
| 部署树磁盘 | **1,283 MB** 历史构建垃圾（详见问题 4） |
| 运行时 | 8090 `/`=200 `/console/`=200；公网首页 200 / **1.22s** |
| `.env` | **38 项**，横跨 CIMS / Console / P2P / VoiceHub / OAuth / Backup |
| 最大文件 | `rhinelab/scene.ts` 1,844 行、`console-ext.ts` 1,649 行、`api/console/ext/[...path]/+server.ts` 1,429 行 |

---

## 三、六个结构性问题（按严重度）

### P0-1 · 配置幻觉（安全）：`ADMIN_PASSWORD` 从未生效过

- **实测**：`.env` 文件前 3 字节是 `efbbbf`（**UTF-8 BOM**），第一行实际是 `\ufeffADMIN_PASSWORD=...`。
- **实测**：`loadenv.cjs` 用 `fs.readFileSync(envFile, 'utf8')`，**不剥离 BOM**。
  → `process.env"`\ufeffADMIN_PASSWORD`"` 被写入，而 `process.env.ADMIN_PASSWORD` **始终 undefined**。
- **后果**：`src/lib/server/db.ts:707` 的 `const generated = !process.env.ADMIN_PASSWORD` **恒为 true**；
  `auth.ts:182` 读到的也是空。**你以为在 .env 里改管理员密码，其实改了不生效。**
- **好在**：库早已初始化过，`seedPassword` 的随机分支没再次触发，所以**没有明文密码落进日志**
  （`release-build.log` 里 201 处 `password` 命中全是构建产物路径 `api/me/password/`，已逐条确认）。
- **性质**：不是「已被入侵」，而是**你以为锁了门，其实门锁从来没接上电**。比弱口令更危险。
- **修法**：`loadenv.cjs` 读取后加一行 `content.replace(/^\uFEFF/, '')`；顺手把 BOM 从 .env 里去掉。

### P0-2 · 单一事实源缺失（病根，串起 4 个症状）

| 症状 | 实测 |
|---|---|
| **git 历史不可考** | 仅 8 条提交承载 74k 行。历史被重写过（记忆载：为清除 `run-prod.bat` 硬编码凭据）。**无法 blame、无法 bisect** —— 定位回归只能靠猜。 |
| **任务台账失信** | TaskList 48 条 pending 里，**15 条其实早已落地**（论坛/审核台/友链/搜索/双栏编辑器…），只是状态没关。台账不再代表真实进度。 |
| **配置与实际不符** | `.env` 配了 `DATABASE_URL=postgres://...`，但 **`DB_BACKEND` 未设置** → `db.ts:1074` 默认走 `sqlite`。**线上实际跑的是 `content/stelarith.db`（1.24 MB）**，那个 postgres 配置是死配置，只会误导下一次迁移。 |
| **两棵树靠人肉同步** | 详见下方「数据澄清 1」。 |

### P1-3 · 可见性全押在 JS 上（三次踩坑同源）

- 规模：**77 处 `use:reveal`** + 11 处 `reveal-mask` + 7 处 `reveal-wipe` + 2 处 `reveal-rise` + 2 处 `reveal-clamp`。
- 三次事故同源：
  1. 10-31 board 页照片墙「看不到」→ `reveal-wipe` 的 `clip-path` 初态等待 JS 解除；
  2. 11-01 class8 42 张缩略图全白 → `.loaded` 运行时类被 unused-CSS 剪枝，`img{opacity:1}` 规则被删；
  3. 11-01 条形图在 `reveal-late` 下永远空条 → 兜底规则漏了 `width`。
- **根因不是某一次写错，而是「初始状态由 CSS 藏、终态靠 JS 补」这个模式本身**。
  项目已有 `html.js` / `reveal-late` / `prefers-reduced-motion` 三重兜底，但兜底清单永远漏项（第 3 次就漏了 width）。
- **0 测试**放大了它：每次都要靠 CDP 手测才发现，而手测不可回归。

### P1-4 · 日志与构建垃圾从不回收

- **构建备份 5 份共 1,283 MB**：`build` 308.4 + `build.old-1793499370` 308.4 + `build.old-1793500278` 308.4
  + `build-backup-20261004-{pre-stageB,prelaunch,presec}` 各 ~103 + `build.bak-20260927` 49.5。
  `release-site.mjs` 只保留 2 个 `build.old`，**2026-09-27 和 10-04 那 4 份是永久遗留**。
- **日志 44 MB 不轮转**：`release-build.log` **34.2 MB 单文件**、`cloudflared.log` 6.24 MB、
  `selfcheck-2h.jsonl` 5.53 MB，另有 **40 个散落文件**（`viewer-87b`…`viewer-90a` 十几个一次性）。
- 另发现**垃圾空壳**：`StelarithStelarith-websitestelarithcontentstelarith.db`（**0 字节**）——
  路径拼接错误产生的文件名，.gitignore 里已有 `/*.db` 规则但部署树里这个还活着。

### P2-5 · 职责超载：这个站在当中台

`.env` 38 项覆盖了 CIMS（4）、Console 审计/设备/会话（5）、P2P（4）、VoiceHub（2）、
OAuth 双客户端（2）、B2 备份（5）、class8（1）、GitHub（2）。
一个「班级展板 + 博客」的站点，同时承担集控面板、桌面端会话、语音中心、P2P 中继 ——
这就是为什么会有 **116 个 API 端点**和 1,844 行的 `scene.ts`。

**这不是 bug，是定位问题。** 但定位不清会持续产生「这个功能该放这边还是那边」的摇摆，
pending 里 #186（class8 改接 cloud-ws）、#188（按业务拆服务）都是这个摇摆的产物。

### P2-6 · 鉴权有 5 种写法，一致性靠人肉

抽样实测到 5 套并行入口：`getApiUser()+can()` / `guardControl()` / `deviceSecretOk()` /
`sessionUser()` / `verifyToken()`。架构其实是**有体系的**（不是裸奔，见数据澄清 3），
但 5 个入口意味着「新增端点该用哪个」只能靠记忆 —— 历史上就出过 `canManage` fail-open。

---

## 四、数据澄清（我一开始的误判，必须更正）

**1. 「两棵树分叉 438 个文件」→ 实际真差异只有 1 处注释。**
`diff -rq` 报 438 条，但逐条忽略行尾后：**422 条是 LF/CRLF 行尾差异**，
15 条是 BOM/末尾换行差异（`diff` 报 differ 但差异行数 = 0），
**唯一真内容差异是 `github.ts` 的 6 行注释**（关于反代只反 git 协议的说明）。
→ 「两棵树已深度分叉」的记忆需要更正：**目前实质一致**。但靠人肉同步的风险仍然存在。

**2. 「53 个 API 无任何鉴权关键字」→ 假警报。**
抽查 5 个高危端点（settings / device/activate / activation-codes / media / account/avatar）
**全部有鉴权**，只是用了我的关键字列表没覆盖的函数名。36 个「无鉴权写操作」同理，需逐个核，不能当漏洞。

**3. 「日志里泄漏明文密码」→ 不成立。**
48 处日志文件中 `password` 相关命中，逐条看全是构建产物路径。`[auth] 此密码仅显示一次` 从未触发。

---

## 五、建议处置顺序

| 优先级 | 动作 | 成本 |
|---|---|---|
| **立刻** | 修 `loadenv.cjs` 的 BOM 剥离 + 清掉 .env 的 BOM | 1 行 + 1 次重启 |
| **立刻** | 删掉 4 份永久遗留 build 备份（1,283 → ~617 MB）+ 0 字节垃圾 .db | 5 分钟，纯删除 |
| **本周** | 给 `release-build.log` 加轮转（保留最近 N 次）；清理 40 个散日志中的一次性产物 | 小 |
| **本周** | `.env` 补一行 `DB_BACKEND=sqlite`（显式声明），或删掉误导性的 `DATABASE_URL` | 1 行 |
| **本月** | 补 5 个「关键链路」测试（门禁令牌 / 端点鉴权 / 发布切换 / 姓名脱敏 / reveal 可见性）—— 不求覆盖率，只求这 5 条能回归 | 中 |
| **结构性** | 终止双树：改成「单一源码树 + release 产物目录」，消除人肉同步 | 大，需单独排期 |
| **结构性** | 把 `reveal` 的兜底从「列清单」改成「默认可见、动画只做增强」—— 从机制上消灭第 4 次踩坑 | 中 |

---

## 六、未验证 / 声明

1. **未做压力与并发测试**（单请求 1.22s，但并发/冷启动未测）。
2. **未做全量 API 鉴权逐条核验** —— 只抽查 5 个高危端点，另 31 个「无关键字匹配」的写操作端点仍需逐个确认。
3. **未评估 PostgreSQL 迁移就绪度** —— 只确认了「配了但没启用」，parity 报告(#201)的真实结论未复核。
4. **未审 Svelte 5 runes 迁移完整性** —— 构建日志 1,131 条提示里有反复出现的 `superForm` 警告，未逐一归因。
5. 本报告**未改动任何生产代码**，所有「修法」均待你点单。
