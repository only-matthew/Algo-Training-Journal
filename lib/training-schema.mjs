/** Shared, side-effect-free validation for training/v2 JSON documents. */
export const TRAINING_SCHEMA_VERSION = 1;

export const TRAINING_LIMITS = Object.freeze({
  memberId: 48,
  profileFocusNodeIds: 3,
  dailyBudgetMinutes: { min: 15, max: 240, default: 60 },
  dailyItemLimit: { min: 1, max: 10, default: 3 },
  planItems: 20,
  problemName: 200,
  platform: 50,
  problemNumber: 50,
  difficulty: 50,
  problemTags: 10,
  problemTag: 30,
  handle: 50,
  goalNote: 200,
  assessmentNote: 500,
  attemptDurationMinutes: { min: 1, max: 1440 },
  attemptErrorTags: 5,
  attemptNote: 2000,
  attemptBytes: 16 * 1024,
  voidReason: 500,
  planItemMinutes: { min: 5, max: 240 },
});

export const PROFILE_DEFAULTS = Object.freeze({ dailyBudgetMinutes: 60, dailyItemLimit: 3 });
export const PLAN_ITEM_KINDS = Object.freeze(["review", "upsolve", "practice", "advance", "manual"]);
export const PLAN_ITEM_STATUSES = Object.freeze(["queued", "started", "completed", "deferred", "removed"]);
export const ASSESSMENT_LEVELS = Object.freeze(["unknown", "learning", "comfortable", "needs_review"]);
export const ATTEMPT_MODES = Object.freeze(["practice", "review", "upsolve", "contest"]);
export const ATTEMPT_OUTCOMES = Object.freeze(["unfinished", "independent", "hinted", "editorial", "unknown"]);
export const ATTEMPT_ERROR_TAGS = Object.freeze(["understanding", "modeling", "proof", "complexity", "implementation", "boundary", "knowledge", "other"]);
export const REVIEW_STATES = Object.freeze(["scheduled", "paused", "archived"]);
export const REVIEW_ACTIONS = Object.freeze(["schedule", "defer", "pause", "archive"]);
export const REASON_CODES = Object.freeze(["REVIEW_DUE", "UPSOLVE_PENDING", "FOCUS_NODE", "NEXT_NODE", "PREREQUISITE_SELF_ASSESSED", "NO_EVIDENCE", "NO_CANDIDATES"]);

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEMBER_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const OWN = Object.prototype.hasOwnProperty;

export function codePointLength(value) {
  return [...value].length;
}

export function utf8Bytes(value) {
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
}

export function isUuidV4(value) {
  return typeof value === "string" && UUID_V4.test(value);
}

export function isDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function isRfc3339Timestamp(value) {
  return typeof value === "string"
    && RFC3339.test(value)
    && isDateString(value.slice(0, 10))
    && !Number.isNaN(Date.parse(value));
}

function fail(message) {
  throw new TypeError(message);
}

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${name}必须是对象`);
  return value;
}

function rejectUnknown(value, allowed, name) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${name}包含未知字段：${key}`);
  }
}

function requiredString(value, name, min, max) {
  if (typeof value !== "string") fail(`${name}必须是文本`);
  const length = codePointLength(value);
  if (length < min || length > max) fail(`${name}长度必须为 ${min} 到 ${max} 个字符`);
  return value;
}

function optionalString(value, name, max) {
  if (value === undefined) return undefined;
  return requiredString(value, name, 0, max);
}

function requiredEnum(value, name, values) {
  if (!values.includes(value)) fail(`${name}无效`);
  return value;
}

