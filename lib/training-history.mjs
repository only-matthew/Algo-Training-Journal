import { problemStableKey } from "./log-schema.mjs";
import { buildEvidenceV1 } from "./training-projections.mjs";

// Published logs remain useful before a member has any v2 training events.
// Old mastery flags never imply an independently completed attempt.
export function trainingHistory(logs, member, today) {
  const records = (logs || []).filter((log) => member && log.member === member).map((log) => ({
    ...log,
    subjectKey: problemStableKey(log.platform, log.problemNumber) || `legacy:${member}:${log.date}:${log.problemId || log.problemIndex}`,
    recordRef: { member, date: log.date, problemId: log.problemId || log.problemIndex },
    href: `/problem/${[member, log.date, log.problemId || log.problemIndex].map(encodeURIComponent).join("/")}/`,
  }));
  const latest = new Map();
  for (const log of [...records].sort((a, b) => a.date.localeCompare(b.date))) latest.set(log.subjectKey, log);
  const reviews = [...latest.values()].filter((log) => log.reviewStatus === "todo" && log.reviewDue && log.reviewDue <= today)
    .map((log) => ({ subjectKey: log.subjectKey, title: log.problem, href: log.href, state: "scheduled", dueOn: log.reviewDue }))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  return { records, reviews, evidence: buildEvidenceV1({ legacyRecords: records, reviews, today }) };
}
