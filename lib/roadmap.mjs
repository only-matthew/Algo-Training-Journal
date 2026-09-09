// 路线图（Roadmap）共享 HTML 模板：浏览器端与构建端共用同一份结构。
// 仅依赖 Node 安全模块（render-safety / problem-detail），全部为纯函数、无 DOM 访问。
// 样式类名统一使用 roadmap- 前缀（tag-chip / review-chip 为既有共用类）。
import { escapeHtml } from "./render-safety.mjs";
import { originalProblemUrl } from "./problem-detail.mjs";
import { cfTagToChinese } from "./cf-tag-map.mjs";
import { icon } from "./icons.mjs";
import { detailHeroHtml, detailStatsHtml, recordPreviewHtml, recordHref, knowledgeCategories, categoriesForTopic } from "./detail-ui.mjs";

// 统计防御取数：member === "all" 用 stats 顶层字段，否则取该成员的统计。
// byMember 兼容两种形态：对象 { member: {...} } 或数组 [{ member, done, ... }]
// （生成端输出数组，见 scripts/curriculum.mjs computeStats）。
// 成员条目不含 totalProblems（分母与整体相同），从 stats 顶层字段回退。
function statsFor(stats, member) {
  if (member === "all") {
    if (!stats) return { done: 0, totalProblems: 0, pct: 0 };
    return {
      done: Number(stats.done) || 0,
      totalProblems: Number(stats.totalProblems) || 0,
      pct: Number(stats.pct) || 0,
    };
  }
  let s = stats && stats.byMember && stats.byMember[member];
  if (!s && Array.isArray(stats && stats.byMember)) {
    s = stats.byMember.find((m) => String(m && m.member) === String(member));
  }
  if (!s) {
    // 成员未完成任何题目：done 记为 0，但分母仍为整体题目数
    return { done: 0, totalProblems: Number(stats && stats.totalProblems) || 0, pct: 0 };
  }
  return {
    done: Number(s.done) || 0,
    totalProblems: Number(stats.totalProblems) || Number(s.totalProblems) || 0,
    pct: Number(s.pct) || 0,
  };
}

// 1. 进度条：stats 形如 { done, totalProblems, pct }
export function progressBarHtml(stats) {
  const { done, totalProblems, pct } = statsFor(stats, "all");
  if (totalProblems === 0) {
    return `<div class="roadmap-progress"><span class="roadmap-progress-text">暂无题目</span></div>`;
  }
  const width = Math.max(0, Math.min(100, pct));
  return `<div class="roadmap-progress"><div class="roadmap-progress-bar" style="width:${width}%"></div><span class="roadmap-progress-text">已做 ${done}/${totalProblems}（${pct}%）</span></div>`;
}

// 2. 难度徽标：n 为 1-10 整数
export function difficultyBadgeHtml(difficulty) {
  const n = Math.max(1, Math.min(10, Math.round(Number(difficulty) || 1)));
  return `<span class="roadmap-difficulty" data-difficulty="${n}">难度 ${n}</span>`;
}

function difficultyRangeHtml(difficulty) {
  const diff = difficulty || [];
  const low = diff[0] != null ? diff[0] : "";
  const high = diff[1] != null ? diff[1] : "";
  if (low === "" && high === "") return "";
  return `<p class="roadmap-difficulty-range">难度 ${escapeHtml(String(low))}-${escapeHtml(String(high))}</p>`;
}

function prerequisiteTitlesHtml(prerequisites) {
  const titles = (prerequisites || [])
    .map((p) => (p && typeof p === "object" ? p.title : p))
    .filter((t) => t != null && String(t).trim() !== "")
    .map((t) => escapeHtml(String(t)))
    .join("、");
  return titles ? `<p class="roadmap-pre">前置：${titles}</p>` : "";
}

function wikiLinkHtml(wiki) {
  if (!wiki) return "";
  return `<a class="roadmap-wiki-link" href="${escapeHtml(String(wiki))}" target="_blank" rel="noopener noreferrer">维基 ↗</a>`;
}

