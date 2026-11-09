# 星集控「网页操作端」下线（安全策略 · 2026-11-09）

> 需求原话：「因安全策略考虑，去掉网站后台的星集控」；范围澄清：「不去掉登录等敏感功能，只有网页操作端」。
> 本文是唯一技术说明。改动全部可逆，**不删除任何源码文件**。

---

## 一、下线的到底是什么

「星集控」在本站不是侧栏一个菜单项，而是一整套通过浏览器操作教室设备的**网页操作端**，有两套入口：

| 入口 | 实现 | 伺服方式 | 是否经过 hooks |
|---|---|---|---|
| `/admin/console/**` | SvelteKit 面板，约 20 个子页 | SvelteKit 路由 | ✅ 经过 |
| `/console/**` | 原生静态面板 `static/console/`（index.html + WebRTC/P2P） | adapter-node 静态伺服 | ❌ **绕过** |

第二套是最大的洞：代码注释自己写明「双轨期旧面板仍服务，直连 `/console/index.html` 仍可进」。
静态文件由 adapter-node 的静态中间件直出，**不进入 `hooks.server.ts`**，所以只加 404 硬门挡不住它。

## 二、边界（越界就是事故）

**下线（✅）**

- 两套网页面板的所有浏览器访问路径
- 前台 `app-sidebar` 与后台 `admin/+layout.svelte` 里的「星集控」菜单项，含 `content/nav.json` 运行时覆盖层里可能配置的指向面板的链接
- 登录 / 权限分流里指向 `/admin/console` 的跳转
- `/campus/broadcast` 的「前往集控面板」按钮
- CSP 里为远控页放行的 P2P 信令源（`script-src` / `connect-src`）

**保留（❌ 一律不动）**

- `/admin/login`、`/api/auth`、登录限流、会话 cookie
- OAuth 全链路：`/oauth/authorize`、`/oauth/token`、`/oauth/userinfo`、`oauth-clients.ts`
- `/api/console/**` 控制轴、`/api/device/**` 被控轴、`/api/console/cims/**` 代理
- `guard-device.ts` / `guard-control.ts` 两轴守卫
- 启动时挂载的定时广播调度器（`startScheduledBroadcastScheduler`）
- 设备会话密钥、CIMS 白名单、`content/console-allow.json`
- 前台公开内容：下载中心、项目页、文章、文档、页面标题里的「星集控」品牌
- 桌面端 / 被控端 OTA 契约与 `site-version.ts`

**为什么调度器保留**：它是设备侧后台任务，停掉会让在线教室机收不到定时广播，属于业务中断。
方案讨论时一度写成「停掉调度器」，与「在线教室机不受影响」自相矛盾，已按用户「只有网页操作端」的边界纠正。

## 三、实现

单一真源开关：`src/lib/console-web.ts`（纯函数，前后端共用，不依赖 server-only 模块）

```ts
isConsoleWebEnabled(env)              // 只有 "1"/"true" 才开启；默认/空/乱填 = false（fail-closed）
isConsoleWebPath(pathname)            // 命中 /admin/console/** 与 /console/**，带斜杠边界
shouldBlockConsoleWeb(pathname, env)  // 服务端硬门唯一判定；hooks 与回归测试共用同一份
isConsoleWebHref(href)                // 导航链接过滤，去掉 query/hash/绝对域名后判定
```

`shouldBlockConsoleWeb` 抽成纯函数的原因：`hooks.server.ts` 的 import 链会拉起
整条 DB/鉴权依赖，无法在 `node:test` 里零副作用加载 —— 把判定逻辑与 hooks 共用，
测试测到的就是线上跑的那份，而不是复制品。

