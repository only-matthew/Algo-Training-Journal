import { canonicalProblemKey, normalizePlatform, normalizeProblemNumber } from "./problem-identity.mjs";

export const MAX_PERSONAL_LIST_ITEMS = 30;
const FINISHED_OUTCOMES = new Set(["independent", "hinted", "editorial"]);

export function validatePersonalList(items) {
  if (!Array.isArray(items) || items.length > MAX_PERSONAL_LIST_ITEMS) throw new RangeError(`个人清单最多 ${MAX_PERSONAL_LIST_ITEMS} 题`);
  const seen = new Set();
  return items.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("清单条目格式无效");
    const platform = normalizePlatform(raw.platform);
    const problemNumber = normalizeProblemNumber(raw.problemNumber);
    const key = canonicalProblemKey(platform, problemNumber);
    if (!key) throw new TypeError("请填写完整的平台与题号");
    if (seen.has(key)) throw new TypeError("清单中有重复题目");
    seen.add(key);
    const name = String(raw.name ?? "").trim();
    if (name.length > 200) throw new RangeError("题目名称不能超过 200 字");
    return { platform, problemNumber, name };
  });
}

export function personalListProgress(items, records) {
  const attempts = new Map();
  for (const record of records || []) {
    if (!FINISHED_OUTCOMES.has(record.outcome)) continue;
    const key = canonicalProblemKey(record.platform, record.problemNumber);
    if (!key) continue;
    const previous = attempts.get(key);
    if (!previous || String(record.date) > String(previous.date)) attempts.set(key, record);
  }
  const entries = validatePersonalList(items).map((item) => ({ ...item, evidence: attempts.get(canonicalProblemKey(item.platform, item.problemNumber)) || null }));
  return { completed: entries.filter((item) => item.evidence).length, total: entries.length, entries };
}
