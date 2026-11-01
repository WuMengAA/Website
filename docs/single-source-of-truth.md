# 单一事实源约定（2026-11-01 起）

> 这份文档解决一个具体问题：**改了代码，到底哪一份算数？**
> 在此之前有三份"看起来都算数"的东西：工作区源码树(a)、部署实例(ITH)、和 git 仓库。
> 现已统一为一句话：**a 树 + git 是唯一事实源，ITH 是它的派生物。**

---

## 一、为什么需要这份文档

2026-11-01 全局体检发现的四个症状，其实是同一个病：

| 症状 | 实测 |
|---|---|
| 双树靠人肉 cp | a 树 `D:\Stellara\stelarith-website`（IDE 打开）与 ITH `D:\Stelarith\Stelarith-website\stelarith`（线上跑）是两份独立拷贝 |
| git 历史不可考 | 仓库只有 **8 条提交**承载 74,158 行代码（历史曾为清除硬编码凭据而被重写）→ 无 `git blame`、无 `git bisect` |
| 任务台账失信 | 48 条 pending 里 15 条其实早已完成 |
| 配置与实际不符 | `.env` 配了 `DATABASE_URL=postgres://`，但 `DB_BACKEND` 未设 → 实际跑 SQLite |

四条的共同点是：**没有任何一处能被信任为「当前真相」**。

---

## 二、约定（唯一事实源）

```
a 树 (D:\Stellara\stelarith-website)
  ├── 源码 src/ scripts/ static/ tests/
  ├── 配置 package.json svelte.config.js vite.config.ts tsconfig.json loadenv.cjs
  └── git 仓库 ← 唯一事实源
        │
        │  scripts/sync-to-ith.py（单向，a → ITH，已固化进 deploy）
        ▼
ITH 树 (D:\Stelarith\Stelarith-website\stelarith)
  ├── 源码 = a 树的副本（只读派生，不要在 ITH 上直接改）
  ├── 运行态数据 content/（SQLite + 上传）  ← 只在此处，永不覆盖
  ├── 密钥 .env                              ← 只在此处，永不覆盖
  ├── 依赖 node_modules/
  └── 产物 build/ build.old-*/ build.next/
```

**铁律**

1. **改代码只在 a 树改，改完提交 git。**
2. **不要在 ITH 上直接改源码** —— 那是线上运行实例，改了会脱离版本控制
   （历史上 `518ded7`/`17af3ff` 两条提交就是这样，导致 a 树落后 64 行）。
3. **发版统一走 `scripts/c8-deploy.py`**：它会先自动从 a 树同步到 ITH，再降堆构建 + 原子切换。
4. **`content/`、`.env`、`node_modules/`、`build*` 永不参与同步**（它们是运行态，不是代码）。

---

## 三、工具

| 脚本 | 用途 |
|---|---|
| `scripts/sync-to-ith.py --check` | 只报告两树差异（推荐日常自检） |
| `scripts/sync-to-ith.py --apply` | 单向覆盖 a → ITH（只覆盖"a 有更新"的文件，**不删除** ITH 独有文件） |
| `scripts/c8-deploy.py` | 同步 → 降堆构建（1536 MB）→ 原子切换 → 验收 `/` 与 `/console/` |
| `scripts/site-restart.py` | 只重启（改了 `.env` / `loadenv.cjs` 时用，不重建） |
| `scripts/site-cleanup.py` | 构建备份/日志清理，默认 `dry` |
| `scripts/trash-tool.py` | 移入 Windows 回收站（`send2trash` 未安装） |
| `scripts/vault-sync-github.py` | 从 `dsh-vault` 取 `github-pat` 写入 `.env` 并验证 |

`sync-to-ith.py` 的比较**会归一化行尾**，否则 438 条 diff 里 422 条只是 LF/CRLF，噪音盖住真差异。

---

## 四、git 历史为什么只有 8 条

- **事实**：2026-10-25 之前的历史已被重写（为清除 `run-prod.bat` 里的硬编码凭据）。重写后仓库从"某一稳定点"重新起算。
- **不做的事**：不伪造历史。补造提交等于制造假证据，比没有历史更糟。
- **代价（必须记住）**：
  - 无法 `git blame` 追溯"这行为什么这么写" → 依赖 `docs/` 与 `.workbuddy/memory/` 里的记录；
  - 无法 `git bisect` 定位回归 → 因此**必须有回归测试**（见下）。

---

## 五、从现在起的规范

1. **一次改动一个提交，标题写清"为什么"**（不是"改了什么"——改了什么 diff 会说）。
2. **提交前先 `sync-to-ith.py --check`**，确保没有"只存在于 ITH"的改动被漏掉。
3. **关键链路改动必须跑 `npm test`**（`node --test tests/*.test.mjs`，25 条断言，零额外依赖）。
4. **里程碑打 tag**（如 `release-2026-11-01`），让"某个时间点线上是什么"可回溯。
5. **`.env` 不要用记事本/Excel 编辑** —— 会写入 UTF-8 BOM，导致首行键名带 `\uFEFF`
   （实测事故：`ADMIN_PASSWORD` 因此从未生效）。`loadenv.cjs` 现已剥 BOM，但别依赖它兜底。

---

## 六、遗留风险（未解决，如实记录）

1. **双树结构本身没消除** —— 现在是"靠脚本单向同步"，不是"物理上只有一份"。
   彻底方案是让 ITH 的源码目录指向 a 树（symlink / junction），或把构建产物与源码彻底分离。
   这需要停服窗口 + 回滚预案，**应单独排期**。
2. **`tests/` 已覆盖 5 条关键链路，但不覆盖业务逻辑**（内容 CRUD、权限矩阵细节、论坛）。
3. **ITH 树内仍有 8 个"仅一边存在"的文件**（`static/downloads/*.zip` 发布包、
   `.gitignore` 里的本地探测脚本），确认无害，但会让 `--check` 永远报 ③ 非零。
