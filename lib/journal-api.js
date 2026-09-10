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
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
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
export function saveDateLog(date, problems) { return apiRequest(`/api/logs/date?date=${encodeURIComponent(date)}`, { method: "PUT", body: JSON.stringify({ problems }) }); }
export function deleteDateLog(date) { return apiRequest(`/api/logs/date?date=${encodeURIComponent(date)}`, { method: "DELETE" }); }
export function importCodeforces(handle) { return apiRequest("/api/import", { method: "POST", body: JSON.stringify({ platform: "codeforces", handle }) }); }
export function importLuogu(numbers) { return apiRequest("/api/import", { method: "POST", body: JSON.stringify({ platform: "luogu", numbers }) }); }
export function importAtCoder(handle) { return apiRequest("/api/import", { method: "POST", body: JSON.stringify({ platform: "atcoder", handle }) }); }
