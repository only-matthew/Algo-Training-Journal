import { canonicalProblemKey } from "./problem-identity.mjs";
import { realTakeaway } from "./takeaway.mjs";
import { countEstimatedSessions, countMemberRecordDays } from "./session-stats.mjs";
import { personalListProgress } from "./personal-list.mjs";

export function buildPeriodReport(records, { from, to, sourceCommit, sourceDataHash, personalLists = {} }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new RangeError("报告需要有效的起止日期");
  }
  const ordered = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const selected = ordered.filter((record) => record.date >= from && record.date <= to);
  const members = new Set(selected.map((record) => record.member));
  const uniqueProblems = new Set(selected.map((record) => canonicalProblemKey(record.platform, record.problemNumber)).filter(Boolean));
  const attemptsBySubject = new Map();
  for (const record of ordered) {
    const key = canonicalProblemKey(record.platform, record.problemNumber);
    if (!key) continue;
    const subject = `${record.member}|${key}`;
    if (!attemptsBySubject.has(subject)) attemptsBySubject.set(subject, []);
    attemptsBySubject.get(subject).push(record.date);
  }
  const due = ordered.filter((record) => record.reviewStatus === "todo" && record.reviewDue >= from && record.reviewDue <= to);
  let repeatEvidence = 0;
  let unlinkedDue = 0;
  for (const record of due) {
    const key = canonicalProblemKey(record.platform, record.problemNumber);
    if (!key) { unlinkedDue += 1; continue; }
    const dates = attemptsBySubject.get(`${record.member}|${key}`) || [];
    if (dates.some((date) => date > record.date && date <= to)) repeatEvidence += 1;
  }
  const checklistMembers = Object.entries(personalLists);
  const checklist = checklistMembers.map(([member, items]) => personalListProgress(items, ordered.filter((record) => record.member === member && record.date <= to)));

  return {
    schemaVersion: 1,
    period: { from, to },
    source: { commit: sourceCommit, dataHash: sourceDataHash, paths: ["logs/"] },
    definitions: {
      session: "同成员、同起止日期算一场；未填起止日期时按记录日估算，无法区分同日多场",
      recordDay: "成员与记录日期去重",
      repeatEvidence: "到期日落在窗口内，且同成员同平台题号在原记录日之后、窗口结束前出现新记录",
      takeaway: "非空且不等于历史占位词‘未填写’；不代表内容质量评估",
    },
    totals: {
      members: members.size,
      sessionsEstimated: countEstimatedSessions(selected),
      recordDays: countMemberRecordDays(selected),
      problemRecords: selected.length,
      uniqueProblemsWithStableKey: uniqueProblems.size,
      nonPlaceholderTakeaways: selected.filter((record) => realTakeaway(record.takeaway)).length,
      unknownOutcomes: selected.filter((record) => !record.outcome).length,
      reviewPlanned: selected.filter((record) => record.reviewStatus === "todo").length,
      reviewsDue: due.length,
      reviewsWithRepeatEvidence: repeatEvidence,
      reviewsDueWithoutStableKey: unlinkedDue,
      personalChecklist: checklist.length ? {
        membersWithList: checklist.length,
        selected: checklist.reduce((sum, item) => sum + item.total, 0),
        completed: checklist.reduce((sum, item) => sum + item.completed, 0),
      } : null,
    },
    unavailable: {
      pageViews: "未知：没有行为事件源",
      buttonClicks: "未知：没有行为事件源",
      ...(checklist.length ? {} : { personalChecklistProgress: "未知：尚无个人清单数据源" }),
    },
  };
}
