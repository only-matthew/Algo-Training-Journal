import { normalizeEnrichment } from "./problem-enrichment-schema.mjs";
import { PLATFORM_DEFAULT, DIFFICULTY_DEFAULT } from "./constants.mjs";
import { REVIEW_STATUSES, OUTCOMES as LEARNING_OUTCOMES, MASTERY_STATUSES, normalizeLearningState } from "./learning-state.mjs";
import { normalizeTagList } from "./tag-catalog.mjs";
import { canonicalProblemKey } from "./problem-identity.mjs";
import { validateTrainingInterval } from "./training-interval.mjs";

export const LOG_SCHEMA_VERSION = 6;
function validateSchemaVersion(version) {
  if (version !== undefined && (!Number.isInteger(version) || version < 1 || version > LOG_SCHEMA_VERSION)) {
    throw Object.assign(new TypeError("不支持的日志版本，请更新客户端后重试"), { code: "UNSUPPORTED_SCHEMA" });
  }
}
export { REVIEW_STATUSES };
export const OUTCOMES = Object.freeze(Object.fromEntries(LEARNING_OUTCOMES.map((value) => [value, value])));
export const LOG_LIMITS = Object.freeze({
  maxProblems: 15,
  maxRequestBytes: 1_500_000,
  name: 200,
  platform: 50,
  problemNumber: 50,
  difficulty: 50,
  tags: 10,
  tag: 30,
  description: 100_000,
  takeaway: 100_000,
  code: 500_000,
  attachmentBytes: 5_242_880,
});

const TAG_SEPARATOR = /[,，、]/;

function splitTags(value) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return source.flatMap((tag) => String(tag).split(TAG_SEPARATOR));
}

function normalizeTags(value) {
  const raw = splitTags(value).map((tag) => tag.trim()).filter(Boolean);
  return [...new Set(normalizeTagList(raw))].slice(0, LOG_LIMITS.tags);
}

function normalizeReviewStatus(value) {
  return normalizeLearningState({ reviewStatus: value }).reviewStatus;
}

function normalizeReviewDue(value) {
  return typeof value === "string" && isDateString(value) ? value : undefined;
}

// 难度统一用 Codeforces Rating 数值（由 scripts/backfill-rating.mjs 补全）。
// 非数值或非正数一律视为缺失，不参与后续计算与展示。
function normalizeDifficultyRating(value) {
  const rating = Number(value);
  return Number.isFinite(rating) && rating > 0 ? Math.round(rating) : undefined;
}

function normalizeOutcome(value) {
  return normalizeLearningState({ outcome: value }).outcome;
}

function normalizeFileIndex(value) {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index <= 9999 ? index : undefined;
}
function validateV5LearningState(problem, strict) {
  if (!strict) return;
  if (problem.masteryStatus !== undefined && !MASTERY_STATUSES.includes(problem.masteryStatus)) {
    throw new TypeError("掌握自评状态无效");
  }
  if (problem.isMistake !== undefined && typeof problem.isMistake !== "boolean") {
    throw new TypeError("失误标记必须是布尔值");
  }
  if (problem.reviewStatus !== undefined && !Object.values(REVIEW_STATUSES).includes(problem.reviewStatus)) {
    throw new TypeError("复习状态无效");
  }
}
function optionalString(value, field, maxLength, fallback = "") {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") throw new TypeError(`${field}必须是文本`);
  const result = value.trim();
  if (result.length > maxLength) throw new RangeError(`${field}不能超过 ${maxLength} 个字符`);
  return result;
}

function validateTags(value) {
  if (value !== undefined && value !== null && typeof value !== "string" && !Array.isArray(value)) {
    throw new TypeError("题目标签必须是文本或数组");
  }
  const raw = splitTags(value).map((tag) => tag.trim()).filter(Boolean);
  const tags = [...new Set(normalizeTagList(raw))];
  if (tags.length > LOG_LIMITS.tags) throw new RangeError(`每道题最多填写 ${LOG_LIMITS.tags} 个标签`);
  if (tags.some((tag) => tag.length > LOG_LIMITS.tag)) throw new RangeError(`每个标签不能超过 ${LOG_LIMITS.tag} 个字符`);
  return tags;
}