function requiredInteger(value, name, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${name}必须是 ${min} 到 ${max} 的整数`);
  return value;
}

function requiredSchemaVersion(value, name) {
  if (value !== TRAINING_SCHEMA_VERSION) fail(`${name}.schemaVersion不受支持`);
  return value;
}

function requiredMemberId(value, name = "memberId") {
  if (typeof value !== "string" || !MEMBER_ID.test(value)) fail(`${name}格式无效`);
  return value;
}

function requiredDate(value, name) {
  if (!isDateString(value)) fail(`${name}必须是真实的 YYYY-MM-DD 日期`);
  return value;
}

function requiredTimestamp(value, name) {
  if (!isRfc3339Timestamp(value)) fail(`${name}必须是 RFC3339 时间戳`);
  return value;
}

function requiredUuid(value, name) {
  if (!isUuidV4(value)) fail(`${name}必须是 UUID v4`);
  return value;
}

function copyOptional(source, target, key, validator) {
  if (OWN.call(source, key)) target[key] = validator(source[key]);
}

function validateStringList(value, name, maxItems, maxItemLength, allowedValues) {
  if (!Array.isArray(value) || value.length > maxItems) fail(`${name}最多包含 ${maxItems} 项`);
  const result = value.map((item) => allowedValues
    ? requiredEnum(item, name, allowedValues)
    : requiredString(item, name, 1, maxItemLength));
  if (new Set(result).size !== result.length) fail(`${name}不可重复`);
  return result;
}

export function validateProblemSnapshot(input) {
  const value = object(input, "problem");
  rejectUnknown(value, ["name", "platform", "problemNumber", "difficulty", "tags"], "problem");
  const result = {
    name: requiredString(value.name, "problem.name", 1, TRAINING_LIMITS.problemName),
    platform: requiredString(value.platform, "problem.platform", 1, TRAINING_LIMITS.platform),
    problemNumber: requiredString(value.problemNumber, "problem.problemNumber", 0, TRAINING_LIMITS.problemNumber),
  };
  copyOptional(value, result, "difficulty", (item) => optionalString(item, "problem.difficulty", TRAINING_LIMITS.difficulty));
  copyOptional(value, result, "tags", (item) => validateStringList(item, "problem.tags", TRAINING_LIMITS.problemTags, TRAINING_LIMITS.problemTag));
  return result;
}

export function validateRecordRef(input) {
  const value = object(input, "recordRef");
  rejectUnknown(value, ["memberId", "date", "recordId"], "recordRef");
  return {
    memberId: requiredMemberId(value.memberId, "recordRef.memberId"),
    date: requiredDate(value.date, "recordRef.date"),
    recordId: requiredString(value.recordId, "recordRef.recordId", 1, Number.MAX_SAFE_INTEGER),
  };
}

function validateSubjectKey(value, name = "subjectKey") {
  return requiredString(value, name, 1, Number.MAX_SAFE_INTEGER);
}

export function validateProfile(input) {
  const value = object(input, "profile");
  rejectUnknown(value, ["schemaVersion", "memberId", "updatedAt", "focusNodeIds", "dailyBudgetMinutes", "dailyItemLimit", "cfHandle", "atcoderHandle", "goalNote"], "profile");
  const result = {
    schemaVersion: requiredSchemaVersion(value.schemaVersion, "profile"),
    memberId: requiredMemberId(value.memberId),
    updatedAt: requiredTimestamp(value.updatedAt, "profile.updatedAt"),
  };
  copyOptional(value, result, "focusNodeIds", (item) => validateStringList(item, "profile.focusNodeIds", TRAINING_LIMITS.profileFocusNodeIds, 200));
  copyOptional(value, result, "dailyBudgetMinutes", (item) => requiredInteger(item, "profile.dailyBudgetMinutes", 15, 240));
  copyOptional(value, result, "dailyItemLimit", (item) => requiredInteger(item, "profile.dailyItemLimit", 1, 10));
  copyOptional(value, result, "cfHandle", (item) => optionalString(item, "profile.cfHandle", TRAINING_LIMITS.handle));
  copyOptional(value, result, "atcoderHandle", (item) => optionalString(item, "profile.atcoderHandle", TRAINING_LIMITS.handle));
  copyOptional(value, result, "goalNote", (item) => optionalString(item, "profile.goalNote", TRAINING_LIMITS.goalNote));
  return result;
}

export function validatePlanItem(input) {
  const value = object(input, "plan item");
  rejectUnknown(value, ["id", "subjectKey", "problem", "kind", "status", "recordRef", "nodeId", "reasonCodes", "plannedMinutes", "linkedAttemptId", "deferredTo"], "plan item");
  const result = {
    id: requiredUuid(value.id, "planItem.id"),
    subjectKey: validateSubjectKey(value.subjectKey, "planItem.subjectKey"),
    problem: validateProblemSnapshot(value.problem),
    kind: requiredEnum(value.kind, "planItem.kind", PLAN_ITEM_KINDS),
    status: requiredEnum(value.status, "planItem.status", PLAN_ITEM_STATUSES),
  };
  copyOptional(value, result, "recordRef", validateRecordRef);
  copyOptional(value, result, "nodeId", (item) => requiredString(item, "planItem.nodeId", 1, Number.MAX_SAFE_INTEGER));
  copyOptional(value, result, "reasonCodes", (item) => validateStringList(item, "planItem.reasonCodes", REASON_CODES.length, 100, REASON_CODES));
  copyOptional(value, result, "plannedMinutes", (item) => requiredInteger(item, "planItem.plannedMinutes", 5, 240));
  copyOptional(value, result, "linkedAttemptId", (item) => requiredUuid(item, "planItem.linkedAttemptId"));
  copyOptional(value, result, "deferredTo", (item) => requiredDate(item, "planItem.deferredTo"));
  return result;
}

export function validatePlan(input) {
  const value = object(input, "plan");
  rejectUnknown(value, ["schemaVersion", "memberId", "date", "items", "updatedAt", "algorithmVersion", "evidenceSnapshot"], "plan");
  if (!Array.isArray(value.items) || value.items.length > TRAINING_LIMITS.planItems) fail(`plan.items最多包含 ${TRAINING_LIMITS.planItems} 项`);
  const items = value.items.map(validatePlanItem);
  const ids = new Set();
  const activeSubjects = new Set();
  for (const item of items) {
    if (ids.has(item.id)) fail("plan.items.id不可重复");
    ids.add(item.id);
    if (["queued", "started", "completed"].includes(item.status)) {
      if (activeSubjects.has(item.subjectKey)) fail("同一subjectKey最多有一个未移除计划项");
      activeSubjects.add(item.subjectKey);
    }
  }
  const result = {
    schemaVersion: requiredSchemaVersion(value.schemaVersion, "plan"),
    memberId: requiredMemberId(value.memberId),
    date: requiredDate(value.date, "plan.date"),
    items,
    updatedAt: requiredTimestamp(value.updatedAt, "plan.updatedAt"),
  };
  copyOptional(value, result, "algorithmVersion", (item) => requiredString(item, "plan.algorithmVersion", 1, Number.MAX_SAFE_INTEGER));
  copyOptional(value, result, "evidenceSnapshot", (item) => {
    if (item === null) fail("plan.evidenceSnapshot不能为 null");
    return validateJsonValue(item, "plan.evidenceSnapshot");
  });
  return result;
}

function validateJsonValue(value, name) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`${name}必须是 JSON 值`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => validateJsonValue(item, name));
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = validateJsonValue(item, name);
    return result;
  }
  fail(`${name}必须是 JSON 值`);
}

function validateAttemptSource(input) {
  const value = object(input, "attempt.source");
  const kind = value.kind;
  if (kind === "manual") {
    rejectUnknown(value, ["kind"], "attempt.source");
    return { kind };
  }
  if (kind !== "import") fail("attempt.source.kind无效");
  rejectUnknown(value, ["kind", "platform", "handle", "submissionId", "verdict"], "attempt.source");
  return {
    kind,
    platform: requiredString(value.platform, "attempt.source.platform", 1, TRAINING_LIMITS.platform),
    handle: requiredString(value.handle, "attempt.source.handle", 1, TRAINING_LIMITS.handle),
    submissionId: requiredString(value.submissionId, "attempt.source.submissionId", 1, Number.MAX_SAFE_INTEGER),
    verdict: requiredString(value.verdict, "attempt.source.verdict", 1, Number.MAX_SAFE_INTEGER),
  };
}

function validateAttemptPatch(input) {
  const value = object(input, "attempt.patch");
  rejectUnknown(value, ["outcome", "performedOn", "durationMinutes", "errorTags", "note"], "attempt.patch");
  if (Object.keys(value).length === 0) fail("attempt.patch不能为空");
  const result = {};
  copyOptional(value, result, "outcome", (item) => requiredEnum(item, "attempt.patch.outcome", ATTEMPT_OUTCOMES));
  copyOptional(value, result, "performedOn", (item) => requiredDate(item, "attempt.patch.performedOn"));
  copyOptional(value, result, "durationMinutes", (item) => requiredInteger(item, "attempt.patch.durationMinutes", 1, 1440));
  copyOptional(value, result, "errorTags", (item) => validateStringList(item, "attempt.patch.errorTags", TRAINING_LIMITS.attemptErrorTags, 100, ATTEMPT_ERROR_TAGS));
  copyOptional(value, result, "note", (item) => optionalString(item, "attempt.patch.note", TRAINING_LIMITS.attemptNote));
  return result;
}

function validateEventBase(value, type, allowed) {
  rejectUnknown(value, ["schemaVersion", "id", "type", "memberId", "recordedAt", "sequence", ...allowed], "event");
  if (value.type !== type) fail(`event.type必须是 ${type}`);
  return {
    schemaVersion: requiredSchemaVersion(value.schemaVersion, "event"),
    id: requiredUuid(value.id, "event.id"),
    type,
    memberId: requiredMemberId(value.memberId),
    recordedAt: requiredTimestamp(value.recordedAt, "event.recordedAt"),
    sequence: requiredInteger(value.sequence, "event.sequence", 0),
  };
}

function validateRecordedAttempt(value) {
  const result = validateEventBase(value, "attempt.recorded", ["subjectKey", "recordRef", "problem", "performedOn", "mode", "outcome", "durationMinutes", "errorTags", "note", "source"]);
  result.subjectKey = validateSubjectKey(value.subjectKey);
  result.recordRef = validateRecordRef(value.recordRef);
  result.problem = validateProblemSnapshot(value.problem);
  result.performedOn = requiredDate(value.performedOn, "attempt.performedOn");
  result.mode = requiredEnum(value.mode, "attempt.mode", ATTEMPT_MODES);
  result.outcome = requiredEnum(value.outcome, "attempt.outcome", ATTEMPT_OUTCOMES);
  result.source = validateAttemptSource(value.source);
  if (result.source.kind === "manual" && result.outcome === "unknown") fail("手动尝试不能使用 unknown 结果");
  if (result.source.kind === "import" && result.outcome === "independent") fail("导入尝试不能声明 independent 结果");
  copyOptional(value, result, "durationMinutes", (item) => requiredInteger(item, "attempt.durationMinutes", 1, 1440));
  copyOptional(value, result, "errorTags", (item) => validateStringList(item, "attempt.errorTags", TRAINING_LIMITS.attemptErrorTags, 100, ATTEMPT_ERROR_TAGS));
  copyOptional(value, result, "note", (item) => optionalString(item, "attempt.note", TRAINING_LIMITS.attemptNote));
  if (utf8Bytes(result) > TRAINING_LIMITS.attemptBytes) fail("尝试事件不能超过 16 KiB");
  return result;
}

function validateCorrectedAttempt(value) {
  const result = validateEventBase(value, "attempt.corrected", ["targetAttemptId", "patch"]);
  result.targetAttemptId = requiredUuid(value.targetAttemptId, "attempt.targetAttemptId");
  result.patch = validateAttemptPatch(value.patch);
  return result;
}

function validateVoidedAttempt(value) {
  const result = validateEventBase(value, "attempt.voided", ["targetAttemptId", "reason"]);
  result.targetAttemptId = requiredUuid(value.targetAttemptId, "attempt.targetAttemptId");
  result.reason = requiredString(value.reason, "attempt.reason", 1, TRAINING_LIMITS.voidReason);
  return result;
}

function validateReviewEvent(value, type, dueRequired) {
  const result = validateEventBase(value, type, ["subjectKey", ...(dueRequired ? ["dueOn"] : [])]);
  result.subjectKey = validateSubjectKey(value.subjectKey);
  if (dueRequired) result.dueOn = requiredDate(value.dueOn, "review.dueOn");
  return result;
}

export function validateAttemptEvent(input) {
  const value = object(input, "event");
  switch (value.type) {
    case "attempt.recorded": return validateRecordedAttempt(value);
    case "attempt.corrected": return validateCorrectedAttempt(value);
    case "attempt.voided": return validateVoidedAttempt(value);
    case "review.scheduled": return validateReviewEvent(value, "review.scheduled", true);
    case "review.deferred": return validateReviewEvent(value, "review.deferred", true);
    case "review.paused": return validateReviewEvent(value, "review.paused", false);
    case "review.archived": return validateReviewEvent(value, "review.archived", false);
    default: fail("event.type无效");
  }
}

export function validateReview(input) {
  const value = object(input, "review");
  rejectUnknown(value, ["schemaVersion", "memberId", "subjectKey", "state", "dueOn", "successStreak", "lastAttemptId", "lastReviewedOn", "appliedSequence"], "review");
  const result = {
    schemaVersion: requiredSchemaVersion(value.schemaVersion, "review"),
    memberId: requiredMemberId(value.memberId),
    subjectKey: validateSubjectKey(value.subjectKey),
    state: requiredEnum(value.state, "review.state", REVIEW_STATES),
    dueOn: value.dueOn,
    successStreak: requiredInteger(value.successStreak, "review.successStreak", 0),
    lastAttemptId: value.lastAttemptId,
    lastReviewedOn: value.lastReviewedOn,
    appliedSequence: requiredInteger(value.appliedSequence, "review.appliedSequence", 0),
  };
  if (result.state === "scheduled") result.dueOn = requiredDate(value.dueOn, "review.dueOn");
  else if (value.dueOn !== null) fail("非 scheduled 复习的 dueOn 必须为 null");
  if (result.lastAttemptId !== null) result.lastAttemptId = requiredUuid(value.lastAttemptId, "review.lastAttemptId");
  if (result.lastReviewedOn !== null) result.lastReviewedOn = requiredDate(value.lastReviewedOn, "review.lastReviewedOn");
  return result;
}

export function validateSelfAssessment(input) {
  const value = object(input, "selfAssessment");
  rejectUnknown(value, ["schemaVersion", "memberId", "nodeId", "level", "updatedAt", "note"], "selfAssessment");
  const result = {
    schemaVersion: requiredSchemaVersion(value.schemaVersion, "selfAssessment"),
    memberId: requiredMemberId(value.memberId),
    nodeId: requiredString(value.nodeId, "selfAssessment.nodeId", 1, Number.MAX_SAFE_INTEGER),
    level: requiredEnum(value.level, "selfAssessment.level", ASSESSMENT_LEVELS),
    updatedAt: requiredTimestamp(value.updatedAt, "selfAssessment.updatedAt"),
  };
  copyOptional(value, result, "note", (item) => optionalString(item, "selfAssessment.note", TRAINING_LIMITS.assessmentNote));
  return result;
}
