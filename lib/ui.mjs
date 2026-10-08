import { escapeHtml } from "./escape-html.mjs";
import { originalProblemUrl, updatedLabel } from "./problem-links.mjs";
import { icon } from "./icons.mjs";
import { ratingLabel, ratingTone } from "./rating.mjs";
import { MASTERY_LABELS, OUTCOME_LABELS, REVIEW_LABELS, normalizeLearningState } from "./learning-state.mjs";
import { tagHref } from "./tag-index.mjs";
import { realTakeaway } from "./takeaway.mjs";

export function trainingCardHtml(log) {
  const state = normalizeLearningState(log);
  const href = `/problem/${encodeURIComponent(log.member)}/${encodeURIComponent(log.date)}/${encodeURIComponent(log.problemId || log.problemIndex || 0)}/`;
  const source = originalProblemUrl(log.platform, log.problemNumber, log.problem);
  const tags = log.tags || [];
  const difficulty = ratingLabel(log.difficultyRating, String(log.difficulty || "未标注"));
  const tone = ratingTone(log.difficultyRating);
  // 活力指数：这道题折合多少「学习增量」，与题数并排但不替换题数
  const vitalityReason = {
    duplicate: '同题已计', review: '复习不重复计分', missing_rating: '待补难度',
  }[log.vitalityStatus];
  const vitalityValue = Number(log.vitality) || 0;
  const vitalityText = vitalityReason || ('活力 ' + (vitalityValue > 0 && vitalityValue < 0.01 ? '<0.01' : vitalityValue.toFixed(2)));
  const vitality = log.vitality != null
    ? '<span class="vitality-badge" title="按难度与已有训练证据估算；未知完成质量采用保守折算">' + escapeHtml(vitalityText) + '</span>'
    : '';
  const summary = String(realTakeaway(log.takeaway) || log.summary || log.description || "").replace(/```[\s\S]*?```/g, " ").replace(/[#>*`]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
  const result = [state.outcome ? `本次${OUTCOME_LABELS[state.outcome]}` : "完成结果未记录", log.hasEarlierAttempt ? "重做记录" : ""].filter(Boolean).join(" · ");
  return `<div class="record-title-row"><h3 class="record-title"><a href="${href}">${log.problemNumber && !String(log.problem).includes(log.problemNumber) ? `<span class="problem-number">${escapeHtml(log.problemNumber)}</span> ` : ""}${escapeHtml(log.problem)}</a></h3><span class="difficulty-badge ${tone}">${escapeHtml(difficulty)}</span></div>
    <p class="record-outcome${state.outcome === "independent" ? " is-independent" : ""}">${escapeHtml(result)}</p>
    ${summary ? `<p class="record-summary">${escapeHtml(summary)}</p>` : ""}
    <div class="record-badges">${tags.slice(0, 4).map(tag => `<a class="tag-chip" href="${tagHref(tag)}">${escapeHtml(tag)}</a>`).join("")}${tags.length > 4 ? `<a class="tag-chip" href="${href}" aria-label="查看其余 ${tags.length - 4} 个标签">+${tags.length - 4}</a>` : ""}${state.isMistake ? '<span class="review-chip todo">本次有失误</span>' : ""}${state.masteryStatus !== "unknown" ? `<span class="review-chip mastered">${escapeHtml(MASTERY_LABELS[state.masteryStatus])}</span>` : ""}${state.reviewStatus !== "none" ? `<span class="review-chip ${state.reviewStatus === "todo" ? "todo" : state.reviewStatus === "deferred" ? "deferred" : "mastered"}">${escapeHtml(REVIEW_LABELS[state.reviewStatus])}</span>` : ""}${log.teamSameProblemCount ? `<a class="review-chip" href="${href}#problem-team">${log.teamSameProblemMemberCount ? `队友同题 ${Number(log.teamSameProblemMemberCount)} 人` : `队内同题 ${Number(log.teamSameProblemCount)}`}</a>` : ""}</div>
    <div class="record-head"><a class="member-link" href="/member/${encodeURIComponent(log.member)}/"><span class="member-initial" aria-hidden="true">${escapeHtml(Array.from(log.member || "")[0] || "")}</span>${escapeHtml(log.member)}</a><span class="record-date-wrap">${icon("calendar")}<time datetime="${escapeHtml(log.date)}">${escapeHtml(log.date)}</time></span><span class="record-platform">${escapeHtml(log.platform)}</span>${vitality}</div>
    <div class="record-links">${updatedLabel(log)}${source ? `<a class="record-source-link" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">原题 ↗</a>` : ""}<a class="record-detail-link" href="${href}">查看详情 →</a></div>`;
}
