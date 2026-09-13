import { escapeHtml } from "./escape-html.mjs";
import { PLATFORMS, formatUpdateDate, formatUpdateTime } from "./constants.mjs";
import { isCompleteProblemNumber } from "./problem-identity.mjs";

// 记录卡片的「最后更新时间」徽标（构建脚本与浏览器端共用同一格式）
export function updatedLabel(log) {
  if (!log.updatedAt) return "";
  return `<span class="updated-at" title="最后更新时间 ${escapeHtml(formatUpdateTime(log.updatedAt))}">最后更新 ${escapeHtml(formatUpdateDate(log.updatedAt))}</span>`;
}

// 从 Codeforces 场次标题中解析出「完整题号」（如 1113B）。
// 历史记录有两种残缺形态，都要能还原：
//   1) 名称含场次+代号   -> 'Educational Codeforces Round 192 (Rated for Div. 2) B'
//   2) 只有名称含场次    -> 名称 'Codeforces Round 1110, Div. 1 + Div. 2' + 题号栏 'A'
// 解析依据固定：名称里 "round <数字>" 的数字即场次号。取不到时返回空串，绝不猜。
export function resolveCodeforcesProblemNumber(problemNumber, title) {
  const number = String(problemNumber || "").trim();
  if (isCompleteProblemNumber(PLATFORMS.CODEFORCES, number)) return number.toUpperCase();

  const suffixBranch = String(title).match(/([A-Za-z]\d*)\s*$/)?.[1];
  const hasBranchInTitle = suffixBranch && !/^div/i.test(suffixBranch);
  const round = String(title).match(/round[^0-9]*(\d+)/i)?.[1] || "";

  if (hasBranchInTitle) {
    // 名称里同时含场次与代号：以名称为准（题号栏可能为空或填错）
    return round ? `${round}${suffixBranch.toUpperCase()}` : "";
  }
  // 名称只含场次：与题号栏里的字母代号组合
  const bareBranch = number.match(/^([A-Za-z]\d*)$/)?.[1];
  return round && bareBranch ? `${round}${bareBranch.toUpperCase()}` : "";
}

// 由平台、题号（可选标题兜底解析）计算原题 URL；解析失败返回空串。纯函数，浏览器端与构建端共用。
// 题号残缺时（如 Codeforces 只填了 "B"）同样回退到标题解析，否则这些历史记录无法跳转原题。
export function originalProblemUrl(platform, problemNumber, title = "") {
  let number = String(problemNumber || "").trim();
  const incomplete = !isCompleteProblemNumber(platform, number);
  if (incomplete && platform === PLATFORMS.LUOGU) {
    number = String(title).match(/\b([A-Za-z]\d+[A-Za-z0-9_-]*)\b/)?.[1]?.toUpperCase() || number;
  }
  if (platform === PLATFORMS.CODEFORCES) {
    const resolved = resolveCodeforcesProblemNumber(number, title);
    if (resolved) number = resolved;
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