// 可点击标签芯片（链接到 /tags/<标签>/）。extraClass 追加到 class（如 roadmap-tag）。
function tagChipLinkHtml(tag, extraClass = "") {
  const label = String(tag == null ? "" : tag);
  const cls = extraClass ? `tag-chip ${extraClass}` : "tag-chip";
  return `<a class="${cls}" href="/tags/${encodeURIComponent(label)}/">${escapeHtml(label)}</a>`;
}

// tagHits 徽标：node.tagHits 为 >0 的数字时追加「相关记录 N」信息徽标（纯展示，非链接），
// 字段缺失或非正数时不输出。
function tagHitsBadgeHtml(node) {
  const hits = Number(node && node.tagHits);
  return Number.isFinite(hits) && hits > 0 ? `<span class="tag-chip tag-hits">📎 相关记录 ${hits}</span>` : "";
}

// 训练证据来自题单内匹配与题单外标签关联。它与题单完成率并列展示，避免把“未做题单”误读为“未学习”。
function trainingEvidenceFor(node, member) {
  const evidence = (node && node.trainingEvidence) || {};
  if (member === "all") return evidence;
  const own = (evidence.byMember || []).find((entry) => String(entry.member) === String(member));
  return own || { totalRecords: 0, relatedRecords: 0, state: "未接触", confidence: "无" };
}

function trainingEvidenceBadgeHtml(node, member) {
  const evidence = trainingEvidenceFor(node, member);
  const total = Number(evidence.totalRecords) || 0;
  const state = String(evidence.state || (total ? "已接触" : "未接触"));
  return `<span class="tag-chip roadmap-evidence" data-state="${escapeHtml(state)}">🧭 ${escapeHtml(state)} · 训练 ${total}</span>`;
}

function trainingEvidenceSectionHtml(node, member) {
  const evidence = trainingEvidenceFor(node, member);
  const total = Number(evidence.totalRecords) || 0;
  const related = Number(evidence.relatedRecords) || 0;
  const state = String(evidence.state || (total ? "已接触" : "未接触"));
  const confidence = String(evidence.confidence || (total ? "低" : "无"));
  const reason = evidence.reason != null ? String(evidence.reason) : "";
  const action = evidence.action != null ? String(evidence.action) : "";
  return `<section class="roadmap-evidence-section" data-state="${escapeHtml(state)}">
    <h3>🧭 训练证据</h3>
    <p><strong>当前判断：${escapeHtml(state)}</strong>（${escapeHtml(confidence)}置信度）</p>
    ${reason ? `<p>判断依据：${escapeHtml(reason)}</p>` : ""}
    ${action ? `<p>建议动作：${escapeHtml(action)}</p>` : ""}
    <p class="related-hint">共 ${total} 条相关训练记录，其中 ${related} 条来自题单外的标签匹配。题单进度与训练证据分别统计，不将题单未完成视为未学习。</p>
  </section>`;
}

function tagsHtml(tags) {
  const chips = (tags || []).map((t) => tagChipLinkHtml(t)).join("");
  return chips ? `<div class="roadmap-tags">${chips}</div>` : "";
}

// NOI 级别 / 蓝桥杯组别徽标（合并进知识树的标注）
function syllabusBadgesHtml(noiLevels, lanqiao) {
  const noi = (noiLevels || [])
    .map((l) => `<span class="roadmap-level-chip noi">NOI·${escapeHtml(String(l))}</span>`)
    .join("");
  const lq = (lanqiao || [])
    .map((g) => `<span class="roadmap-level-chip lanqiao">蓝桥杯·${escapeHtml(String(g).replace("大学", ""))}</span>`)
    .join("");
  if (!noi && !lq) return "";
  return `<div class="roadmap-syllabus-badges">${noi}${lq}</div>`;
}