| 层 | 改动 |
|---|---|
| `hooks.server.ts` | handle 最前面加硬门：关闭且命中 → 直接返回 404 纯文本，不进 resolve、不渲染 layout、不查数据；修 `/admin/console` 重定向死链；CSP 的 P2P 放行随开关收紧 |
| `+layout.server.ts` | 下发 `consoleWebEnabled` 到全站 `data`（客户端不读 `process.env`） |
| `console-web.ts` / `view-switch-nav.ts` | 开关判定；`adminEntryHref(user, enabled)`，纯 `viewConsole` 账号关闭时返回 `null`（入口消失） |
| `app-sidebar.svelte` | `buildSection` 统一过滤 + 自定义组 / 底部链接过滤 |
| `admin/+layout.svelte` | 「项目」折叠组按开关整体不渲染 + 自定义组过滤 |
| `admin/login/+page.server.ts` | `homeFor`：纯 `viewConsole` 账号关闭时落 `/`，不再跳 404 |
| `campus/broadcast/+page.svelte` | 「前往集控面板」按钮按开关隐藏 |
| `static/console/` → `_retired/console-web-static/` | `git mv` 15 个文件，**零删除、内容零改动**，构建产物不再含 `/console/*` |
| `tests/_ts-hooks.mjs` | 测试钩子增加 `$lib/xxx.js` → `.ts` 存在性回退 |
| `tests/console-web.test.mjs` | 14 条纯逻辑断言，不依赖运行实例 |
| `.env.example` | 开关说明与回滚步骤 |

**`/admin/console/**` 子页源码全部保留**，只是被硬门拦在门外；开关恢复后原样可跑。

## 四、验证

- `node --test ... tests/console-web.test.mjs` → **14/14 PASS**
- 全量 `npm test` → **60/60 PASS**（原 46 + 新增 14，零回归）
- `vite build`（降堆 1536 MB，输出到旁路 `build.verify`）→ **27.4s 构建成功**；新产物 `client/` 下确认**无 `console` 目录**；临时产物已移入回收站
- `npm run check` → 全量 101 errors / 113 warnings，均为**既有债务**（`$state` 变量遮蔽、a11y、`csrf.checkOrigin` 弃用等，分布在 `verify/+page.svelte`、`image-tool` 等无关文件）；**本次改动的 9 个文件零命中**，未引入新类型错误。vite 构建不做类型检查，故不阻塞。
- 用例覆盖：开关 fail-closed、两套面板路径命中、硬门对登录/OAuth/设备 API 一律放行、导航 href 过滤、`techrep` 入口收敛与开关回滚、静态目录已移出、15 文件全保留、hooks 硬门位置在最前

## 五、回滚（两步，缺一不可）

```bash
# 1) 打开开关并重启服务
#    .env: CONSOLE_WEB_ENABLED=1
python scripts/site-restart.py

# 2) 把静态面板移回并重新构建发布
git mv _retired/console-web-static static/console
python scripts/c8-deploy.py
```

只做第 1 步，`/admin/console/**` 与菜单会恢复，但 `/console/index.html` 仍 404（源文件不在 `static/`）。

## 六、⚠️ 线上生效的前置条件（未完成，需授权）

本次改动只落在 **a 树 + git**，**没有部署到源站**。三件必须做的事：

1. **必须重新构建发布**。源站当前 `build/client/console/` 里的旧静态文件还在；因为静态伺服绕过 hooks，只要旧产物还在线上，`/console/index.html` 就仍可直连。原子切换后新 `build/` 是全量重建，才真正清除。
2. 同步到 ITH 部署树（`sync-to-ith.py --apply` 或 `c8-deploy.py` 内置）。
3. 验收：
   - `GET /admin/console` → 404；`GET /console/index.html` → 404
   - `GET /admin/login` → 200；`POST /api/auth` 可登录
   - `GET /api/console/control/device-status`（带权限）→ 与改前一致
   - 设备端心跳 / 定时广播不受影响

## 七、残留风险（如实记录）

- **设备 API 轴仍对外可达**（`/api/console/control/**`、`/api/device/**`）。这是用户明确选择保留的（在线教室机不能断）。若安全目标是「攻击面完全归零」，需要单独评估关停设备通道，那会带来生产业务中断，属 Danger 0，须另行授权。
- `viewConsole` 权限位、`techcommissioner` / `classTeacher` 等称号、`ia.ts` 里 `/admin/console` 的导航归属元数据**保留**。它们不再是可达页面入口，但也没清理——为了可回滚。
- 前台「星集控」品牌内容保留，站点对外仍能看到该产品名。若需全站去品牌化，范围跨出后台，需单独点单。
