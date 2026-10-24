/**
 * /api/library —— 个人附件库列表 / 上传。
 *
 * 所有查询都以「当前登录用户 id」为 owner 条件：这就是账号间数据隔离的实现本身，
 * 不是附加的校验。前端传任何 folderId 都只会被当作「在**我的**库里筛选」。
 */
import { json } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import { sessionUser } from "$lib/server/session.js";
import { recordActivity } from "$lib/server/activity.js";
import {
	ensureRootFolders,
	listFiles,
	listFolders,
	usageOf,
	saveUpload,
	MAX_FILE_BYTES,
	QuotaExceededError,
	type ListFilesOptions
} from "$lib/server/attachment-library.js";
import { storageProvider, StorageNotConfiguredError } from "$lib/server/storage/local.js";

function bad(msg: string, status = 400) {
	return json({ error: msg }, { status });
}

const ALLOWED_IMAGE_MIME = /^image\/(jpeg|png|webp|avif|gif)$/;
type TargetFormat = "avif" | "webp" | "original";

/** GET /api/library —— 目录树 + 文件列表 + 配额。一次拿全，前端不用发三趟。 */
export async function GET(event: RequestEvent) {
	const user = await sessionUser(event);
	if (!user) return bad("未登录", 401);
	const sp = event.url.searchParams;
	const folderId = sp.get("folder");
	const kind = (sp.get("kind") ?? "all") as ListFilesOptions["kind"];
	const q = sp.get("q") ?? "";
	await ensureRootFolders(user.id);
	return json({
		usage: await usageOf(user.id),
		folders: await listFolders(user.id),
		files: listFiles(user.id, {
			folderId: folderId === "root" ? null : folderId,
			kind: kind === "all" ? undefined : kind,
			q: q.trim() || undefined
		}),
		storage: {
			// 2026-10-24：存储后端只剩本地磁盘一个（见 storage/local.ts），
			// provider 因此恒定，不再有「这次到底存哪了」的第二种答案。
			provider: storageProvider()
		}
	});
}

/** POST /api/library —— 上传文件到个人库（multipart）。 */
export async function POST(event: RequestEvent) {
	const user = await sessionUser(event);
	if (!user) return bad("未登录", 401);
	let form: FormData;
	try {
		form = await event.request.formData();
	} catch {
		return bad("不是有效的 multipart 上传");
	}
	const file = form.get("file");
	if (!file || typeof file === "string") return bad("缺少文件");
	const blob = file as File;
	if (!blob.size) return bad("空文件");
	if (blob.size > MAX_FILE_BYTES) return bad(`单个文件不能超过 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`);

	const name = String(form.get("filename") || blob.name || "attachment");
	const isImage =
		ALLOWED_IMAGE_MIME.test(blob.type) || /\.(jpe?g|png|webp|avif|gif)$/i.test(name);
	if (!isImage) return bad("只接受图片（JPEG / PNG / WebP / AVIF / GIF）");

	const fmtRaw = String(form.get("format") ?? "avif");
	const format: TargetFormat = (["avif", "webp", "original"].includes(fmtRaw) ? fmtRaw : "avif") as TargetFormat;
	const data = new Uint8Array(await blob.arrayBuffer());
	// FormData 的值可能是 File，直接往下传会把 Blob 塞进 SQL/URL 里，这里只收字符串。
	const str = (k: string): string | null => {
		const v = form.get(k);
		return typeof v === "string" && v ? v : null;
	};

	try {
		const saved = await saveUpload({
			userId: user.id,
			filename: name,
			data,
			mime: blob.type || "image/png",
			format,
			watermark: form.get("watermark") !== "off",
			keepOriginal: form.get("keepOriginal") === "1",
			folderId: str("folderId"),
			purpose: form.get("purpose") === "avatar" ? "avatar" : "upload",
			maxEdge: str("maxEdge") ? Number(str("maxEdge")) : 2560
		});
		recordActivity({
			userId: user.id,
			username: user.username,
			action: "other",
			target: `upload:${saved.file.filename}`,
			detail: saved.compressionRatio != null ? `压缩至 ${Math.round(saved.compressionRatio * 100)}%` : "原样"
		});
		return json({
			ok: true,
			file: saved.file,
			compressionRatio: saved.compressionRatio,
			usage: await usageOf(user.id)
		});
	} catch (e) {
		if (e instanceof QuotaExceededError) return bad(e.message, 413);
		if (e instanceof StorageNotConfiguredError) return bad(e.message, 503);
		if (e instanceof Error && /无法解析这张图片/.test(e.message)) return bad(e.message);
		console.error("[library] upload failed", e);
		return bad("上传失败：" + (e instanceof Error ? e.message : String(e)), 500);
	}
}
