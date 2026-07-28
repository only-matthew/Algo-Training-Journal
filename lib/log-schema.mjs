export const LOG_SCHEMA_VERSION = 2;
export const REVIEW_STATUSES = ["none", "todo", "mastered"];
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
});

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,，]/) : [];
  return [...new Set(source.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 10);
}

function normalizeReviewStatus(value) {
  return REVIEW_STATUSES.includes(value) ? value : "none";
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
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,，]/) : [];
  const tags = [...new Set(raw.map((tag) => String(tag).trim()).filter(Boolean))];
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

  return {
    schemaVersion: LOG_SCHEMA_VERSION,
    problems: meta.problems.map((problem, index) => ({
      id: typeof problem?.id === "string" && problem.id.trim()
        ? problem.id.trim()
        : stableLegacyId(`${legacyIdPrefix}-${index}`),
      name: typeof problem?.name === "string" ? problem.name.trim() : "",
      platform: typeof problem?.platform === "string" ? problem.platform.trim() : "未填写",
      problemNumber: typeof problem?.problemNumber === "string" ? problem.problemNumber.trim() : "",
      difficulty: typeof problem?.difficulty === "string" ? problem.difficulty.trim() : "未标注",
      tags: normalizeTags(problem?.tags),
      reviewStatus: normalizeReviewStatus(problem?.reviewStatus),
    })),
  };
}

export function validateLogInput(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.problems)) {
    throw new TypeError("请求必须包含 problems 数组");
  }
  if (input.problems.length < 1 || input.problems.length > LOG_LIMITS.maxProblems) {
    throw new RangeError(`每次记录需包含 1 到 ${LOG_LIMITS.maxProblems} 道题`);
  }
  if (logInputBytes(input) > LOG_LIMITS.maxRequestBytes) throw new RangeError("提交内容不能超过 1.5 MB");

  const ids = new Set();
  const problems = input.problems.map((problem) => {
    const id = typeof problem.id === "string" && problem.id.trim()
      ? problem.id.trim()
      : createProblemId();
    if (!problem || typeof problem !== "object") throw new TypeError("题目数据格式无效");
    const name = optionalString(problem.name, "题目名称", LOG_LIMITS.name);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new TypeError("题目 ID 格式无效");
    if (ids.has(id)) throw new TypeError("题目 ID 不可重复");
    if (!name) throw new TypeError(`题目名称长度必须为 1 到 ${LOG_LIMITS.name} 字符`);
    ids.add(id);
    return {
      id,
      name,
      platform: optionalString(problem.platform, "平台", LOG_LIMITS.platform, "未填写"),
      problemNumber: optionalString(problem.problemNumber, "题号", LOG_LIMITS.problemNumber),
      difficulty: optionalString(problem.difficulty, "难度", LOG_LIMITS.difficulty, "未标注"),
      tags: validateTags(problem.tags),
      reviewStatus: normalizeReviewStatus(problem.reviewStatus),
      description: optionalString(problem.description, "题目描述", LOG_LIMITS.description),
      takeaway: optionalString(problem.takeaway, "收获/题解", LOG_LIMITS.takeaway),
      code: optionalString(problem.code, "代码", LOG_LIMITS.code),
    };
  });
  return { schemaVersion: LOG_SCHEMA_VERSION, problems };
}

export function metaFromProblems(problems) {
  return {
    schemaVersion: LOG_SCHEMA_VERSION,
    problems: problems.map(({ id, name, problem, platform, problemNumber, difficulty, tags, reviewStatus }) => ({
      id,
      name: name || problem,
      platform,
      problemNumber: String(problemNumber || "").trim(),
      difficulty,
      tags: normalizeTags(tags),
      reviewStatus: normalizeReviewStatus(reviewStatus),
    })),
  };
}

export function isDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
