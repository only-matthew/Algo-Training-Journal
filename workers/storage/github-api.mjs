export const REPO = "only-matthew/Algo-Training-Journal";
export const BRANCH = "main";
export function ghHeaders(token) { return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Algo-Training-Journal-Worker", "X-GitHub-Api-Version": "2022-11-28" }; }
export async function gh(path, token, options = {}) {
  const response = await fetch(path.startsWith("http") ? path : `https://api.github.com/repos/${REPO}${path}`, { ...options, headers: { ...ghHeaders(token), ...(options.headers || {}) } });
  const remaining = parseInt(response.headers.get("X-RateLimit-Remaining"), 10);
  if (remaining === 0) {
    const resetTime = parseInt(response.headers.get("X-RateLimit-Reset"), 10);
    const resetDate = resetTime ? new Date(resetTime * 1000).toLocaleTimeString("zh-CN") : "unknown";
    console.error(`GitHub API rate limit exhausted. Resets at ${resetDate}`);
    throw Object.assign(new Error(`GitHub API 请求配额已用完，约 ${resetDate} 恢复`), { status: 429 });
  }
  if (!Number.isNaN(remaining) && remaining < 10) {
    console.warn(`GitHub API rate limit low: ${remaining} remaining`);
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error(`GitHub API ${response.status} for ${path}: ${detail}`);
    if (response.status === 403) throw Object.assign(new Error("没有仓库权限，请确认已接受仓库邀请"), { status: 403 });
    if (response.status === 429) throw Object.assign(new Error("请求过于频繁，请稍后再试"), { status: 429 });
    throw Object.assign(new Error("GitHub API 请求失败"), { status: response.status >= 500 ? 502 : 400 });
  }
  return response.status === 204 ? null : response.json();
}
