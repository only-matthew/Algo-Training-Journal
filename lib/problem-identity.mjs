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

// 各平台「完整题号」的形态。缺失比赛/试卷编号的残缺题号（如 Codeforces 只填 "B"）
// 会让不同场次的不同题目塌缩成同一个 key，因此必须判为不完整。
export const COMPLETE_NUMBER_PATTERNS = Object.freeze({
  Codeforces: /^\d+[A-Z]\d*$/,
  洛谷: /^[A-Z]\d+[A-Z0-9_-]*$/,
  AtCoder: /^[A-Z0-9]+_[A-Z0-9]+$/,
});

// 未列入上表的平台（UVA/HDU/POJ/SPOJ/LibreOJ/UniversalOJ 等）题号本身就是完整标识，
// 没有可校验的内部结构，因此只要求非空。
export function isCompleteProblemNumber(platform, number) {
  const canonicalPlatform = normalizePlatform(platform);
  const normalizedNumber = normalizeProblemNumber(number);
  if (!canonicalPlatform || !normalizedNumber) return false;
  const pattern = COMPLETE_NUMBER_PATTERNS[canonicalPlatform];
  return pattern ? pattern.test(normalizedNumber) : true;
}

// Returns null rather than an ambiguous key when either part of an OJ identity is absent
// or the problem number is structurally incomplete.
export function canonicalProblemKey(platform, number) {
  const canonicalPlatform = normalizePlatform(platform);
  const normalizedNumber = normalizeProblemNumber(number);
  if (!isCompleteProblemNumber(canonicalPlatform, normalizedNumber)) return null;
  return `${canonicalPlatform}|${normalizedNumber}`;
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