export function logInputBytes(input) {
  return new TextEncoder().encode(JSON.stringify(input)).byteLength;
}

function stableLegacyId(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${(hash >>> 0).toString(36)}`;
}

export function createProblemId(randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  if (randomUUID) return randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeMeta(meta, { legacyIdPrefix = "legacy", createId = createProblemId } = {}) {
  if (!meta || !Array.isArray(meta.problems)) {
    throw new TypeError("meta.problems 必须是数组");
  }
  validateSchemaVersion(meta.schemaVersion);

  return {
    schemaVersion: LOG_SCHEMA_VERSION,
    updatedAt: typeof meta?.updatedAt === "string" && meta.updatedAt ? meta.updatedAt : undefined,
    startedOn: typeof meta?.startedOn === "string" && isDateString(meta.startedOn) ? meta.startedOn : undefined,
    solvedOn: typeof meta?.solvedOn === "string" && isDateString(meta.solvedOn) ? meta.solvedOn : undefined,
    problems: meta.problems.map((problem, index) => ({
      id: typeof problem?.id === "string" && problem.id.trim()
        ? problem.id.trim()
        : stableLegacyId(`${legacyIdPrefix}-${index}`),
      name: typeof problem?.name === "string" ? problem.name.trim() : "",
      platform: typeof problem?.platform === "string" ? problem.platform.trim() : PLATFORM_DEFAULT,
      problemNumber: typeof problem?.problemNumber === "string" ? problem.problemNumber.trim() : "",
      difficulty: typeof problem?.difficulty === "string" ? problem.difficulty.trim() : DIFFICULTY_DEFAULT,
      difficultyRating: normalizeDifficultyRating(problem?.difficultyRating),
      tags: normalizeTags(problem?.tags),
      ...normalizeLearningState(problem),
      reviewDue: normalizeReviewDue(problem?.reviewDue),
      ...(normalizeFileIndex(problem?.fileIndex) !== undefined ? { fileIndex: normalizeFileIndex(problem.fileIndex) } : {}),
      ...normalizeEnrichment(problem),
    })),
  };
}

export function validateLogInput(input, { recordDate, today } = {}) {
  if (!input || typeof input !== "object" || !Array.isArray(input.problems)) {
    throw new TypeError("请求必须包含 problems 数组");
  }
  validateSchemaVersion(input.schemaVersion);
  if (input.problems.length < 1 || input.problems.length > LOG_LIMITS.maxProblems) {
    throw new RangeError(`每次记录需包含 1 到 ${LOG_LIMITS.maxProblems} 道题`);
  }
  if (logInputBytes(input) > LOG_LIMITS.maxRequestBytes) throw new RangeError("提交内容不能超过 1.5 MB");
  const startedOn = input.startedOn === undefined || input.startedOn === "" ? undefined : String(input.startedOn);
  const solvedOn = input.solvedOn === undefined || input.solvedOn === "" ? undefined : String(input.solvedOn);
  if (startedOn || solvedOn) {
    const intervalDate = String(recordDate || solvedOn || startedOn || "");
    validateTrainingInterval({
      recordDate: intervalDate,
      startedOn,
      solvedOn,
      today: String(today || intervalDate),
    });
  }

  const ids = new Set();
  const fileIndexes = new Set();
  const strictLearningState = input.schemaVersion === LOG_SCHEMA_VERSION;
  const problems = input.problems.map((problem) => {
    if (!problem || typeof problem !== "object" || Array.isArray(problem)) throw new TypeError("题目数据格式无效");
    validateV5LearningState(problem, strictLearningState);
    const id = typeof problem.id === "string" && problem.id.trim()
      ? problem.id.trim()
      : createProblemId();
    const name = optionalString(problem.name, "题目名称", LOG_LIMITS.name);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new TypeError("题目 ID 格式无效");
    if (ids.has(id)) throw new TypeError("题目 ID 不可重复");
    const fileIndex = problem.fileIndex === undefined ? undefined : normalizeFileIndex(problem.fileIndex);
    if (problem.fileIndex !== undefined && fileIndex === undefined) throw new TypeError("题目文件索引无效");
    if (fileIndex !== undefined && fileIndexes.has(fileIndex)) throw new TypeError("题目文件索引不可重复");
    if (!name) throw new TypeError(`题目名称长度必须为 1 到 ${LOG_LIMITS.name} 字符`);
    const reviewDue = optionalString(problem.reviewDue, "复习日期", 10);
    if (reviewDue && !isDateString(reviewDue)) throw new TypeError("复习日期格式无效（应为 YYYY-MM-DD）");
    ids.add(id);
    if (fileIndex !== undefined) fileIndexes.add(fileIndex);
    return {
      id,
      name,
      platform: optionalString(problem.platform, "平台", LOG_LIMITS.platform, PLATFORM_DEFAULT),
      problemNumber: optionalString(problem.problemNumber, "题号", LOG_LIMITS.problemNumber),
      difficulty: optionalString(problem.difficulty, "难度", LOG_LIMITS.difficulty, DIFFICULTY_DEFAULT),
      difficultyRating: normalizeDifficultyRating(problem.difficultyRating),
      tags: validateTags(problem.tags),
      ...normalizeLearningState(problem),
      reviewDue: reviewDue || undefined,
      ...(fileIndex !== undefined ? { fileIndex } : {}),
      ...normalizeEnrichment(problem),
      description: optionalString(problem.description, "题目描述", LOG_LIMITS.description),
      takeaway: optionalString(problem.takeaway, "收获/题解", LOG_LIMITS.takeaway),
      code: optionalString(problem.code, "代码", LOG_LIMITS.code),
    };
  });
  return { schemaVersion: LOG_SCHEMA_VERSION, ...(startedOn ? { startedOn } : {}), ...(solvedOn ? { solvedOn } : {}), problems };
}

// meta.json 里只写真正有内容的字段：`statementImages: []` 是可写可不写的噪声，
// 但它在请求体里有意义（表示「不再引用任何题面图片」），所以只在落盘时省略。
function storedEnrichment(problem) {
  const enrichment = normalizeEnrichment(problem);
  if (Array.isArray(enrichment.statementImages) && !enrichment.statementImages.length) delete enrichment.statementImages;
  return enrichment;
}

export function metaFromProblems(problems, updatedAt, interval = {}) {
  return {
    schemaVersion: LOG_SCHEMA_VERSION,
    ...(typeof updatedAt === "string" && updatedAt ? { updatedAt } : {}),
    ...(interval.startedOn ? { startedOn: interval.startedOn } : {}),
    ...(interval.solvedOn ? { solvedOn: interval.solvedOn } : {}),
    problems: problems.map((problemEntry) => { const { id, name, problem, platform, problemNumber, difficulty, difficultyRating, tags, reviewDue, fileIndex } = problemEntry;
      const due = normalizeReviewDue(reviewDue);
      const rating = normalizeDifficultyRating(difficultyRating);
      return {
        id,
        name: name || problem,
        platform,
        problemNumber: String(problemNumber || "").trim(),
        difficulty,
        ...(rating ? { difficultyRating: rating } : {}),
        tags: normalizeTags(tags),
        ...normalizeLearningState(problemEntry),
        ...(due ? { reviewDue: due } : {}),
        ...(normalizeFileIndex(fileIndex) !== undefined ? { fileIndex: normalizeFileIndex(fileIndex) } : {}),
        ...storedEnrichment(problemEntry),
      };
    }),
  };
}

export function isDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

// 同一道题的稳定标识：平台 + 题号归一化（Codeforces 题号统一为「场次+题号」如 123A）。
// 用于构建期聚合全队同题记录（二刷关联）。平台或题号缺失时返回空串（不参与聚合）。
export function problemStableKey(platform, problemNumber) {
  return canonicalProblemKey(platform, problemNumber) ?? "";
}
