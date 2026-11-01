# Pending 任务核实清单（2026-11-01）

> 背景：TaskList 累计 48 条 pending。经过源码级逐条核实，**其中 15 条其实早已落地**（只是状态没关），
> 5 条已被后续决策明确取代。真正剩下的是 28 条。
> 本文给出逐条结论与优先级，**不擅自开工**——除已标 ✅ 的本轮已完成项外，均待点单。

## 一、核销：早已完成，状态滞后（已置 completed）

| # | 任务 | 核实证据 |
|---|------|----------|
| 27 | 批次二·论坛系统 | `src/routes/forum/`（列表/[channel]/[channel]/[thread]）+ `src/routes/admin/forum/` |
| 28 | 批次二·友链站长认证 | `src/routes/admin/link-applications/` + `src/routes/apply/` + `src/routes/admin/links/` |
| 29 | 批次二·归档版本快照+回滚 | `src/routes/admin/archives/` + `src/routes/archives/` + `src/routes/admin/mirror/` |
| 30 | 批次三·统一审核台 | `src/routes/admin/moderation/` |
| 31 | 批次三·文件管理 | `src/routes/admin/media/` + `src/routes/admin/library/` + `src/routes/library/` |
| 45 | 为 10 篇文章生成封面图 | `static/covers/` 11 个 svg，覆盖 `content/archive/posts/` 10 篇（落地为 **svg** 非任务描述的 png） |
| 46 | 更新 ROADMAP 与 PLAN-3batches | `ROADMAP.md` 已更新且内容属实（星图粒子/滚动计数/parallax ✅、封面字段 `cover` ✅） |
| 69 | 新增全站搜索 | `src/routes/search/` |
| 104 | 页面编辑改双栏模式 | `src/routes/editor/` + ROADMAP D 节「分栏实时预览编辑器」 |
| 125 | SvelteKit 宿主路由 + 引擎渲染验证 | 描述称已验证通过；遗留项已拆出（见 P3-3） |
| 137 | 验证 OAuth/新功能批次编译 | #198「svelte-check 类型校验清零/收敛」已完成，覆盖本批 |
| 138 | 分离提交 OAuth/新功能批次 | 同上（已提交，见 #73「构建、验证并推送全部改动」） |
| 172 | Vercel 保守接入：配置 + 文档 | 根目录 `vercel.json` 存在 |
| 173 | 社区动态：项目进度/更新日志/站点活跃度 | `src/routes/admin/activities/` |
| 174 | 内容治理：归档博客水文 + 保留自动重启文档 | `admin/doc-corrections` + `admin/moderation` + `admin/archives` |
| 136 | 清理临时探测文件 | ✅ **本轮完成**：`_probe/`、2 个 `_tmp_*` 已入回收站；工具归档至 `scripts/` |

## 二、删除：已被后续决策取代（已置 deleted）

| # | 任务 | 取代它的任务 |
|---|------|--------------|
| 144-148 | archive.ts / archive-array / class-archive / campus/classes 改 ArchiveArray / 构建部署验证 | **#149「回滚 campus/classes 到 Rhinelab 墙」** —— 方向相反，已撤销 |
| 167 | Cloudflare R2 存储驱动（SigV4 无 SDK） | **#220「移除 R2，改用站点数据库」** —— R2 方案整体废弃 |

## 三、真正待办（28 条）· 按优先级

### P0 — 阻塞 / 收尾（2 条）

| # | 任务 | 状态 |
|---|------|------|
| 62 | 定位并修复某后台列表页按钮无效 | **阻塞：需你指明具体页面。** 此前已 CDP 实测 docs/projects/pages 三个列表页排序按钮均生效、后台 21 页零控制台异常。无具体页面无法定位。 |
| 11 | 构建验证并 git 提交（in_progress） | 本轮 class8 五处修复 + 清理已上线，**尚待 git 提交** |

### P1 — 低成本快赢（4 条）

| # | 任务 | 说明 |
|---|------|------|
| 新增 | `content/posts/` 6 篇文章补封面 | #45 只覆盖了 archive 那批；这 6 篇 frontmatter **零 cover 字段**，是 #45 的真实遗留缺口。`scripts/gen-covers.mjs` 可复用。 |
| 112 | 构建重启并用 CDP 移动端实测验证 | 本轮已把该手法沉淀为 `scripts/c8-mobile-verify.mjs`，可照搬到 teacher 页等。 |
| 68 | 性能与安全优化 | 部分已覆盖（reveal-late 兜底、/admin 与 /api 的 no-store、权限门控），剩余项待界定。 |
| 32 | 批次三·安全审计 | `/admin/security` 不存在，但 `admin/permissions` + `admin/role-requests` + `admin/health` + `admin/doc-corrections` 已覆盖大半，建议先重新界定范围再决定是否单开。 |

### P2 — 中等工程（5 条）

| # | 任务 | 说明 |
|---|------|------|
| 7 | P2：统一设计体系 | `design.md` + `layout.css` tokens 已有基础，缺全局一致性收口。 |
| 186 | class8 板块改接 cloud-ws | 你已明确选「改接 cloud-ws」而非删除，但 `src/lib/server/cloud-ws` **在本工程不存在** → 跨工程依赖，须先确认 cloud-ws 工程位置与 class8 接口契约。 |
| 30 剩余 | 统一审核台剩余子项 | 主页面已在，细项待界定。 |
| 5 | 验证与部署 | 历史批次收尾项，建议按当前批次重列。 |
| 31 剩余 | 文件管理剩余子项 | media/library 已在，配额（#168）未见落地。 |
| 168 | 附件库数据模型与配额 | 存储已改站点数据库，但配额策略未落地。 |

### P3 — 大工程 / 高风险（5 组）

| # | 任务 | 说明 |
|---|------|------|
| 187 | 站点切 PostgreSQL | 服务端 PgBackend、parity 隔离库、逐表 parity 报告都已完成（#197-#201），**只差切生产** —— 生产切换是不可逆风险动作，须单独审批。 |
| 190-196 | db.ts 异步门面 / 18 个 server lib 转换 / 路由与 hooks 转换 / Phase 1-2 验证 | 大部分随 #197-#201 推进，需重新界定残余。 |
| 188 | 站点按业务拆服务 | 架构级改动，工作量与风险都最高。 |
| 125 遗留 | 3D 引擎：暗色模式 canvas 背景硬编码 `#eae5e1`；「全文阅读」DOM 覆盖层未实现；`@types/three` 缺失致 svelte-check 报类型错 | 拆为独立小任务更清晰。 |
| 27-32 剩余 | 论坛/友链/归档/审核/文件/安全的剩余子项 | 主页面已落地，剩余多为子功能打磨。 |

## 四、结论

- **48 条 pending → 实际 15 条已完成（状态滞后）+ 5 条已作废 + 28 条真待办。**
- 最该先做的两件：#11 提交本轮改动；#62 需要你给个具体页面。
- 唯一「你已明确拍板但还没动」的：**#186 class8 改接 cloud-ws**（跨工程，先摸契约）。
- 唯一「不可逆高风险」的：**#187 切 PostgreSQL 生产**，建议单独排期审批。
