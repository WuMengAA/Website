/**
 * 站点对象存储 —— **本地磁盘唯一后端**。
 *
 * 历史（2026-10-24 重构）：
 * 这里原本是 Cloudflare R2 客户端（手写 AWS SigV4，441 行），配齐 R2_* 走对象存储、
 * 没配就静默回退本地盘。现在按站点实际形态收敛为**只用本地盘**：
 *
 * - 生产环境从未配过 R2_*（.env 里全是空值），也就是说这段代码跑的一直是本地回退分支；
 *   那 400 行签名平日不执行，却要人一直读着、维护着、并在每次改动时担心它。
 * - 站点数据库（SQLite）与附件都落在同一台机器上、同一个 DATA_ROOT 下，
 *   备份由 `scripts/backup-db.mjs` 统一负责。再引入一个对象存储，等于把
 *   「文件在哪」从一件事变成两件事：本地盘一份、云端一份，出问题时先得猜是哪边的。
 * - 单机站点用云对象存储换来的好处（多实例共享）本站用不上，代价（凭证、签名、
 *   外链域名、配额两处记账）却是实打实的。
 *
 * 所以：附件与头像一律写 `UPLOADS_DIR`（即 uploads/），由 `/uploads/<key>` 直出。
 * 「落哪了」与「从哪读」始终自洽，不会出现「文件在本地、URL 指向云端」的 404。
 *
 * 异地备份**不走这里**：见 scripts/backup-db.mjs 的 B2 份（通用 S3 兼容签名，
 * 见 storage/s3-compat.ts）——那是备份的事，不是运行时存储的事。
 */
import fs from "node:fs";
import path from "node:path";
import { UPLOADS_DIR } from "../paths.js";

/** 站点存储根目录（供诊断 / 备份脚本复用，避免各处再拼一次路径）。 */
export const STORAGE_ROOT = UPLOADS_DIR;

/**
 * 本地盘恒可用，因此这里恒定 true。
 * 保留这个函数是为了让「存储是否就绪」的判断留在调用侧可见的位置，
 * 而不是让每个页面各写一遍「其实就是能用」。
 */
export function storageConfigured(): boolean {
	return true;
}

/** 存储后端标识：供 API 与后台如实展示，不再谎称云端。 */
export function storageProvider(): "local-disk" {
	return "local-disk";
}

/**
 * 目录不可写 / 路径非法时抛出。
 * 保留它是因为调用层已有 catch → 503 的处理链，删掉会让这些分支失去意义；
 * 本地盘虽不会「没配凭证」，但确实会「不可写」（权限、磁盘满、路径穿越）。
 */
export class StorageNotConfiguredError extends Error {
	constructor(what = "存储") {
		super(`${what}不可用：无法写入 ${UPLOADS_DIR}，请检查目录权限与磁盘空间。`);
		this.name = "StorageNotConfiguredError";
	}
}

/**
 * key → 磁盘绝对路径。
 * 必须做穿越防护：key 来自上传文件名，若不校验，一个 `../../etc/x` 就能写到站外。
 */
function localPath(key: string): string {
	const rel = key.replace(/^\.?\//, "");
	const p = path.resolve(UPLOADS_DIR, rel);
	if (p !== UPLOADS_DIR && !p.startsWith(UPLOADS_DIR + path.sep)) {
		throw new StorageNotConfiguredError("非法存储 key");
	}
	return p;
}

const MIME: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".avif": "image/avif",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".pdf": "application/pdf",
	".json": "application/json",
	".txt": "text/plain; charset=utf-8",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mp3": "audio/mpeg",
	".wav": "audio/wav"
};

function mimeOf(key: string): string {
	return MIME[path.extname(key).toLowerCase()] ?? "application/octet-stream";
}

/** 外链地址：本地盘直出，站内相对路径。 */
export function publicUrlForKey(key: string): string {
	return "/uploads/" + key.replace(/^\.?\//, "");
}

export interface PutResult {
	key: string;
	url: string;
	bytes: number;
}

export async function putObject(
	key: string,
	body: Uint8Array | ArrayBuffer | Buffer,
	contentType?: string
): Promise<PutResult> {
	const p = localPath(key);
	fs.mkdirSync(path.dirname(p), { recursive: true });
	const buf = body instanceof Uint8Array ? body : new Uint8Array(body as ArrayBuffer);
	fs.writeFileSync(p, buf);
	void contentType; // 本地直出时由静态服务器按扩展名给 MIME，入参保留以兼容调用签名
	return { key, url: publicUrlForKey(key), bytes: buf.byteLength };
}

export async function getObject(key: string): Promise<{ body: Uint8Array; contentType: string } | null> {
	const p = localPath(key);
	if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
	return { body: new Uint8Array(fs.readFileSync(p)), contentType: mimeOf(key) };
}

export async function headObject(
	key: string
): Promise<{ size: number; contentType: string } | null> {
	const p = localPath(key);
	if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
	return { size: fs.statSync(p).size, contentType: mimeOf(key) };
}

export async function deleteObject(key: string): Promise<void> {
	const p = localPath(key);
	if (fs.existsSync(p)) fs.unlinkSync(p);
}

/** 列出前缀下的相对键（递归，最多 limit 条）。 */
export async function listObjects(prefix = "", limit = 1000): Promise<string[]> {
	const base = path.resolve(UPLOADS_DIR, prefix.replace(/^\.?\//, ""));
	if (!fs.existsSync(base)) return [];
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, e.name);
			if (e.isDirectory()) walk(full);
			else out.push(path.relative(UPLOADS_DIR, full).replace(/\\/g, "/"));
		}
	};
	walk(base);
	return out.slice(0, limit);
}
