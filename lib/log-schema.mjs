export const LOG_SCHEMA_VERSION = 2;
export const REVIEW_STATUSES = ["none", "todo", "mastered"];

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,，]/) : [];
  return [...new Set(source.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 10);
}

function normalizeReviewStatus(value) {
  return REVIEW_STATUSES.includes(value) ? value : "none";
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
  if (input.problems.length < 1 || input.problems.length > 50) {
    throw new RangeError("每次记录需包含 1 到 50 道题");
  }

  const ids = new Set();
  const problems = input.problems.map((problem) => {
    const id = typeof problem.id === "string" && problem.id.trim()
      ? problem.id.trim()
      : createProblemId();
    const name = typeof problem.name === "string" ? problem.name.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new TypeError("题目 ID 格式无效");
    if (ids.has(id)) throw new TypeError("题目 ID 不可重复");
    if (!name || name.length > 200) throw new TypeError("题目名称长度必须为 1 到 200 字符");
    ids.add(id);
    return {
      id,
      name,
      platform: String(problem.platform || "未填写").slice(0, 50),
      difficulty: String(problem.difficulty || "未标注").slice(0, 50),
      tags: normalizeTags(problem.tags).map((tag) => tag.slice(0, 30)),
      reviewStatus: normalizeReviewStatus(problem.reviewStatus),
      description: String(problem.description || "").slice(0, 100_000),
      takeaway: String(problem.takeaway || "").slice(0, 100_000),
      code: String(problem.code || "").slice(0, 500_000),
    };
  });
  return { schemaVersion: LOG_SCHEMA_VERSION, problems };
}

export function metaFromProblems(problems) {
  return {
    schemaVersion: LOG_SCHEMA_VERSION,
    problems: problems.map(({ id, name, problem, platform, difficulty, tags, reviewStatus }) => ({
      id,
      name: name || problem,
      platform,
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