// 大纲/考点算法标签清单（NOI 大纲覆盖 / 蓝桥杯考点覆盖）
function syllabusLabelSectionHtml(title, labels) {
  if (!labels || !labels.length) return "";
  const chips = labels
    .map((l) => `<span class="tag-chip roadmap-syllabus-label">${escapeHtml(String(l))}</span>`)
    .join("");
  return `<div class="roadmap-syllabus-section"><h3>${escapeHtml(String(title))}</h3><div class="roadmap-syllabus-labels">${chips}</div></div>`;
}

// 知识地图分组：按主题组织，用于定位而非要求按顺序完成。
export function roadmapPhaseCardHtml(phase) {
  const nodes = phase.nodes || [];
  const preview = nodes.slice(0, 5).map((node) =>
    `<li><a href="/roadmap/${encodeURIComponent(phase.id)}/${encodeURIComponent(node.id)}/">${escapeHtml(String(node.title || ""))}</a></li>`,
  ).join("");
  const remaining = nodes.length > 5 ? `<span class="roadmap-topic-more">还有 ${nodes.length - 5} 个主题</span>` : "";
  return `<article class="roadmap-phase-card">
    <h3 class="roadmap-phase-title"><a href="/roadmap/${encodeURIComponent(phase.id)}/">${escapeHtml(String(phase.title || ""))}</a></h3>
    ${phase.subtitle ? `<p class="roadmap-phase-subtitle">${escapeHtml(String(phase.subtitle))}</p>` : ""}
    <ul class="roadmap-topic-preview">${preview}</ul>
    <a class="roadmap-topic-link" href="/roadmap/${encodeURIComponent(phase.id)}/">查看 ${nodes.length} 个主题</a>${remaining}
  </article>`;
}

// 分组内的知识点入口：只保留识别与关联信息，资料放进详情页。
export function roadmapNodeCardHtml(node, phaseId) {
  return `<article class="card roadmap-node-card">
    <h4 class="roadmap-node-title"><a href="/roadmap/${encodeURIComponent(phaseId)}/${encodeURIComponent(node.id)}/">${escapeHtml(String(node.title || ""))}</a></h4>
    ${difficultyBadgeHtml(node.difficulty)}
    ${tagsHtml(node.tags)}
    ${prerequisiteTitlesHtml(node.prerequisites)}
  </article>`;
}

// 5. 知识树：每阶段一个 <details>，列出该阶段全部节点的简行
export function roadmapTreeHtml(roadmapData, member) {
  const phases = (roadmapData && roadmapData.phases) || [];
  const blocks = phases.map((phase) => {
    const stats = statsFor(phase.stats, member);
    const rows = (phase.nodes || [])
      .map((node) => {
        const nodeStats = statsFor(node.stats, member);
        return `<li class="roadmap-tree-node">
          <a href="/roadmap/${encodeURIComponent(phase.id)}/${encodeURIComponent(node.id)}/">${escapeHtml(String(node.title || ""))}</a>
          ${difficultyBadgeHtml(node.difficulty)}
          <span class="roadmap-tree-pct">${nodeStats.pct}%</span>
          ${trainingEvidenceBadgeHtml(node, member)}
          ${tagHitsBadgeHtml(node)}
        </li>`;
      })
      .join("");
    return `<details class="roadmap-tree-phase">
      <summary>${escapeHtml(String(phase.title || ""))}（完成 ${stats.pct}%）</summary>
      <ul class="roadmap-tree-list">${rows}</ul>
    </details>`;
  });
  return `<div class="roadmap-tree">${blocks.join("")}</div>`;
}

