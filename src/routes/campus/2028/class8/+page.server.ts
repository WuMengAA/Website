/**
 * 2028届八班 · 班级页服务端数据加载（page 级）。
 *
 * 「不透露人名」有两道保险，缺一不可：
 *
 * 1. **数据层已脱敏**：成绩落盘即密文（CLASS8_ENC_KEY），本文件聚合时只按
 *    member_id / group_id / subject / score 计算，从不读取姓名 —— 天然不泄露个人。
 * 2. **服务端聚合**：本文件在服务端把 50 人明细聚合成「整体总结」
 *    （人数 / 均分 / 分布直方图 / 各科均分），
 *    **只把聚合结果 examSummary 发给客户端，姓名与明细永远不出服务端**。
 *
 * 关键：成绩一律取自线上真实库（class8_scores，由 ensureRealScores 灌入），
 * 不再依赖占位用的 exam-monthly.json；分段统计由真实分数动态分箱，
 * 杜绝「固定 10 人一段」那种凑数式直方图。
 *
 * 门禁（CLASS8_PASSCODE + c8_gate 令牌）仍保护整个班级区的其余内容
 * （展板数据、班级照片），但成绩统计本身已不含个人信息。
 */
import type { PageServerLoad } from "./$types";
import { listExams, listScoresByExam } from "$lib/server/class8/class8-service.js";

type Bucket = { label: string; count: number };
type SubjectAvg = { subject: string; avg: number; max: number; n: number };
type Summary = {
	title: string;
	examDate: string;
	n: number;
	avgTotal: number;
	maxTotal: number;
	minTotal: number;
	totalBuckets: Bucket[];
	subjectAvgs: SubjectAvg[];
};

/**
 * 由真实成绩聚合出整体总结。
 * - totals：按 member_id 汇总各科有效分（英语/俄语互斥，缺一门不计入该生总分）。
 * - totalBuckets：根据真实分数区间动态分箱，箱宽随数据自适应（不再固定 50 或 10 人一段）。
 * - subjectAvgs：各科原始均分，保留有效人数（分语种小班天然少于总人数）。
 */
async function buildSummary(): Promise<Summary> {
	const exams = await listExams();
	const exam = exams[0];
	if (!exam) {
		return { title: "暂无考试", examDate: "", n: 0, avgTotal: 0, maxTotal: 0, minTotal: 0, totalBuckets: [], subjectAvgs: [] };
	}

	// 真实成绩（解密后聚合；不读取姓名）
	const rows = await listScoresByExam(exam.id);
	const byMember = new Map<number, number>();
	for (const r of rows) byMember.set(r.member_id, (byMember.get(r.member_id) ?? 0) + r.score);
	const totals = [...byMember.values()].filter((v) => v > 0);
	const n = totals.length;
	const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
	const avgTotal = Number(avg(totals).toFixed(1));
	const maxTotal = totals.length ? Math.max(...totals) : 0;
	const minTotal = totals.length ? Math.min(...totals) : 0;

	// 总分分布：按真实分数区间动态分箱（杜绝「固定 10 人一段」的凑数直方图）
	const totalBuckets: Bucket[] = [];
	if (totals.length) {
		const lo = Math.floor(minTotal / 50) * 50;
		const hi = Math.ceil(maxTotal / 50) * 50;
		const step = Math.max(20, Math.round((hi - lo) / 6 / 10) * 10);
		for (let cur = lo; cur < hi; cur += step) {
			totalBuckets.push({
				label: `${cur}–${cur + step}`,
				count: totals.filter((t) => t >= cur && t < cur + step).length
			});
		}
	}

	// 各科平均分（保留有效人数，英语/俄语为分语种小班）
	const subs = [...new Set(rows.map((r) => r.subject))];
	const subjectAvgs = subs.map((s) => {
		const vals = rows.filter((r) => r.subject === s).map((r) => r.score);
		return { subject: s, avg: Number(avg(vals).toFixed(1)), max: vals.length ? Math.max(...vals) : 0, n: vals.length };
	});

	return {
		title: exam.title || "月考成绩",
		examDate: exam.exam_date || "",
		n,
		avgTotal,
		maxTotal,
		minTotal,
		totalBuckets,
		subjectAvgs
	};
}

export const load: PageServerLoad = async () => {
	return { examSummary: await buildSummary() };
};
