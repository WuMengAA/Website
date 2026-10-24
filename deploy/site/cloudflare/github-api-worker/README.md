# GitHub API 反代 Worker（让「同步仓库」在封锁网络下可用）

站点后台「同步仓库」依赖 `api.github.com` 的 REST API。但部署机所在网络直连不上
`api.github.com`（DNS 可解析、TCP 连不上，`fetch failed`）。本 Worker 跑在 Cloudflare
边缘，由 CF 的网络去访问 `api.github.com`，再把结果回传给站点。

> 注意区分：**git 代理**（如 `gh.245959623.xyz`，只反代 clone/pull/push 用的 git 智能
> HTTP 协议）**不能**当作 GitHub REST API 的反代。本 Worker 才是为 REST API 准备的。

## 部署（二选一）

### A. 用 Wrangler CLI（推荐）
```bash
cd deploy/site/cloudflare/github-api-worker
npm i -g wrangler
wrangler login            # 浏览器里授权你的 CF 账号
wrangler deploy           # 部署，终端会打印 *.workers.dev 地址
```
可选：把 `wrangler.toml` 里的 `routes` 注释打开，绑定自定义域（如 `gh-api.245959623.xyz`）。

### B. Cloudflare 控制台（无 CLI）
1. Workers & Pages → Create → 新建 Worker，命名 `stelarith-github-api-proxy`。
2. 把 `src/index.js` 的全部内容粘贴进编辑器，Save and Deploy。
3. 记下分配的 `*.workers.dev` 地址（也可在 Triggers → Custom Domains 绑 `gh-api.245959623.xyz`）。
4. （可选）Settings → Variables → 添加 secret `GITHUB_TOKEN`（你的 PAT），这样 Worker 可兜底注入令牌。

## 接线：让站点用上它
在**源站机器**的站点 `.env` 里加一行（地址换成你刚部署的 Worker 地址）：
```
GITHUB_API_BASE=https://stelarith-github-api-proxy.<你的子域>.workers.dev
```
然后重启站点进程（裸进程路径：`node scripts/release-site.mjs switch`；或通过计划任务重启
`StelarithServer`）。无需改代码——`src/lib/server/github.ts` 已读取 `GITHUB_API_BASE`。

## 验证
源站上跑：
```bash
curl -H "Authorization: Bearer <你的GITHUB_TOKEN>" \
  "<GITHUB_API_BASE>/repos/WuMengAA/Website"
```
返回仓库 JSON 即通。后台「仓库同步」页点「测试连接」应显示已认证 + 剩余配额 5000/时。

## 安全说明
- 上游硬编码 `api.github.com`，无法被用于代理任意网址。
- 仅放行 GET/HEAD 与有限的 API 前缀；无 Authorization 直接 401。
- 令牌经 HTTPS 发往你自己的 Worker，再由 CF 边缘转发给 GitHub，不外泄给第三方。
