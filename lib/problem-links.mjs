import { escapeHtml } from "./escape-html.mjs";
import { PLATFORMS, formatUpdateDate, formatUpdateTime } from "./constants.mjs";

// 记录卡片的「最后更新时间」徽标（构建脚本与浏览器端共用同一格式）
export function updatedLabel(log) {
  if (!log.updatedAt) return "";
  return `<span class="updated-at" title="最后更新时间 ${escapeHtml(formatUpdateTime(log.updatedAt))}">最后更新 ${escapeHtml(formatUpdateDate(log.updatedAt))}</span>`;
}

// 由平台、题号（可选标题兜底解析）计算原题 URL；解析失败返回空串。纯函数，浏览器端与构建端共用。
export function originalProblemUrl(platform, problemNumber, title = "") {
  let number = String(problemNumber || "").trim();
  if (!number && platform === PLATFORMS.LUOGU) {
    number = String(title).match(/\b([A-Za-z]\d+[A-Za-z0-9_-]*)\b/)?.[1] || "";
  }
  if (!number && platform === PLATFORMS.CODEFORCES) {
    const match = String(title).match(/(?:codeforces\s+round\s+)?(\d+)\s*(?:\([^)]*\)\s*)?([A-Za-z]\d*)\s*$/i);
    number = match ? `${match[1]}${match[2]}` : "";
  }
  if (!number) return "";
  if (platform === PLATFORMS.LUOGU && /^[A-Za-z][A-Za-z0-9_-]*$/.test(number)) {
    return `https://www.luogu.com.cn/problem/${encodeURIComponent(number)}`;
  }
  if (platform === PLATFORMS.CODEFORCES) {
    const match = number.match(/^(\d+)\s*(?:\/|-|\s)?\s*([A-Za-z][A-Za-z0-9]*)$/);
    if (match) return `https://codeforces.com/problemset/problem/${match[1]}/${match[2].toUpperCase()}`;
  }
  if (platform === PLATFORMS.ATCODER) {
    // 题号即任务 ID（如 abc381_a），比赛 ID 为最后一个下划线之前的部分（如 abc381）
    const contest = number.replace(/_[^_]*$/, "");
    if (contest && contest !== number) {
      return `https://atcoder.jp/contests/${encodeURIComponent(contest)}/tasks/${encodeURIComponent(number)}`;
    }
  }
  // 其余 OJ（UVA/HDU/POJ/OpenJ_Bailian/SPOJ/LibreOJ/UniversalOJ）统一走 vjudge 聚合站，
  // 其题目代码与洛谷题单/罗勇军/刘汝佳 txt 中的平台名+题号一一对应，保证可点击跳转。
  const vjudgePlatforms = new Set(["UVA", "HDU", "POJ", "OpenJ_Bailian", "SPOJ", "LibreOJ", "UniversalOJ"]);
  if (vjudgePlatforms.has(platform)) {
    return `https://vjudge.net/problem/${encodeURIComponent(platform)}-${encodeURIComponent(number)}`;
  }
  return "";
}

