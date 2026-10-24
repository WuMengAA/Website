/**
 * GitHub REST API 反代 Worker（Stelarith 站点「同步仓库」用）
 * ------------------------------------------------------------------
 * 背景：部署机/本地网络直连不上 api.github.com（DNS 能解析但 TCP 连不上，fetch 直接失败）。
 *       本 Worker 跑在 Cloudflare 边缘，由 CF 的网络去访问 api.github.com，再把结果回传。
 *
 * 安全：
 *  - 上游地址 **硬编码** 为 https://api.github.com，杜绝被当作任意 URL 的开放代理。
 *  - 仅放行 GET/HEAD 读请求；仅允许 /repos、/users、/user、/orgs、/search、/rate_limit
 *    这些前缀，收敛可被代理的 API 面。
 *  - 必须带 Authorization 才会转发（否则 401），避免令牌被任意第三方盗用刷 GitHub 配额。
 *    若给本 Worker 配置了 GITHUB_TOKEN 环境变量（密钥），则可兜底使用，无需调用方带令牌。
 *
 * 部署后，把站点 .env 的 GITHUB_API_BASE 指向本 Worker 地址，例如：
 *   GITHUB_API_BASE=https://stelarith-github-api-proxy.<你的子域>.workers.dev
 */

const UPSTREAM = 'https://api.github.com';

const ALLOWED_PREFIXES = [
  '/repos/',
  '/users/',
  '/user',
  '/orgs/',
  '/search/',
  '/rate_limit'
];

function allowed(pathname) {
  if (pathname === '/rate_limit') return true;
  return ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

function resolveAuth(request, env) {
  const incoming = request.headers.get('Authorization');
  if (incoming) return incoming;
  if (env && env.GITHUB_TOKEN) return `Bearer ${env.GITHUB_TOKEN}`;
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    if (!allowed(pathname)) {
      return new Response('Forbidden path', { status: 403 });
    }

    const auth = resolveAuth(request, env);
    if (!auth) {
      return new Response('Missing Authorization (set GITHUB_API_BASE caller token or Worker GITHUB_TOKEN secret)', { status: 401 });
    }

    const upstreamUrl = UPSTREAM + pathname + (url.search || '');
    const headers = new Headers(request.headers);
    headers.set('Host', 'api.github.com');
    headers.set('User-Agent', 'stelarith-github-proxy');
    headers.set('Authorization', auth);
    headers.delete('CF-Connecting-IP');
    headers.delete('CF-Visitor');
    headers.delete('X-Forwarded-For');

    const upstreamReq = new Request(upstreamUrl, {
      method: request.method,
      headers,
      redirect: 'follow'
    });

    try {
      const resp = await fetch(upstreamReq);
      const out = new Headers(resp.headers);
      out.set('Access-Control-Allow-Origin', '*');
      out.set('Cache-Control', 'public, max-age=60');
      return new Response(resp.body, {
        status: resp.status,
        headers: out
      });
    } catch (e) {
      return new Response('Upstream error: ' + (e && e.message ? e.message : String(e)), {
        status: 502
      });
    }
  }
};