// 6. 总览视图
export function roadmapOverviewHtml(roadmapData, member) {
  const phases = (roadmapData && roadmapData.phases) || [];
  const topics = phases.flatMap((phase) => (phase.nodes || []).map((node) => ({ ...node, phaseId: phase.id }))).sort((a, b) => String(a.title).localeCompare(String(b.title), "zh-CN"));
  const iconFor = (title) => /DP|动态规划/i.test(title) ? "grid" : /图|树|网络/i.test(title) ? "graph" : /字符串|文本/i.test(title) ? "text" : /数学|数论/i.test(title) ? "math" : /排序/i.test(title) ? "sort" : /贪心/i.test(title) ? "leaf" : /数据结构|数组|栈|队列/i.test(title) ? "database" : /搜索|二分/i.test(title) ? "search" : "code";
  const cardHtml = topics.map((node) => {
    const stats = statsFor(node.stats, member);
    const records = Number(trainingEvidenceFor(node, member).totalRecords) || 0;
    const href = `/roadmap/${encodeURIComponent(node.phaseId)}/${encodeURIComponent(node.id)}/`;
    return `<article class="knowledge-topic-card" data-topic="${escapeHtml([node.title || "", ...(node.tags || [])].join(" "))}" data-title="${escapeHtml(node.title || "")}" data-categories="${categoriesForTopic(node).join(" ")}" data-count="${stats.totalProblems}">
      <div class="knowledge-topic-head"><span class="knowledge-icon">${icon(iconFor(String(node.title || "")))}</span><div><h2><a href="${href}">${escapeHtml(String(node.title || ""))}</a></h2><p>${escapeHtml(String(node.description || "查看相关知识、参考资料和训练记录。"))}</p></div></div>
      ${tagsHtml((node.tags || []).slice(0, 4))}
      <div class="knowledge-topic-stats"><span>${icon("file")}<b>${stats.totalProblems}</b><small>相关题目</small></span><span>${icon("users")}<b>${records}</b><small>队内记录</small></span><a href="${href}" aria-label="查看${escapeHtml(String(node.title || ""))}">${icon("right")}</a></div>
    </article>`;
  }).join("");
  const nav = knowledgeCategories.map(category => `<button type="button" data-knowledge-category="${category.id}" aria-pressed="${category.id === "all"}" class="${category.id === "all" ? "active" : ""}">${icon(category.icon)}${category.title}</button>`).join("");
  return `<div class="knowledge-toolbar"><label class="search-control">${icon("search")}<input id="knowledge-search" type="search" aria-label="搜索知识主题" placeholder="搜索知识主题（如：DP、最短路、KMP…）" /></label><label>排序：<select id="knowledge-sort"><option value="name">按名称 A-Z</option><option value="count">按相关题目</option></select></label></div>
    <div class="roadmap-layout"><nav class="topic-nav" aria-label="知识主题分类">${nav}</nav><div><p id="knowledge-results" class="hint" role="status">共 ${topics.length} 个知识主题</p><div class="knowledge-topic-grid">${cardHtml}</div><p id="knowledge-empty" class="detail-empty" hidden>没有符合条件的知识主题，请更换分类或搜索词。</p></div></div>`;
}

// 7. 阶段视图
export function roadmapPhaseHtml(roadmapData, phaseId, member) {
  const phase = ((roadmapData && roadmapData.phases) || []).find((p) => String(p.id) === String(phaseId));
  if (!phase) return `<p class="hint">未找到该阶段。</p>`;
  const nodes = phase.nodes || [];
  const cards = nodes.map((node) => roadmapNodeCardHtml(node, phase.id)).join("");
  return `<div class="roadmap-phase">
    <div class="roadmap-phase-head">
      <h2>${escapeHtml(String(phase.title || ""))}</h2>
      ${phase.subtitle ? `<p class="roadmap-phase-subtitle">${escapeHtml(String(phase.subtitle))}</p>` : ""}
      ${phase.reference ? `<p class="roadmap-phase-ref">${escapeHtml(String(phase.reference))}</p>` : ""}
    </div>
    <div class="roadmap-node-grid">${cards}</div>
  </div>`;
}

// 8. 题目卡片（节点题单 = 响应式卡片网格，一题一卡）
// 洛谷官方难度标签 → 展示色阶（洛谷帮助中心《题目难度体系》当前 8 级：入门/普及-/普及/普及+/提高-/提高/提高+/省选-/省选/NOI-/NOI/NOI+/CTS）
const LUOGU_DIFFICULTY_LEVELS = {
  "暂无评定": 0,
  "入门": 1,
  "普及-": 2,
  "普及": 3,
  "普及+/提高-": 4,
  "提高": 5,
  "提高+/省选-": 6,
  "省选/NOI-": 7,
  "NOI/NOI+/CTS": 8,
};

