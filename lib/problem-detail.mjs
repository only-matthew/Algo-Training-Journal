import { escapeHtml, renderMarkdown } from "./render-safety.mjs";
import { PLATFORMS, formatUpdateDate, formatUpdateTime } from "./constants.mjs";
import { icon } from "./icons.mjs";
import { verseHtml } from "./detail-ui.mjs";

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
  sourceUrl ||= originalProblemUrl(log.platform, log.problemNumber, log.problem);
  memberHref ||= `/member/${encodeURIComponent(log.member || "")}/`;
  const updated = updatedLabel(log);
  const badges = [
    ...(log.tags || []).map((tag) => `<a class="tag-chip" href="/tags/${encodeURIComponent(tag)}/">${escapeHtml(tag)}</a>`),
    ...(log.reviewStatus === "todo" ? [`<span class="review-chip todo">待复习</span>`] : []),
    ...(log.reviewStatus === "mastered" ? [`<span class="review-chip mastered">已掌握</span>`] : []),
  ].join("");
  return `<header class="page-hero problem-hero"><div class="hero-art" aria-hidden="true"></div>
      <div class="hero-copy"><h1>${log.problemNumber && !String(log.problem).includes(log.problemNumber) ? `${escapeHtml(log.problemNumber)}　` : ""}${escapeHtml(log.problem)}</h1>
      <p class="problem-meta">来源：${escapeHtml(log.platform)} <span class="difficulty-badge medium">${escapeHtml(log.difficulty || "未标注")}</span></p>
      <div class="record-badges">${badges}</div></div>${verseHtml()}
      <div class="detail-hero-actions">${sourceUrl ? `<a class="btn btn-outline problem-source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${icon("external")}查看原题</a>` : ""}<a class="btn btn-primary" href="${escapeHtml(memberHref)}">${icon("user")}${escapeHtml(log.member)} 的主页</a></div>
    </header>
    <nav class="detail-tabs" aria-label="题目内容"><a class="active" href="#problem-description">${icon("file")}题目详情</a><a href="#problem-thoughts">${icon("pen")}个人思考</a><a href="#problem-code">${icon("code")}代码</a><a href="#problem-related">${icon("users")}队内记录</a><a href="#problem-tags">${icon("tag")}相关标签</a></nav>
    <div class="problem-layout"><div class="problem-main">
      <section class="detail-panel" id="problem-description"><h2>${icon("file")}题目描述</h2><div class="detail-prose">${log.description ? renderMarkdown(log.description) : '<p class="hint">这条记录尚未填写题目描述，可通过上方入口查看原题。</p>'}</div></section>
      ${relatedSectionHtml(log.related, log)}
      <section class="detail-panel" id="problem-thoughts"><h2>${icon("pen")}个人思考</h2><p class="thought-author"><a href="${escapeHtml(memberHref)}">${escapeHtml(log.member)}</a> · ${escapeHtml(log.date)} ${updated}</p><div class="detail-prose">${log.takeaway ? renderMarkdown(log.takeaway) : '<p class="hint">这条记录尚未填写个人思考。</p>'}</div></section>
      <section class="detail-panel" id="problem-code"><div class="section-heading"><h2>${icon("code")}代码</h2>${log.code ? '<button class="btn btn-outline btn-sm" type="button" data-copy-code>复制代码</button>' : ""}</div>${log.code ? `<div class="problem-code-expanded"><pre class="line-numbers"><code class="language-cpp">${escapeHtml(log.code)}</code></pre></div>` : '<p class="hint">这条记录尚未附上代码。</p>'}<span class="copy-feedback" role="status"></span></section>
    </div><aside class="problem-aside"><section class="detail-panel"><h2>${icon("file")}题目信息</h2><dl class="problem-facts"><dt>题目编号</dt><dd>${escapeHtml(log.problemNumber || "未填写")}</dd><dt>来源平台</dt><dd>${escapeHtml(log.platform)}</dd><dt>难度</dt><dd>${escapeHtml(log.difficulty || "未标注")}</dd><dt>记录成员</dt><dd><a href="${escapeHtml(memberHref)}">${escapeHtml(log.member)}</a></dd><dt>训练日期</dt><dd>${escapeHtml(log.date)}</dd><dt>复习状态</dt><dd>${log.reviewStatus === "todo" ? "待复习" : log.reviewStatus === "mastered" ? "已掌握" : "未加入复习"}</dd></dl></section>
    <section class="detail-panel" id="problem-tags"><h2>${icon("tag")}相关标签</h2><div class="record-badges">${badges || '<p class="hint">尚未添加标签。</p>'}</div></section>
    </aside></div>`;
}

// 全队同题记录（二刷关联）：构建期由 generate-data.js 聚合进单题 JSON 的 related 字段，
// 浏览器端渲染与构建期预渲染共用同一份结构。current 用于排除当前记录自身。
export function relatedSectionHtml(related = [], current = {}) {
  const currentId = String(current.problemId || current.problemIndex || 0);
  const list = (related || []).filter(
    (r) => !(r.member === current.member && r.date === current.date && String(r.problemId) === currentId),
  );
  if (!list.length) return `<section class="detail-panel related-section" id="problem-related"><h2>${icon("users")}队内记录</h2><p class="hint">暂时没有其他同题记录。</p></section>`;
  const items = list
    .map((r) => {
      const href = `/problem/${encodeURIComponent(r.member)}/${encodeURIComponent(r.date)}/${encodeURIComponent(r.problemId)}/`;
      const status = r.reviewStatus === "todo" ? " · 待复习" : r.reviewStatus === "mastered" ? " · 已掌握" : "";
      return `<li><a href="${escapeHtml(href)}">${escapeHtml(r.problem)}</a><span class="related-meta">${escapeHtml(r.member)} · ${escapeHtml(r.date)}${status}</span></li>`;
    })
    .join("");
  return `<section class="detail-panel related-section" id="problem-related">
      <h2>全队同题记录</h2>
      <p class="related-hint">该题在队伍里共被记录 ${list.length} 次：</p>
      <ul class="related-list">${items}</ul>
    </section>`;
}
