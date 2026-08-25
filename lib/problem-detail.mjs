import { escapeHtml, renderMarkdown } from "./render-safety.mjs";
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

// 题目详情页正文的共享模板：构建脚本（Node 预渲染）与浏览器端渲染共用同一份 HTML 结构，
// 避免三处重复维护。sourceUrl 为空时不渲染「前往原题」按钮（构建脚本无此需求）。
export function problemDetailHtml(log, { sourceUrl = "", memberHref = "" } = {}) {
  const updated = updatedLabel(log);
  const badges = [
    ...(log.tags || []).map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`),
    ...(log.reviewStatus === "todo" ? [`<span class="review-chip todo">待复习</span>`] : []),
    ...(log.reviewStatus === "mastered" ? [`<span class="review-chip mastered">已掌握</span>`] : []),
  ].join("");
  return `<div class="problem-detail-head">
      <div>
        <p class="eyebrow">${escapeHtml(log.date)} · 第 ${(log.problemIndex ?? 0) + 1} 题${updated ? ` · ${updated}` : ""}</p>
        <h1>${escapeHtml(log.problem)}</h1>
      </div>
      <div class="problem-detail-actions">
        ${sourceUrl ? `<a class="btn btn-primary problem-source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">前往原题 ↗</a>` : ""}
        ${memberHref ? `<a class="member-chip" href="${escapeHtml(memberHref)}">${escapeHtml(log.member)} 的主页</a>` : ""}
      </div>
    </div>
    <p class="problem-meta">平台：${escapeHtml(log.platform)} ${log.problemNumber ? `<span>题号：${escapeHtml(log.problemNumber)}</span>` : ""} <span>难度：${escapeHtml(log.difficulty)}</span></p>
    ${badges ? `<div class="record-badges">${badges}</div>` : ""}
    <div class="problem-content">
      ${log.description ? `<section class="problem-section"><h2>题目描述</h2>${renderMarkdown(log.description)}</section>` : ""}
      ${log.takeaway ? `<section class="problem-section"><h2>收获 / 题解</h2>${renderMarkdown(log.takeaway)}</section>` : ""}
      ${log.code ? `<section class="problem-section"><h2>代码</h2><div class="record-takeaway problem-code-expanded"><pre class="line-numbers"><code class="language-cpp">${escapeHtml(log.code)}</code></pre></div></section>` : ""}
    </div>`;
}

// 全队同题记录（二刷关联）：构建期由 generate-data.js 聚合进单题 JSON 的 related 字段，
// 浏览器端渲染与构建期预渲染共用同一份结构。current 用于排除当前记录自身。
export function relatedSectionHtml(related = [], current = {}) {
  const currentId = String(current.problemId || current.problemIndex || 0);
  const list = (related || []).filter(
    (r) => !(r.member === current.member && r.date === current.date && String(r.problemId) === currentId),
  );
  if (!list.length) return "";
  const items = list
    .map((r) => {
      const href = `/problem/${encodeURIComponent(r.member)}/${encodeURIComponent(r.date)}/${encodeURIComponent(r.problemId)}/`;
      const status = r.reviewStatus === "todo" ? " · 待复习" : r.reviewStatus === "mastered" ? " · 已掌握" : "";
      return `<li><a href="${escapeHtml(href)}">${escapeHtml(r.problem)}</a><span class="related-meta">${escapeHtml(r.member)} · ${escapeHtml(r.date)}${status}</span></li>`;
    })
    .join("");
  return `<section class="problem-section related-section">
      <h2>全队同题记录</h2>
      <p class="related-hint">该题在队伍里共被记录 ${list.length} 次：</p>
      <ul class="related-list">${items}</ul>
    </section>`;
}
