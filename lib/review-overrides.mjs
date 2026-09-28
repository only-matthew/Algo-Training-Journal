// Git-backed writes become visible in generated JSON only after the next site build.
// Keep successful review changes in this tab so a reload does not show stale actions.
const PREFIX = "journal-review-override:";

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
  const state = { reviewStatus: updated.reviewStatus, reviewDue: updated.reviewDue || null };
  try { storage()?.setItem(id, JSON.stringify(state)); } catch { /* Storage may be unavailable. */ }
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
  if (Array.isArray(payload.logs)) result.logs = payload.logs.map(applyReviewChange);
  if (Array.isArray(payload.reviewQueue)) {
    result.reviewQueue = payload.reviewQueue.map(applyReviewChange).filter((record) => record.reviewStatus === "todo" && record.reviewDue);
    if (typeof payload.reviewQueueTotalDue === "number") {
      result.reviewQueueTotalDue = Math.max(0, payload.reviewQueueTotalDue - (payload.reviewQueue.length - result.reviewQueue.length));
    }
  }
  return key(payload) ? applyReviewChange(result) : result;
}
