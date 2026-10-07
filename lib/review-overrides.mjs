// Git-backed writes become visible in generated JSON only after the next site build.
// Keep successful review changes in this tab so a reload does not show stale actions.
import { todayUtc8 } from "./constants.mjs";
import { isReviewTodo } from "./learning-state.mjs";

const PREFIX = "journal-review-override:";
export let reviewRevision = 0;

function key(record) {
  return record?.member && record?.date && record?.problemId
    ? `${PREFIX}${record.member}:${record.date}:${record.problemId}` : null;
}

function storage() {
  try { return globalThis.sessionStorage; } catch { return null; }
}

export function rememberReviewChange(record, updated) {
  const id = key(record);
  if (!id) return;
  const reviewRecord = { ...record, ...updated, reviewDue: updated.reviewDue || undefined };
  // 队列只需卡片摘要，避免把题面和代码占用到会话存储中。
  const fields = ["member", "date", "problemId", "problem", "problemNumber", "platform", "difficulty", "difficultyRating", "masteryStatus", "reviewStatus", "reviewDue"];
  const state = { reviewStatus: updated.reviewStatus, reviewDue: updated.reviewDue || null,
    record: Object.fromEntries(fields.map((field) => [field, reviewRecord[field]])) };
  try { storage()?.setItem(id, JSON.stringify(state)); } catch { /* Storage may be unavailable. */ }
  reviewRevision++;
}

function pendingReviewRecords() {
  const records = [];
  try {
    const saved = storage();
    for (let i = 0; i < (saved?.length || 0); i++) {
      const id = saved.key(i);
      if (!id?.startsWith(PREFIX)) continue;
      const state = JSON.parse(saved.getItem(id) || "null");
      if (state?.record) records.push(state.record);
    }
  } catch { /* Storage may be unavailable. */ }
  return records;
}

export function applyReviewChange(record) {
  const id = key(record);
  if (!id) return record;
  let state;
  try { state = JSON.parse(storage()?.getItem(id) || "null"); } catch { return record; }
  if (!state || !["todo", "archived"].includes(state.reviewStatus)) return record;
  if (record.reviewStatus === state.reviewStatus && (record.reviewDue || null) === state.reviewDue) {
    try { storage()?.removeItem(id); } catch { /* Storage may be unavailable. */ }
    return record;
  }
  return { ...record, reviewStatus: state.reviewStatus, reviewDue: state.reviewDue || undefined };
}

export function applyReviewChanges(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const result = { ...payload };
  const pending = Array.isArray(payload.reviewQueue) ? pendingReviewRecords() : [];
  const queue = Array.isArray(payload.reviewQueue)
    ? new Map(payload.reviewQueue.map((record) => [key(record) || record, applyReviewChange(record)])) : null;
  if (Array.isArray(payload.logs)) result.logs = payload.logs.map(applyReviewChange);
  if (queue) {
    // 新安排的题可能原本不在首页队列里（例如重新安排一条旧记录）。
    for (const record of [...(result.logs || []), ...pending]) {
      if (key(record) && (queue.has(key(record)) || (isReviewTodo(record) && record.reviewDue))) queue.set(key(record), record);
    }
    result.reviewQueue = [...queue.values()].filter((record) => isReviewTodo(record) && record.reviewDue);
    if (typeof payload.reviewQueueTotalDue === "number") {
      result.reviewQueueTotalDue = result.reviewQueue.filter((record) => record.reviewDue <= todayUtc8()).length;
    }
  }
  return key(payload) ? applyReviewChange(result) : result;
}
