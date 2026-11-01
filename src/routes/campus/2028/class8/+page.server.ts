/**
 * 2028届八班 · 班级页服务端数据加载（page 级）。
 *
 * 「不透露人名」有两道保险，缺一不可：
 *
 * 1. **数据层已脱敏（2026-11-01）**：`exam-monthly.json` 的 `name` 字段已全部替换为
 *    「学生NN」占位符，真实姓名明细**不入库、不进仓库、不进构建产物**。
 *    本文件的聚合逻辑本来就不读取姓名字段，脱敏对页面输出零影响。
 * 2. **服务端聚合**：本文件在服务端把 50 人明细聚合成「整体总结」
 *    （人数 / 均分 / 分布直方图 / 各科均分 / 名次分布），
 *    **只把聚合结果 examSummary 发给客户端，姓名与明细永远不出服务端**。
 *
 * 门禁（CLASS8_PASSCODE + c8_gate 令牌）仍保护整个班级区的其余内容
 * （展板数据、班级照片），但成绩统计本身已不含个人信息。
 */
import type { PageServerLoad } from "./$types";
import examData from "$lib/server/class8/exam-monthly.json";

type Summary = {
  title: string;
  examDate: string;
  n: number;
  avgTotal: number;
  maxTotal: number;
  minTotal: number;
  totalBuckets: { label: string; count: number }[];
  subjectAvgs: { subject: string; avg: number; max: number; n: number }[];
  rankBuckets: { label: string; count: number }[];
};

function buildSummary(): Summary {
  const rows = examData.rows;
  const subs = examData.subjects;
  const totals = rows.map((r) => r.total).filter((v): v is number => v != null);
  const n = totals.length;
  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

  // 总分分布（50 分一档）
  const totalBuckets: { label: string; count: number }[] = [];
  const lo = 250;
  const step = 50;
  for (let cur = lo; cur < Math.max(...totals) + step; cur += step) {
    totalBuckets.push({
      label: `${cur}–${cur + step}`,
      count: rows.filter((r) => cur <= r.total && r.total < cur + step).length
    });
  }

  // 各科平均分（保留选考人数，英语/俄语为分语种小班）
  const subjectAvgs = subs.map((s) => {
    const vals = rows.map((r) => r.scores[s]).filter((v): v is number => v != null);
    return {
      subject: s,
      avg: Number(avg(vals).toFixed(1)),
      max: vals.length ? Math.max(...vals) : 0,
      n: vals.length
    };
  });

  // 班级名次分布（r2 = 班名，1–50）
  const r2 = rows.map((r) => r.r2).filter((v): v is number => v != null);
  const rankBuckets = [
    [1, 10],
    [11, 20],
    [21, 30],
    [31, 40],
    [41, 50]
  ].map(([a, b]) => ({
    label: `${a}–${b}`,
    count: r2.filter((x) => x >= a && x <= b).length
  }));

  return {
    title: examData.title,
    examDate: examData.examDate,
    n,
    avgTotal: Number(avg(totals).toFixed(1)),
    maxTotal: Math.max(...totals),
    minTotal: Math.min(...totals),
    totalBuckets,
    subjectAvgs,
    rankBuckets
  };
}

export const load: PageServerLoad = async () => {
  return { examSummary: buildSummary() };
};