export function roadmapProblemCardHtml(problem) {
  const numberText = escapeHtml(String(problem.number != null ? problem.number : ""));
  const platformText = escapeHtml(String(problem.platform || ""));
  const url = originalProblemUrl(problem.platform, problem.number, problem.name);
  const numberPart = url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${platformText} ${numberText}</a>`
    : `${platformText} ${numberText}`;
  const nameRaw = problem.name
    ? String(problem.name)
    : (String(problem.number != null ? problem.number : "") ||
       String(problem.problemId != null ? problem.problemId : ""));
  const sourceBadge = problem.source ? `<span class="tag-chip roadmap-source">${escapeHtml(String(problem.source))}</span>` : "";
  const rating = problem.rating != null ? `<span class="roadmap-problem-rating">★ ${escapeHtml(String(problem.rating))}</span>` : "";
  const difficulty = problem.difficulty
    ? `<span class="roadmap-luogu-difficulty" data-level="${LUOGU_DIFFICULTY_LEVELS[problem.difficulty] ?? ""}">${escapeHtml(String(problem.difficulty))}</span>`
    : "";
  const tagChips = (problem.tags || []).length
    ? `<span class="roadmap-problem-tags">${problem.tags.map((t) => tagChipLinkHtml(cfTagToChinese(t), "roadmap-tag")).join("")}</span>`
    : "";
  const role = problem.role ? `<span class="roadmap-role">${escapeHtml(String(problem.role))}</span>` : "";
  const note = problem.note ? `<span class="roadmap-note">${escapeHtml(String(problem.note))}</span>` : "";
  const doneItems = (problem.doneBy || [])
    .map((d) => {
      const chip =
        d.reviewStatus === "todo"
          ? `<span class="review-chip todo">待复习</span>`
          : d.reviewStatus === "mastered"
            ? `<span class="review-chip mastered">已掌握</span>`
            : "";
      return `<li class="roadmap-done-item"><a href="/problem/${encodeURIComponent(d.member)}/${encodeURIComponent(d.date)}/${encodeURIComponent(d.problemId)}/">${escapeHtml(String(d.member || ""))}</a>${chip}</li>`;
    })
    .join("");
  const nameLink = url
    ? `<a class="roadmap-problem-name-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(nameRaw)}</a>`
    : escapeHtml(nameRaw);
  return `<div class="roadmap-problem-card" data-problem-name="${escapeHtml([problem.number, nameRaw, ...(problem.tags || [])].join(" "))}" data-problem-difficulty="${escapeHtml(problem.difficulty || "未标注")}" data-record-count="${(problem.doneBy || []).length}">
    <div class="roadmap-problem-card-head">
      <p class="roadmap-problem-number">${numberPart}</p>
      ${difficulty}
    </div>
    <p class="roadmap-problem-name">${nameLink}</p>
    <div class="roadmap-problem-meta">${sourceBadge}${rating}${tagChips}${role}${note}</div>
    <div class="roadmap-problem-done">
      ${doneItems ? `<span class="roadmap-recorded-label">队内记录</span><ul class="roadmap-done-list">${doneItems}</ul>` : `<span class="roadmap-undone">暂未有队内记录</span>`}
    </div>
  </div>`;
}

