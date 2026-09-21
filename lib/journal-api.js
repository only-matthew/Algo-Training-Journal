export const JOURNAL_API_URL = "https://algo-oauth.xialiao.org";

let csrfToken = null;

export class ApiError extends Error {
  constructor(message, status, details = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    Object.assign(this, details);
  }
}

export async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"] && !(typeof FormData !== "undefined" && options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (csrfToken && options.method && options.method !== "GET" && options.method !== "HEAD") {
    headers["X-CSRF-Token"] = csrfToken;
  }
  const response = await fetch(`${JOURNAL_API_URL}${path}`, { credentials: "include", ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body.error;
    const message = typeof error === "string" ? error : error?.message || `请求失败（${response.status}）`;
    throw new ApiError(message, response.status, {
      body,
      error: typeof error === "object" ? error : undefined,
      requestId: body.requestId,
      retryAfter: response.headers.get("Retry-After") || undefined,
    });
  }
  return body;
}

export function loginWithGitHub() {
  window.location.href = `${JOURNAL_API_URL}/auth/login?returnTo=${encodeURIComponent(window.location.href)}`;
}

export async function loadSession() {
  const data = await apiRequest("/api/session");
  csrfToken = data?.csrfToken || null;
  return data?.login ? data : null;
}
export function logoutSession() { csrfToken = null; return apiRequest("/api/logout", { method: "DELETE" }); }
export function loadDateLog(date) { return apiRequest(`/api/logs/date?date=${encodeURIComponent(date)}`); }
// 条件写入：expectedVersion 是读取时拿到的 revision（该日期不存在时为 null）。
// 服务端在缺失时返回 428，在过期时返回 409 并带上 currentRevision。
export function saveDateLog(date, problems, interval = {}, expectedVersion) {
  return apiRequest(`/api/logs/date?date=${encodeURIComponent(date)}`, {
    method: "PUT",
    body: JSON.stringify({ problems, ...interval, expectedVersion }),
  });
}
export function deleteDateLog(date, expectedVersion) {
  return apiRequest(`/api/logs/date?date=${encodeURIComponent(date)}`, {
    method: "DELETE",
    body: JSON.stringify({ expectedVersion }),
  });
}

/** 题面 PDF 的下载地址（走 v2 附件读取路由，需要登录会话）。 */
export function statementUrl(date, recordId) {
  return `${JOURNAL_API_URL}/api/v2/logs/dates/${encodeURIComponent(date)}/problems/${encodeURIComponent(recordId)}/statement`;
}

/** 已归档题面图片的读取地址（同样需要登录会话，文件名即内容哈希）。 */
export function statementImageUrl(date, recordId, fileName) {
  return `${JOURNAL_API_URL}/api/v2/logs/dates/${encodeURIComponent(date)}/problems/${encodeURIComponent(recordId)}/images/${encodeURIComponent(fileName)}`;
}

/**
 * v4 附件保存：multipart 提交 payload + 每个待上传 PDF/题面图片一个分区。
 *
 * 旧 JSON 接口没有上传字节的能力，因此只要涉及新增/替换 PDF 或题面图片就必须走这里。
 * `operationId` 同时作为幂等键：重试同一次保存不会产生第二个提交。
 *
 * @param {object} options
 * @param {object} options.log            v4 日志对象（含 schemaVersion: 4）
 * @param {string|null} options.expectedVersion 读取时拿到的 revision
 * @param {Array}  [options.attachmentChanges]  [{recordId, action, partName?}]
 * @param {Map<string,{blob: Blob, fileName: string}>} [options.attachments] partName -> PDF
 * @param {Map<string,{blob: Blob, fileName: string}>} [options.images] partName -> 题面图片
 * @param {string} options.operationId    幂等键（UUID）
 */
export function saveDateLogV2(date, { log, expectedVersion, attachmentChanges, attachments, images, operationId }) {
  const form = new FormData();
  form.set("payload", JSON.stringify({ operationId, expectedVersion, log, attachmentChanges }));
  for (const [partName, file] of attachments || []) form.set(partName, file.blob, file.fileName);
  // 图片分区名就是仓库文件名：服务端按名字校验内容哈希，不需要额外的映射表。
  for (const [partName, file] of images || []) form.set(partName, file.blob, file.fileName);
  return apiRequest(`/api/v2/logs/dates/${encodeURIComponent(date)}`, {
    method: "PUT",
    headers: { "Idempotency-Key": operationId },
    body: form,
  });
}
export function importCodeforces(handle) { return apiRequest("/api/import", { method: "POST", body: JSON.stringify({ platform: "codeforces", handle }) }); }
export function importLuogu(numbers) { return apiRequest("/api/import", { method: "POST", body: JSON.stringify({ platform: "luogu", numbers }) }); }
export function importAtCoder(handle) { return apiRequest("/api/import", { method: "POST", body: JSON.stringify({ platform: "atcoder", handle }) }); }
// 题面抓取：platform 为 Codeforces（被反爬拦下时服务端退回洛谷镜像）或 AtCoder。
export function fetchProblemStatement(platform, problemNumber, sourceUrl) { return apiRequest("/api/problem-statement", { method: "POST", body: JSON.stringify({ platform, problemNumber, ...(sourceUrl ? { sourceUrl } : {}) }) }); }
// 浏览器小书签抓回的 AtCoder 官方页源码：服务端不再请求上游，直接用同一个解析器处理。
export function parseProblemStatementHtml(platform, problemNumber, html) { return apiRequest("/api/problem-statement", { method: "POST", body: JSON.stringify({ platform, problemNumber, html }) }); }
