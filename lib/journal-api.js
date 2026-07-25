export const JOURNAL_API_URL = "https://algo-oauth.xialiao.org";

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${JOURNAL_API_URL}${path}`, { credentials: "include", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
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