export const JOURNAL_API_URL = "https://algo-oauth.xialiao.org";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(`${JOURNAL_API_URL}${path}`, { credentials: "include", ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || `请求失败（${response.status}）`, response.status);
  return body;
}

export function loginWithGitHub() {
  window.location.href = `${JOURNAL_API_URL}/auth/login?returnTo=${encodeURIComponent(window.location.href)}`;
}

export function loadSession() { return apiRequest("/api/session"); }
export function logoutSession() { return apiRequest("/api/logout", { method: "DELETE" }); }
export function loadDateLog(date) { return apiRequest(`/api/logs/date?date=${encodeURIComponent(date)}`); }
export function saveDateLog(date, problems) { return apiRequest(`/api/logs/date?date=${encodeURIComponent(date)}`, { method: "PUT", body: JSON.stringify({ problems }) }); }
export function deleteDateLog(date) { return apiRequest(`/api/logs/date?date=${encodeURIComponent(date)}`, { method: "DELETE" }); }
