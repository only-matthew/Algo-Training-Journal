import { escapeHtml } from "./render-safety.mjs";
import { originalProblemUrl, updatedLabel } from "./problem-detail.mjs";
import { icon } from "./icons.mjs";

const paths = {
  book: '<path d="M4 4h6a3 3 0 0 1 2 2 3 3 0 0 1 2-2h6v16h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4zM12 6v15"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16m-12 4h2m4 0h2m-8 3h2"/>',
  tag: '<path d="m20 13-7 7-9-9V4h7z"/><circle cx="8.5" cy="8.5" r="1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  pen: '<path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14zM3 22h18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
};
export function trainingCardHtml(log) {
  const href = `/problem/${encodeURIComponent(log.member)}/${encodeURIComponent(log.date)}/${encodeURIComponent(log.problemId || log.problemIndex || 0)}/`;
  const source = originalProblemUrl(log.platform, log.problemNumber, log.problem);
  const tags = log.tags || [];
  const difficulty = String(log.difficulty || "未标注");
  const tone = /NOI|IOI|省选/i.test(difficulty) ? "expert" : /困难|较难|提高|Hard/i.test(difficulty) ? "hard" : /简单|入门|普及-|Easy/i.test(difficulty) ? "easy" : "medium";
  const summary = String(log.description || log.takeaway || log.summary || "记录训练过程、解题思路与复盘收获。").replace(/```[\s\S]*?```/g, " ").replace(/[#>*`]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return `<div class="record-title-row"><h3 class="record-title"><a href="${href}">${log.problemNumber && !String(log.problem).includes(log.problemNumber) ? `<span class="problem-number">${escapeHtml(log.problemNumber)}</span> ` : ""}${escapeHtml(log.problem)}</a></h3><span class="difficulty-badge ${tone}">${escapeHtml(difficulty)}</span></div>
    ${summary ? `<p class="record-summary">${escapeHtml(summary)}</p>` : ""}
    <div class="record-badges">${tags.slice(0, 4).map(tag => `<a class="tag-chip" href="/tags/${encodeURIComponent(tag)}/">${escapeHtml(tag)}</a>`).join("")}${tags.length > 4 ? `<a class="tag-chip" href="${href}" aria-label="查看其余 ${tags.length - 4} 个标签">+${tags.length - 4}</a>` : ""}${log.reviewStatus === "todo" || log.reviewStatus === "mastered" ? `<span class="review-chip ${log.reviewStatus}">${log.reviewStatus === "todo" ? "待复习" : "已掌握"}</span>` : ""}</div>
    <div class="record-head"><a class="member-link" href="/member/${encodeURIComponent(log.member)}/"><span class="member-initial" aria-hidden="true">${escapeHtml(Array.from(log.member || "")[0] || "")}</span>${escapeHtml(log.member)}</a><span class="record-date-wrap">${icon("calendar")}<time datetime="${escapeHtml(log.date)}">${escapeHtml(log.date)}</time></span><span class="record-platform">${escapeHtml(log.platform)}</span></div>
    <div class="record-links">${updatedLabel(log)}${source ? `<a class="record-source-link" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">原题 ↗</a>` : ""}<a class="record-detail-link" href="${href}">查看详情 →</a></div>`;
}
