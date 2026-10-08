import { escapeHtml, renderMarkdown } from "./render-safety.mjs";
import { originalProblemUrl, updatedLabel } from "./problem-links.mjs";
export { originalProblemUrl, updatedLabel } from "./problem-links.mjs";
import { icon } from "./icons.mjs";
import { verseHtml } from "./detail-ui.mjs";
import { ratingLabel, ratingTone } from "./rating.mjs";
import { MASTERY_LABELS, OUTCOME_LABELS, REVIEW_LABELS, normalizeLearningState } from "./learning-state.mjs";
import { tagHref } from "./tag-index.mjs";
import { realTakeaway } from "./takeaway.mjs";

// 题目详情页正文的共享模板：构建脚本（Node 预渲染）与浏览器端渲染共用同一份 HTML 结构，
// 避免三处重复维护。sourceUrl 为空时不渲染「前往原题」按钮（构建脚本无此需求）。
export function problemDetailHtml(log, { sourceUrl = "", memberHref = "" } = {}) {
  const state = normalizeLearningState(log);
  sourceUrl ||= originalProblemUrl(log.platform, log.problemNumber, log.problem);
  memberHref ||= `/member/${encodeURIComponent(log.member || "")}/`;
  const difficultyText = ratingLabel(log.difficultyRating, log.difficulty);
  const difficultyClass = ratingTone(log.difficultyRating);
  const vitality = Number(log.vitality) || 0;
  const vitalityReason = {
    duplicate: "同题已计，不重复加分",
    review: "复习记录不重复计分",
    missing_rating: "补充难度后才能估算",
  }[log.vitalityStatus] || "按难度、完成结果与训练证据估算";
  const vitalityValue = log.vitalityStatus === "missing_rating" ? "—"
    : vitality > 0 && vitality < 0.01 ? "<0.01" : vitality.toFixed(2);
  const redoQuery = new URLSearchParams({ redo: JSON.stringify({
    name: log.problem,
    platform: log.platform,
    problemNumber: log.problemNumber || "",
    difficulty: log.difficulty || "",
    difficultyRating: Number(log.difficultyRating) || 0,
    tags: Array.isArray(log.tags) ? log.tags : [],
  }) });
  const badges = [
    ...(log.tags || []).map((tag) => `<a class="tag-chip" href="${tagHref(tag)}">${escapeHtml(tag)}</a>`),
    ...(state.isMistake ? [`<span class="review-chip todo">本次有失误</span>`] : []),
    ...(state.masteryStatus !== "unknown" ? [`<span class="review-chip mastered">${escapeHtml(MASTERY_LABELS[state.masteryStatus])}</span>`] : []),
    ...(state.reviewStatus !== "none" ? [`<span class="review-chip ${state.reviewStatus === "todo" ? "todo" : state.reviewStatus === "deferred" ? "deferred" : "mastered"}">${escapeHtml(REVIEW_LABELS[state.reviewStatus])}</span>`] : []),
  ].join("");
  return `<header class="page-hero problem-hero"><div class="hero-art" aria-hidden="true"></div>
      <div class="hero-copy"><h1>${log.problemNumber && !String(log.problem).includes(log.problemNumber) ? `${escapeHtml(log.problemNumber)}　` : ""}${escapeHtml(log.problem)}</h1>
      <p class="problem-meta">来源：${escapeHtml(log.platform)} <span class="difficulty-badge ${difficultyClass}">${escapeHtml(difficultyText)}</span></p>
      <div class="record-badges">${badges}</div>
      ${log.vitality != null ? `<div class="problem-vitality"><span>本题活力</span><strong>${escapeHtml(vitalityValue)}</strong><small>${escapeHtml(vitalityReason)}</small></div>` : ""}</div>${verseHtml()}
      <div class="detail-hero-actions">${sourceUrl ? `<a class="btn btn-outline problem-source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${icon("external")}查看原题</a>` : ""}<a class="btn btn-primary" href="${escapeHtml(memberHref)}">${icon("user")}${escapeHtml(log.member)} 的主页</a></div>
    </header>
    <nav class="detail-tabs" aria-label="题目内容"><a class="active" href="#problem-description">${icon("file")}题目详情</a><a href="#problem-thoughts">${icon("pen")}思考与重做</a><a href="#problem-code">${icon("code")}代码</a><a href="#problem-tags">${icon("tag")}相关标签</a></nav>
    <div class="problem-layout"><div class="problem-main">
      <section class="detail-panel" id="problem-description"><h2>${icon("file")}题目描述</h2>${log.statementUrl ? `<p><a class="btn btn-outline btn-sm" href="${escapeHtml(log.statementUrl)}" download>下载原题 PDF</a></p>` : ""}<div class="detail-prose">${log.description ? renderMarkdown(log.description) : '<p class="hint">这条记录尚未填写题目描述，可通过上方入口查看原题。</p>'}</div></section>
      ${log.aiAnalysis?.result ? `<section class="detail-panel" id="problem-analysis"><h2>${icon("pen")}题目分析</h2><p>${escapeHtml(log.aiAnalysis.result.summary || "")}</p><p><strong>思路：</strong>${escapeHtml(log.aiAnalysis.result.analysis?.approach || "")}</p><p class="hint">难度来源：${escapeHtml(log.metadataSources?.difficultyRating?.kind === "ai-estimate" ? "AI 估计" : "人工整理")}</p></section>` : ""}
      ${relatedSectionHtml(log.related, log)}
      <section class="detail-panel" id="problem-code"><div class="section-heading"><h2>${icon("code")}代码</h2>${log.code ? '<button class="btn btn-outline btn-sm" type="button" data-copy-code>复制代码</button>' : ""}</div>${log.code ? `<div class="problem-code-expanded"><pre class="line-numbers"><code class="language-cpp">${escapeHtml(log.code)}</code></pre></div>` : '<p class="hint">这条记录尚未附上代码。</p>'}<span class="copy-feedback" role="status"></span></section>
    </div><aside class="problem-aside"><section class="detail-panel"><div class="section-heading"><h2>${icon("file")}题目信息</h2><div data-problem-edit hidden></div></div><dl class="problem-facts"><dt>题目编号</dt><dd>${escapeHtml(log.problemNumber || "未填写")}</dd><dt>来源平台</dt><dd>${escapeHtml(log.platform)}</dd><dt>难度</dt><dd>${escapeHtml(difficultyText)}</dd><dt>记录成员</dt><dd><a href="${escapeHtml(memberHref)}">${escapeHtml(log.member)}</a></dd><dt>训练日期</dt><dd>${escapeHtml(log.date)}</dd><dt>失误标记</dt><dd>${state.isMistake ? "本次有失误" : "未标记失误"}</dd><dt>掌握自评</dt><dd>${escapeHtml(MASTERY_LABELS[state.masteryStatus])}${state.masteryStatusSource === "legacy_review_status" ? '<small class="legacy-mastery-note">由历史复习状态映射，非本人新自评</small>' : ""}</dd><dt>复习安排</dt><dd>${escapeHtml(REVIEW_LABELS[state.reviewStatus])}</dd></dl><div class="problem-review-actions" data-problem-review role="group" aria-label="复习操作" hidden></div><a class="btn btn-primary btn-sm problem-redo-link" href="/submit/?${escapeHtml(redoQuery.toString())}">记录一次重做</a><p class="hint problem-redo-hint">前往提交页填写新记录。</p></section>
    <section class="detail-panel" id="problem-tags"><h2>${icon("tag")}相关标签</h2><div class="record-badges">${badges || '<p class="hint">尚未添加标签。</p>'}</div></section>
    </aside></div>`;
}

// related 是全队同题记录；个人历史与队友记录分开，当前记录始终优先。
export function relatedSectionHtml(related = [], current = {}) {
  const currentId = String(current.problemId || current.problemIndex || 0);
  const otherAttempts = (related || []).filter(
    (r) => !(r.member === current.member && r.date === current.date && String(r.problemId) === currentId),
  );
  const latestFirst = (a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.problemId || "").localeCompare(String(b.problemId || ""));
  const personal = otherAttempts.filter((r) => r.member === current.member).sort(latestFirst);
  const teammates = otherAttempts.filter((r) => r.member !== current.member).sort(latestFirst);
  const renderAttempt = (r, isCurrent = false, isTeammate = false) => {
      const href = `/problem/${encodeURIComponent(r.member)}/${encodeURIComponent(r.date)}/${encodeURIComponent(r.problemId)}/`;
      const state = normalizeLearningState(r);
      const status = [
        state.masteryStatus !== "unknown" ? MASTERY_LABELS[state.masteryStatus] : "",
        state.reviewStatus !== "none" ? REVIEW_LABELS[state.reviewStatus] : "",
      ].filter(Boolean).map((label) => `<span class="related-state">${escapeHtml(label)}</span>`).join("");
      const title = isCurrent ? '<span class="related-current-label">本次记录</span>' : "";
      const blocker = String(r.blocker || "").trim();
      const takeaway = realTakeaway(r.takeaway);
      const snippet = (value) => value.length > 360 ? `${value.slice(0, 360)}…` : value;
      const thoughts = isCurrent
        ? `<div class="detail-prose attempt-thoughts">${takeaway ? renderMarkdown(takeaway) : '<p class="hint">这条记录尚未填写个人思考。</p>'}</div>`
        : isTeammate
          ? `<p class="related-takeaway">${takeaway ? escapeHtml(snippet(takeaway)) : "尚无心得记录"}</p>`
          : takeaway ? `<details class="related-reflection"><summary>展开当时的复盘${icon("down")}</summary><p class="related-takeaway">${escapeHtml(takeaway)}</p></details>` : '<p class="hint">尚无心得记录</p>';
      return `<li class="related-attempt${isCurrent ? " is-current" : ""}"><div class="related-attempt-heading"><span class="related-meta">${escapeHtml(r.member || "")} · ${escapeHtml(r.date || "")}</span>${title}${isCurrent ? updatedLabel(r) : `<a class="related-record-link" href="${escapeHtml(href)}">查看记录${icon("external")}</a>`}</div><div class="related-attempt-facts"><p class="related-outcome"><strong>完成结果：</strong>${escapeHtml(OUTCOME_LABELS[state.outcome] || "未记录")}${status}</p>${blocker ? `<p class="related-blocker"><strong>卡点：</strong>${escapeHtml(isCurrent ? blocker : snippet(blocker))}</p>` : ""}</div>${thoughts}</li>`;
  };
  const currentHtml = current.member ? `<ul class="related-list related-current">${renderAttempt({ ...current, problemId: currentId }, true)}</ul>` : `<div class="detail-prose">${realTakeaway(current.takeaway) ? renderMarkdown(realTakeaway(current.takeaway)) : '<p class="hint">这条记录尚未填写个人思考。</p>'}</div>`;
  const historyTitle = personal.some((r) => String(r.date || "") >= String(current.date || "")) ? "其他同题记录" : "此前的尝试";
  return `<section class="detail-panel related-section" id="problem-thoughts"><div id="problem-related">
      <h2>${icon("pen")}思考与重做</h2>
      ${current.member ? `<p class="related-hint">${escapeHtml(current.member)}的同题记录 · ${personal.length + 1} 条</p>` : ""}
      ${currentHtml}
      ${personal.length ? `<section class="related-history"><h3>${historyTitle}</h3><ul class="related-list">${personal.map((r) => renderAttempt(r)).join("")}</ul></section>` : ""}
      ${teammates.length ? `<section class="related-team" id="problem-team"><h3>队友同题 · ${new Set(teammates.map((r) => r.member)).size} 人<span class="related-team-count">${teammates.length} 条记录</span></h3><ul class="related-list">${teammates.map((r) => renderAttempt(r, false, true)).join("")}</ul></section>` : ""}
    </div></section>`;
}
