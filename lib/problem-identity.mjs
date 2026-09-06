// Stable problem and subject identities shared by browser, Node, and Worker code.

export const PLATFORM_ALIASES = Object.freeze({
  "洛谷": "洛谷",
  CodeForces: "Codeforces",
  Codeforces: "Codeforces",
  AtCoder: "AtCoder",
  UVA: "UVA",
  HDU: "HDU",
  POJ: "POJ",
  OpenJ_Bailian: "OpenJ_Bailian",
  SPOJ: "SPOJ",
  LibreOJ: "LibreOJ",
  UniversalOJ: "UniversalOJ",
});

export function normalizePlatform(platform) {
  const value = String(platform ?? "").trim();
  return PLATFORM_ALIASES[value] ?? value;
}

export function normalizeProblemNumber(number) {
  return String(number ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

// Returns null rather than an ambiguous key when either part of an OJ identity is absent.
export function canonicalProblemKey(platform, number) {
  const canonicalPlatform = normalizePlatform(platform);
  const normalizedNumber = normalizeProblemNumber(number);
  return canonicalPlatform && normalizedNumber ? `${canonicalPlatform}|${normalizedNumber}` : null;
}

export function problemSubjectKey(platform, number) {
  const problemKey = canonicalProblemKey(platform, number);
  return problemKey ? `problem:${problemKey}` : null;
}

export function recordSubjectKey(memberId, date, recordId) {
  const member = String(memberId ?? "").trim();
  const recordDate = String(date ?? "").trim();
  const record = String(recordId ?? "").trim();
  return member && recordDate && record ? `record:${member}:${recordDate}:${record}` : null;
}

// Prefer a known OJ identity. A record identity prevents unnamed or unnumbered problems
// from being silently merged by title.
export function subjectKeyForProblem({ memberId, date, recordId, platform, problemNumber } = {}) {
  return problemSubjectKey(platform, problemNumber) ?? recordSubjectKey(memberId, date, recordId);
}
