import { ApiError, apiRequest } from "./journal-api.js";

export const TRAINING_API_PREFIX = "/api/v2";

const STATUS_CODES = {
  400: "MALFORMED_REQUEST",
  401: "AUTH_REQUIRED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "VERSION_CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  422: "VALIDATION_FAILED",
  428: "PRECONDITION_REQUIRED",
  429: "RATE_LIMITED",
  502: "UPSTREAM_UNAVAILABLE",
  503: "UPSTREAM_UNAVAILABLE",
};

function defaultCreateId() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("浏览器不支持 crypto.randomUUID，无法安全创建幂等键");
  }
  return globalThis.crypto.randomUUID();
}

function requireUuid(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TypeError(`${label} 必须是 UUID v4`);
  }
  return value;
}

function requireRevision(revision) {
  if (typeof revision !== "string" || revision.length === 0) {
    throw new TypeError("已有资源必须提供服务端返回的 revision");
  }
  return revision;
}

function createHeaders({ revision, create, idempotencyKey } = {}) {
  const headers = {};
  if (create === true) headers["If-None-Match"] = "*";
  if (revision !== undefined && revision !== null) headers["If-Match"] = `"${requireRevision(revision)}"`;
  if (idempotencyKey) headers["Idempotency-Key"] = requireUuid(idempotencyKey, "Idempotency-Key");
  return headers;
}

function conditionalWriteOptions(options = {}) {
  if (!Object.hasOwn(options, "revision")) {
    throw new TypeError("条件写入必须提供服务端返回的 revision；新资源请传 revision: null");
  }
  return { ...options, create: options.create ?? options.revision === null };
}

function requirePreconditions(command) {
  if (!command || typeof command !== "object" || Array.isArray(command)
    || !command.preconditions || typeof command.preconditions !== "object" || Array.isArray(command.preconditions)) {
    throw new TypeError("跨资源命令必须提供 preconditions");
  }
  return command;
}

function query(path, values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values || {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else {
      params.set(key, value);
    }
  }
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function assertNoMemberId(payload) {
  if (payload && Object.hasOwn(payload, "memberId")) {
    throw new TypeError("训练 API 从会话识别队员，不能提交 memberId");
  }
}

export class TrainingApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "TrainingApiError";
    Object.assign(this, details);
  }
}

function structuredError(error) {
  if (error instanceof TrainingApiError) return error;
  const detail = error?.error || error?.body?.error || {};
  const status = error instanceof ApiError ? error.status : error?.status;
  return new TrainingApiError(detail.message || error?.message || "训练请求失败", {
    status,
    code: detail.code || STATUS_CODES[status] || "REQUEST_FAILED",
    fieldErrors: detail.fieldErrors,
    currentRevision: detail.currentRevision,
    operationId: detail.operationId,
    requestId: error?.requestId || error?.body?.requestId,
    retryAfter: error?.retryAfter,
    cause: error,
  });
}

/**
 * Browser-only transport boundary for the v2 training API.  It has no DOM
 * dependencies; callers may supply AbortSignal through every method option.
 */
export function createTrainingApi({ request = apiRequest, createId = defaultCreateId } = {}) {
  async function get(path, { signal } = {}) {
    try {
      return await request(`${TRAINING_API_PREFIX}${path}`, { method: "GET", signal });
    } catch (error) {
      throw structuredError(error);
    }
  }

  async function mutate(method, path, body, options = {}) {
    assertNoMemberId(body);
    const idempotencyKey = options.idempotencyKey || createId();
    const headers = createHeaders({
      revision: options.revision,
      create: options.create === true,
      idempotencyKey,
    });
    try {
      return await request(`${TRAINING_API_PREFIX}${path}`, {
        method,
        headers,
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (error) {
      throw structuredError(error);
    }
  }

  const datePath = (date) => `/me/plans/${encodeURIComponent(date)}`;
  const recordPath = (date, id) => `/me/logs/dates/${encodeURIComponent(date)}/records/${encodeURIComponent(id)}`;

  return Object.freeze({
    getProfile: (options) => get("/me/profile", options),
    putProfile: (profile, options = {}) => mutate("PUT", "/me/profile", profile, conditionalWriteOptions(options)),
    getWorkbench: ({ date, signal } = {}) => get(query("/me/workbench", { date }), { signal }),
    getRecommendations: ({ date, exclude, signal } = {}) => {
      if (exclude?.length > 50) throw new RangeError("exclude 最多包含 50 个 subjectKey");
      return get(query("/me/recommendations", { date, exclude }), { signal });
    },
    getDateLog: (date, options) => get(`/me/logs/dates/${encodeURIComponent(date)}`, options),
    putDateLog: (date, problems, options = {}) => mutate("PUT", `/me/logs/dates/${encodeURIComponent(date)}`, { problems }, conditionalWriteOptions(options)),
    deleteDateLog: (date, cascadeOwnedAttempts, options = {}) => mutate("DELETE", `/me/logs/dates/${encodeURIComponent(date)}`, { cascadeOwnedAttempts }, conditionalWriteOptions(options)),
    createRecord: (command, options) => {
      assertNoMemberId(command);
      return mutate("POST", "/me/records", requirePreconditions(command), options);
    },
    getRecord: (date, id, options) => get(recordPath(date, id), options),
    patchRecord: (date, id, patch, options = {}) => mutate("PATCH", recordPath(date, id), { patch }, conditionalWriteOptions(options)),
    deleteRecord: (date, id, cascadeOwnedAttempts, options = {}) => mutate("DELETE", recordPath(date, id), { cascadeOwnedAttempts }, conditionalWriteOptions(options)),
    getAttempts: ({ subjectKey, cursor, limit, signal } = {}) => get(query("/me/attempts", { subjectKey, cursor, limit }), { signal }),
    createAttempt: (command, options) => mutate("POST", "/me/attempts", requirePreconditions(command), options),
    correctAttempt: (id, patch, options = {}) => mutate("POST", `/me/attempts/${encodeURIComponent(id)}/corrections`, { patch }, conditionalWriteOptions(options)),
    voidAttempt: (id, reason, options = {}) => mutate("POST", `/me/attempts/${encodeURIComponent(id)}/void`, { reason }, conditionalWriteOptions(options)),
    getReviews: (options) => get("/me/reviews", options),
    reviewAction: (command, options) => mutate("POST", "/me/review-actions", requirePreconditions(command), options),
    getEvidence: (nodeId, { cursor, signal } = {}) => get(query(`/me/evidence/${encodeURIComponent(nodeId)}`, { cursor }), { signal }),
    getPlan: (date, options) => get(datePath(date), options),
    putPlan: (date, command, options = {}) => mutate("PUT", datePath(date), command, conditionalWriteOptions(options)),
    planAction: (command, options) => mutate("POST", "/me/plan-actions", requirePreconditions(command), options),
    linkPlanAttempt: (command, options) => mutate("POST", "/me/plan-links", requirePreconditions(command), options),
    getAssessment: (nodeId, options) => get(`/me/assessments/${encodeURIComponent(nodeId)}`, options),
    putAssessment: (nodeId, assessment, options = {}) => mutate("PUT", `/me/assessments/${encodeURIComponent(nodeId)}`, assessment, conditionalWriteOptions(options)),
    getOperation: (id, options) => get(`/me/operations/${encodeURIComponent(id)}`, options),
  });
}

export const trainingApi = createTrainingApi();