// 9. 节点视图
export function roadmapNodeHtml(nodeData, member) {
  const node = (nodeData && nodeData.node) || {};
  const problems = (nodeData && nodeData.problems) || [];
  const cards = problems.map((problem) => roadmapProblemCardHtml(problem)).join("");
  const recordMap = new Map();
  for (const problem of problems) for (const record of problem.doneBy || []) {
    const merged = { ...record, problem: problem.name || problem.number, problemNumber: problem.number, platform: problem.platform, difficulty: problem.difficulty };
    recordMap.set(recordHref(merged), merged);
  }
  for (const record of node.relatedRecords || []) recordMap.set(recordHref(record), record);
  const records = [...recordMap.values()].sort((a,b) => String(b.date).localeCompare(String(a.date)));
  const members = new Set(records.map(record => record.member));
  const difficulties = [...new Set(problems.map(problem => problem.difficulty || "未标注"))];
  return `<div class="roadmap-node detail-view">
    ${detailHeroHtml({ title: node.title || "知识点", description: node.description || "浏览本主题的参考资料、相关题目与队内训练记录。", symbol: "graph", tags: tagsHtml(node.tags), verse: /二分/.test(node.title) ? ["二分求解路", "步步见真章"] : ["算法如山", "行则将至"], actions: '<a class="btn btn-primary" href="#node-problems">'+icon("pen")+'开始练习本主题</a><button class="btn btn-outline" type="button" data-share-page>'+icon("share")+'分享</button><span class="share-feedback" role="status"></span>' })}
    ${detailStatsHtml([["file", "相关题目", problems.length, "#node-problems"], ["users", "相关成员", members.size, "#node-records"], ["chart", "队内记录", records.length, "#node-records"]])}
    <section class="detail-section" id="node-records"><div class="section-heading"><h2>${icon("clock")}队内训练记录</h2><span class="hint">共 ${records.length} 条</span></div><div class="detail-record-grid">${records.slice(0,3).map(recordPreviewHtml).join("") || '<p class="hint">本主题暂时没有队内训练记录。</p>'}</div>${records.length > 3 ? `<details class="more-records"><summary>查看其余 ${records.length - 3} 条记录</summary><div class="detail-record-grid">${records.slice(3).map(recordPreviewHtml).join("")}</div></details>` : ""}</section>
    <section class="detail-panel node-resources"><h2>${icon("book")}参考资料</h2>${wikiLinkHtml(node.wiki)}${node.ref ? `<p>${escapeHtml(node.ref)}</p>` : '<p class="hint">暂未补充参考书目。</p>'}</section>
    <section class="detail-section" id="node-problems"><div class="section-heading"><div><h2>${icon("book")}相关题目</h2><p class="hint">本主题的参考题，结合自己的进度选择练习。</p></div><div class="node-filters"><label class="sr-only" for="node-sort">题目排序</label><select id="node-sort"><option value="default">按题单顺序</option><option value="records">按队内记录数</option><option value="name">按题号排序</option></select><label class="sr-only" for="node-difficulty">题目难度</label><select id="node-difficulty"><option value="all">全部难度</option>${difficulties.map(d => `<option>${escapeHtml(d)}</option>`).join("")}</select><label class="search-control">${icon("search")}<input id="node-search" type="search" aria-label="搜索本主题题目" placeholder="搜索本主题下的题目…" /></label></div></div><p id="node-result-count" class="hint" role="status">共 ${problems.length} 道题目</p><div class="roadmap-problem-list">${cards}</div><p id="node-empty" class="detail-empty" ${problems.length ? "hidden" : ""}>没有符合条件的题目。</p></section>
  </div>`;
}

// 相关训练记录行（节点相关区块 / 标签页「训练记录」区块共用）。
// record 形如 { member, date, problemId, problem, problemNumber, platform, difficulty, tags, reviewStatus }。
function relatedRecordRowHtml(record) {
  const member = String(record.member ?? "");
  const date = String(record.date ?? "");
  const problemId = String(record.problemId ?? "");
  const href = `/problem/${encodeURIComponent(member)}/${encodeURIComponent(date)}/${encodeURIComponent(problemId)}/`;
  const problemText = String(record.problem ?? record.problemNumber ?? "");
  const chips = (record.tags || [])
    .map((t) => tagChipLinkHtml(t, "roadmap-tag"))
    .join("");
  return `<li>
    <a href="${escapeHtml(href)}">${escapeHtml(problemText)}</a>
    <span class="related-meta">${escapeHtml(member)} · ${escapeHtml(date)} · ${escapeHtml(String(record.platform ?? ""))} · ${escapeHtml(String(record.difficulty ?? ""))}</span>
    ${chips ? `<span class="roadmap-problem-tags">${chips}</span>` : ""}
  </li>`;
}

