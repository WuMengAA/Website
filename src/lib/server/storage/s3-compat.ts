/**
 * 通用 S3 兼容客户端 —— 手写 AWS SigV4，**不引入 @aws-sdk/client-s3**。
 *
 * 存在理由（2026-10-24）：
 * 站点**运行时**存储已收敛为本地磁盘（见 storage/local.ts），不再需要对象存储客户端。
 * 但**异地备份**仍然要往另一个服务商推（3-2-1 里的「1」），否则机器一没就全没。
 * 所以签名能力从原 r2.ts 里抽出来，做成**参数化**的通用客户端：
 * 凭证由调用方显式传入（而不是读死 R2_* 环境变量），这样它能同时服务
 * B2 / R2 / MinIO / 任何 S3 兼容端点，不再与某一个云厂商绑定。
 *
 * 只实现备份真正需要的三个动作：PUT（上传）、HEAD（回读校验时查存在与大小）、DELETE。
 * 不做 LIST —— 备份脚本靠自己记录的键名核对，没必要把分页逻辑也搬进来。
 *
 * 为什么不用官方 SDK：备份脚本要求零第三方依赖（node 内置即可跑），
 * 且 @aws-sdk/* 是整站最重的依赖之一，为一个月跑几次的脚本不值得。
 */
import crypto from "node:crypto";

const enc = new TextEncoder();

export interface S3Endpoint {
	endpoint: string; // 例：https://s3.us-west-001.backblazeb2.com
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	region: string; // B2 用 us-west-001；R2 用 auto
	prefix?: string; // 桶内前缀，可空
}

function sha256Hex(data: Uint8Array | string): string {
	const buf = typeof data === "string" ? enc.encode(data) : data;
	return crypto.createHash("sha256").update(buf).digest("hex");
}

function hmac(key: Uint8Array | string, data: string): Uint8Array {
	return crypto.createHmac("sha256", key as never).update(enc.encode(data)).digest();
}

/** AWS 要求：只保留非保留字符 A-Za-z0-9-_.~，其余一律百分号编码（斜杠要保留）。 */
function uriEncode(value: string, keepSlash = false): string {
	return value
		.split(keepSlash ? "/" : " ")
		.map((seg) =>
			encodeURIComponent(seg).replace(/%[0-9A-F]{2}/g, (m) => (m === "%7E" ? "~" : m))
		)
		.join(keepSlash ? "/" : " ");
}

function signRequest({
	method,
	host,
	path,
	payload,
	cfg,
	contentType,
}: {
	method: "PUT" | "HEAD" | "DELETE";
	host: string;
	path: string;
	payload: Uint8Array;
	cfg: S3Endpoint;
	contentType?: string;
}) {
	const now = new Date();
	// toISOString 形如 2026-09-26T01:39:00.000Z → 20260926T013900Z
	const amzDate = now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
	const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");

	const payloadHash = sha256Hex(payload);
	const canonicalUri = uriEncode(path, true) || "/";

	const headers: Record<string, string> = {
		host,
		"x-amz-content-sha256": payloadHash,
		"x-amz-date": amzDate,
	};
	if (contentType) headers["content-type"] = contentType;

	const signedHeaderKeys = Object.keys(headers).sort();
	const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${String(headers[k]).trim()}\n`).join("");
	const signedHeaders = signedHeaderKeys.join(";");

	const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
	const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
	const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

	const kDate = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
	const kRegion = hmac(kDate, cfg.region);
	const kService = hmac(kRegion, "s3");
	const kSigning = hmac(kService, "aws4_request");
	const signature = crypto.createHmac("sha256", kSigning).update(enc.encode(stringToSign)).digest("hex");

	return {
		authHeader:
			`AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
			`SignedHeaders=${signedHeaders}, Signature=${signature}`,
		headers,
		amzDate,
	};
}

function fullKey(cfg: S3Endpoint, key: string): string {
	const k = key.replace(/^\/+/, "");
	return cfg.prefix ? `${cfg.prefix}/${k}` : k;
}

export async function s3Put(
	cfg: S3Endpoint,
	key: string,
	body: Uint8Array,
	contentType = "application/octet-stream"
): Promise<void> {
	const full = fullKey(cfg, key);
	const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${full}`);
	const { authHeader, headers, amzDate } = signRequest({
		method: "PUT",
		host: url.host,
		path: `/${cfg.bucket}/${full}`,
		payload: body,
		cfg,
		contentType,
	});

	// ⚠️ headers 里已经有参与签名的 `content-type`（小写）。这里绝不能再补一个
	// "Content-Type"：Headers 对同名（大小写不敏感）的头是 append 而不是覆盖，
	// 结果会真的发出 `content-type: image/png, image/png`，存下的 MIME 就是错的。
	// Content-Length 同理交给 undici 自己算，手写的会被当作 forbidden header 丢掉。
	const res = await fetch(url, {
		method: "PUT",
		headers: { ...headers, Authorization: authHeader, "x-amz-date": amzDate },
		body: body as unknown as BodyInit,
	});
	if (!res.ok) {
		throw new Error(`S3 上传失败 ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
	}
}

export async function s3Head(
	cfg: S3Endpoint,
	key: string
): Promise<{ size: number; contentType: string } | null> {
	const full = fullKey(cfg, key);
	const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${full}`);
	const { authHeader, headers, amzDate } = signRequest({
		method: "HEAD",
		host: url.host,
		path: `/${cfg.bucket}/${full}`,
		payload: enc.encode(""),
		cfg,
	});
	const res = await fetch(url, {
		method: "HEAD",
		headers: { ...headers, Authorization: authHeader, "x-amz-date": amzDate },
	});
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`S3 HEAD 失败 ${res.status}`);
	return {
		size: Number(res.headers.get("content-length") ?? 0),
		contentType: res.headers.get("content-type") ?? "application/octet-stream",
	};
}

export async function s3Delete(cfg: S3Endpoint, key: string): Promise<void> {
	const full = fullKey(cfg, key);
	const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${full}`);
	const { authHeader, headers, amzDate } = signRequest({
		method: "DELETE",
		host: url.host,
		path: `/${cfg.bucket}/${full}`,
		payload: enc.encode(""),
		cfg,
	});
	const res = await fetch(url, {
		method: "DELETE",
		headers: { ...headers, Authorization: authHeader, "x-amz-date": amzDate },
	});
	// 404 视作「本来就不存在」，删除是幂等语义，不该因此报错中断清理流程。
	if (!res.ok && res.status !== 404) throw new Error(`S3 删除失败 ${res.status}`);
}