// 节点「题单外相关训练记录」区块：nodeData.node.relatedRecords 缺失 / 为空时不输出。
function relatedRecordsSectionHtml(nodeData) {
  const related = (nodeData && nodeData.node && nodeData.node.relatedRecords) || [];
  if (!related.length) return "";
  const items = related.map(relatedRecordRowHtml).join("");
  return `<section class="roadmap-related-section">
    <h2>相关训练记录</h2>
    <p class="related-hint">队员日志中带该节点标签、但不在本节点题单内的题；最多展示最近 50 条。</p>
    <ul class="related-list">${items}</ul>
  </section>`;
}

// 10. 标签页内容区（/tags/<tag>/），不含页面壳。
// entry = { tag, recordCount, records, nodes }
// records 元素形状同 relatedRecordRowHtml 的 record；nodes = [{ phaseId, phaseTitle, nodeId,
// nodeTitle, difficulty, nodeTags, done, total, pct }]。纯函数，构建端与浏览器端共用。
export function tagPageHtml(entry) {
  const tag = String(entry && entry.tag != null ? entry.tag : "");
  const records = [...((entry && entry.records) || [])].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")),
  );
  const nodes = (entry && entry.nodes) || [];
  const recordCount = Number.isFinite(Number(entry && entry.recordCount))
    ? Number(entry.recordCount)
    : records.length;

  const problemMap = new Map();
  for (const record of records) {
    const key = record.problemNumber ? `${record.platform}:${record.problemNumber}` : recordHref(record);
    if (!problemMap.has(key)) problemMap.set(key, record);
  }
  const uniqueProblems = [...problemMap.values()];
  const members = [...new Set(records.map(record => record.member))];
  const relatedTags = [...new Set(records.flatMap(record => record.tags || []).concat(nodes.flatMap(node => node.nodeTags || [])))].filter(t => t !== tag).slice(0,8);
  const description = tag === "二分" ? "二分是一种高效的查找与判定思想，通过不断缩小范围来定位答案。除了在有序数组中查找，还常用于答案二分，解决最优化与判定问题。" : `浏览「${tag}」相关的训练记录与知识主题，回顾解题思路，发现可以继续练习的题目。`;
  const tabs = [["all", "相关内容"], ["problems", "题目"], ["records", "训练记录"], ["topics", "知识主题"], ["members", "成员"]];
  return `<div class="tag-detail detail-view">
    ${detailHeroHtml({ title: tag, description, symbol: "tag", tags: relatedTags.length ? `<div class="detail-related-tags"><strong>相关标签</strong>${tagsHtml(relatedTags)}</div>` : "", verse: tag === "二分" ? ["在二分中寻找答案", "让复杂的问题变简单"] : ["算法如山", "行则将至"] })}
    ${detailStatsHtml([["file", "关联训练记录", recordCount, "#tag-records"], ["book", "知识主题", nodes.length, "#tag-topics"], ["grid", "相关题目示例", uniqueProblems.length, "#tag-problems"]])}
    <nav class="detail-tabs" aria-label="标签内容筛选">${tabs.map(([id,label]) => `<button type="button" data-tag-section="${id}" class="${id === "all" ? "active" : ""}" aria-pressed="${id === "all"}">${label}</button>`).join("")}</nav>
    <section class="detail-panel" id="tag-problems" data-tag-panel="problems"><div class="section-heading"><h2>${icon("file")}相关题目示例</h2><span class="hint">${uniqueProblems.length} 道</span></div><div class="tag-example-grid">${uniqueProblems.slice(0,4).map(recordPreviewHtml).join("") || '<p class="hint">暂无关联题目记录。</p>'}</div>${uniqueProblems.length > 4 ? `<details class="more-records"><summary>查看全部题目</summary><div class="tag-example-grid">${uniqueProblems.slice(4).map(recordPreviewHtml).join("")}</div></details>` : ""}</section>
    <section class="detail-panel" id="tag-records" data-tag-panel="records"><div class="section-heading"><h2>${icon("clock")}训练记录 <small>（共 ${recordCount} 条训练记录）</small></h2><a href="/?tag=${encodeURIComponent(tag)}">筛选此标签 ${icon("arrow")}</a></div>${records.length ? `<div class="detail-table-scroll"><table class="detail-table"><thead><tr><th>#</th><th>题目</th><th>训练日期</th><th>成员</th><th>复习状态</th><th>标签</th><th>平台</th></tr></thead><tbody>${records.map((record,i) => `<tr><td>${i+1}</td><td><a href="${recordHref(record)}">${escapeHtml(record.problemNumber || "")} ${escapeHtml(record.problem || "")}</a></td><td>${escapeHtml(record.date)}</td><td><a href="/member/${encodeURIComponent(record.member)}/">${escapeHtml(record.member)}</a></td><td>${record.reviewStatus === "todo" ? '<span class="review-chip todo">待复习</span>' : record.reviewStatus === "mastered" ? '<span class="review-chip mastered">已掌握</span>' : '未加入复习'}</td><td>${tagsHtml(record.tags)}</td><td>${escapeHtml(record.platform)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="hint">暂无关联训练记录。</p>'}</section>
    <section class="detail-panel" id="tag-topics" data-tag-panel="topics"><h2>${icon("book")}相关知识主题</h2><div class="tag-example-grid">${nodes.map(node => `<a class="detail-topic-link" href="/roadmap/${encodeURIComponent(node.phaseId)}/${encodeURIComponent(node.nodeId)}/">${icon("file")}<span><strong>${escapeHtml(node.nodeTitle)}</strong><small>${escapeHtml(node.phaseTitle)}</small></span>${icon("right")}</a>`).join("") || '<p class="hint">暂无关联知识主题。</p>'}</div></section>
    <section class="detail-panel" id="tag-members" data-tag-panel="members"><h2>${icon("users")}相关成员</h2><div class="tag-member-grid">${members.map(member => `<a class="detail-member-link" href="/member/${encodeURIComponent(member)}/"><span class="member-initial">${escapeHtml(Array.from(member)[0])}</span><span>${escapeHtml(member)}<small>${records.filter(record => record.member === member).length} 条记录</small></span></a>`).join("") || '<p class="hint">暂无参与记录。</p>'}</div></section>
  </div>`;
}

// 11. 标签索引页内容区（/tags/），不含页面壳。
// tagIndex = { tags: [entry...] }，entry 形状同 tagPageHtml。
export function tagIndexHtml(tagIndex) {
  const tags = (tagIndex && tagIndex.tags) || [];
  const cards = tags
    .map((entry) => {
      const tag = String(entry && entry.tag != null ? entry.tag : "");
      const recordCount = Number.isFinite(Number(entry && entry.recordCount))
        ? Number(entry.recordCount)
        : ((entry && entry.records) || []).length;
      const nodeCount = ((entry && entry.nodes) || []).length;
      return `<a class="tag-index-card" data-tag-name="${escapeHtml(tag)}" href="/tags/${encodeURIComponent(tag)}/"><strong>${icon("tag")}${escapeHtml(tag)}</strong><span class="tag-index-meta">${recordCount} 条记录 · ${nodeCount} 个知识主题</span></a>`;
    })
    .join("");
  return `<p id="tag-filter-status" class="hint" role="status" aria-live="polite" hidden></p><div class="tag-index-grid">${cards}</div><p id="tag-filter-empty" class="detail-empty"${tags.length ? " hidden" : ""}>没有匹配的标签，请尝试其他分类或关键词。</p>`;
}
