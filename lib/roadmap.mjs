// 路线图（Roadmap）共享 HTML 模板：浏览器端与构建端共用同一份结构。
// 仅依赖 Node 安全模块（render-safety / problem-detail），全部为纯函数、无 DOM 访问。
// 样式类名统一使用 roadmap- 前缀（tag-chip / review-chip 为既有共用类）。
import { escapeHtml } from "./render-safety.mjs";
import { originalProblemUrl } from "./problem-detail.mjs";
import { cfTagToChinese } from "./cf-tag-map.mjs";

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
  return own || { totalRecords: 0, relatedRecords: 0, coverage: "未接触", confidence: "无" };
}

function trainingEvidenceBadgeHtml(node, member) {
  const evidence = trainingEvidenceFor(node, member);
  const total = Number(evidence.totalRecords) || 0;
  const coverage = String(evidence.coverage || (total ? "已接触" : "未接触"));
  return `<span class="tag-chip roadmap-evidence" data-coverage="${escapeHtml(coverage)}">🧭 ${escapeHtml(coverage)} · 训练 ${total}</span>`;
}

function trainingEvidenceSectionHtml(node, member) {
  const evidence = trainingEvidenceFor(node, member);
  const total = Number(evidence.totalRecords) || 0;
  const related = Number(evidence.relatedRecords) || 0;
  const coverage = String(evidence.coverage || (total ? "已接触" : "未接触"));
  const confidence = String(evidence.confidence || (total ? "低" : "无"));
  return `<section class="roadmap-evidence-section">
    <h3>🧭 训练证据</h3>
    <p><strong>当前判断：${escapeHtml(coverage)}</strong>（${escapeHtml(confidence)}置信度）</p>
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

// 3. 阶段卡片（网格卡片：标题 + 元信息行 + 目标/里程碑/参考 + 进度条）
export function roadmapPhaseCardHtml(phase, member) {
  const stats = statsFor(phase.stats, member);
  const nodes = phase.nodes || [];
  const difficulty = difficultyRangeHtml(phase.difficulty);
  return `<article class="card roadmap-phase-card">
    <h3 class="roadmap-phase-title"><a href="/roadmap/${encodeURIComponent(phase.id)}/">${escapeHtml(String(phase.title || ""))}</a></h3>
    ${difficulty || nodes.length ? `<div class="roadmap-phase-meta">${difficulty}<span class="roadmap-phase-count">${nodes.length} 个节点</span></div>` : ""}
    ${phase.goal ? `<p class="roadmap-phase-goal">${escapeHtml(String(phase.goal))}</p>` : ""}
    ${phase.milestone ? `<p class="roadmap-phase-milestone">里程碑：${escapeHtml(String(phase.milestone))}</p>` : ""}
    ${phase.reference ? `<p class="roadmap-phase-ref">${escapeHtml(String(phase.reference))}</p>` : ""}
    ${progressBarHtml(stats)}
  </article>`;
}

// 4. 节点卡片
export function roadmapNodeCardHtml(node, phaseId, member) {
  const stats = statsFor(node.stats, member);
  return `<article class="card roadmap-node-card">
    <h4 class="roadmap-node-title"><a href="/roadmap/${encodeURIComponent(phaseId)}/${encodeURIComponent(node.id)}/">${escapeHtml(String(node.title || ""))}</a></h4>
    ${node.listId ? `<span class="roadmap-list-id">${escapeHtml(String(node.listId))}</span>` : ""}
    ${difficultyBadgeHtml(node.difficulty)}
    ${syllabusBadgesHtml(node.noiLevels, node.lanqiao)}
    ${tagsHtml(node.tags)}
    ${prerequisiteTitlesHtml(node.prerequisites)}
    ${wikiLinkHtml(node.wiki)}
    ${node.ref ? `<p class="roadmap-node-ref">${escapeHtml(String(node.ref))}</p>` : ""}
    ${progressBarHtml(stats)}
    ${trainingEvidenceBadgeHtml(node, member)}
    ${tagHitsBadgeHtml(node)}
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
  const stats = statsFor(roadmapData && roadmapData.stats, member);
  const phases = (roadmapData && roadmapData.phases) || [];
  const cards = phases.map((phase) => roadmapPhaseCardHtml(phase, member)).join("");
  return `<div class="roadmap-summary">
    <div class="card roadmap-summary-card"><span class="roadmap-summary-num">${stats.totalProblems}</span><span class="roadmap-summary-label">总题目数</span></div>
    <div class="card roadmap-summary-card"><span class="roadmap-summary-num">${stats.done}</span><span class="roadmap-summary-label">已完成</span></div>
    <div class="card roadmap-summary-card"><span class="roadmap-summary-num">${stats.pct}%</span><span class="roadmap-summary-label">整体进度</span></div>
  </div>
  <div class="roadmap-phase-list">${cards}</div>
  <h2>知识树</h2>
  ${roadmapTreeHtml(roadmapData, member)}`;
}

// 7. 阶段视图
export function roadmapPhaseHtml(roadmapData, phaseId, member) {
  const phase = ((roadmapData && roadmapData.phases) || []).find((p) => String(p.id) === String(phaseId));
  if (!phase) return `<p class="hint">未找到该阶段。</p>`;
  const stats = statsFor(phase.stats, member);
  const nodes = phase.nodes || [];
  const cards = nodes.map((node) => roadmapNodeCardHtml(node, phase.id, member)).join("");
  return `<div class="roadmap-phase">
    <div class="roadmap-phase-head">
      <h2>${escapeHtml(String(phase.title || ""))}</h2>
      ${phase.subtitle ? `<p class="roadmap-phase-subtitle">${escapeHtml(String(phase.subtitle))}</p>` : ""}
      ${difficultyRangeHtml(phase.difficulty)}
      ${phase.goal ? `<p class="roadmap-phase-goal">${escapeHtml(String(phase.goal))}</p>` : ""}
      ${phase.milestone ? `<p class="roadmap-phase-milestone">里程碑：${escapeHtml(String(phase.milestone))}</p>` : ""}
      ${phase.reference ? `<p class="roadmap-phase-ref">${escapeHtml(String(phase.reference))}</p>` : ""}
      ${progressBarHtml(stats)}
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
  return `<div class="roadmap-problem-card">
    <div class="roadmap-problem-card-head">
      <p class="roadmap-problem-number">${numberPart}</p>
      ${difficulty}
    </div>
    <p class="roadmap-problem-name">${nameLink}</p>
    <div class="roadmap-problem-meta">${sourceBadge}${rating}${tagChips}${role}${note}</div>
    <div class="roadmap-problem-done">
      ${doneItems ? `<ul class="roadmap-done-list">${doneItems}</ul>` : `<span class="roadmap-undone">尚未完成</span>`}
    </div>
  </div>`;
}

// 9. 节点视图
export function roadmapNodeHtml(nodeData, member) {
  const node = (nodeData && nodeData.node) || {};
  const stats = statsFor(nodeData && nodeData.stats, member);
  const problems = (nodeData && nodeData.problems) || [];
  const cards = problems.map((problem) => roadmapProblemCardHtml(problem)).join("");
  return `<div class="roadmap-node">
    <div class="roadmap-node-head">
      <h2>${escapeHtml(String(node.title || ""))}</h2>
      ${node.listId ? `<span class="roadmap-list-id">${escapeHtml(String(node.listId))}</span>` : ""}
      ${node.group ? `<span class="roadmap-node-group">${escapeHtml(String(node.group))}</span>` : ""}
      ${difficultyBadgeHtml(node.difficulty)}
    </div>
    ${node.description ? `<p class="roadmap-node-desc">${escapeHtml(String(node.description))}</p>` : ""}
    ${prerequisiteTitlesHtml(node.prerequisites)}
    ${syllabusBadgesHtml(node.noiLevels, node.lanqiao)}
    ${wikiLinkHtml(node.wiki)}
    ${node.ref ? `<p class="roadmap-node-ref">${escapeHtml(String(node.ref))}</p>` : ""}
    ${(node.oiTree && node.oiTree.length) ? `<div class="roadmap-oi-tree"><h3>📖 OI 知识树覆盖</h3><ul>${node.oiTree.map((t) => `<li>${escapeHtml(String(t))}</li>`).join("")}</ul></div>` : ""}
    ${tagsHtml(node.tags)}
    ${syllabusLabelSectionHtml("📌 NOI 大纲覆盖", node.noiLabels)}
    ${syllabusLabelSectionHtml("🏆 蓝桥杯考点覆盖", node.lanqiaoLabels)}
    ${progressBarHtml(stats)}
    ${trainingEvidenceSectionHtml(node, member)}
    <div class="roadmap-problem-list">${cards}</div>
    ${relatedRecordsSectionHtml(nodeData)}
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
    <h2>📎 题单外相关训练记录</h2>
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

  const hint = `<p class="hint">${recordCount} 条训练记录 · ${nodes.length} 个知识树节点覆盖</p>`;

  const nodeSection = nodes.length
    ? `<section class="roadmap-tag-section">
      <h3>📖 知识树覆盖</h3>
      <ul class="roadmap-node-list">
        ${nodes.map((n) => {
          const href = `/roadmap/${encodeURIComponent(String(n.phaseId ?? ""))}/${encodeURIComponent(String(n.nodeId ?? ""))}/`;
          return `<li><a class="roadmap-node-ref" href="${escapeHtml(href)}">${escapeHtml(String(n.nodeTitle ?? ""))}</a> · ${escapeHtml(String(n.phaseTitle ?? ""))} · 进度 ${escapeHtml(String(n.done ?? 0))}/${escapeHtml(String(n.total ?? 0))}（${escapeHtml(String(n.pct ?? 0))}%）</li>`;
        }).join("")}
      </ul>
    </section>`
    : "";

  const recordsSection = records.length
    ? `<section class="roadmap-tag-section">
      <h3>📝 训练记录</h3>
      <ul class="related-list">${records.map(relatedRecordRowHtml).join("")}</ul>
    </section>`
    : "";

  const filterLink = `<a class="btn btn-outline btn-sm" href="/?tag=${encodeURIComponent(tag)}">在总览中按此标签筛选 →</a>`;

  return `${hint}${nodeSection}${recordsSection}${filterLink}`;
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
      return `<a class="tag-index-card" href="/tags/${encodeURIComponent(tag)}/"><strong>${escapeHtml(tag)}</strong><span class="tag-index-meta">${recordCount} 条记录 · ${nodeCount} 个节点</span></a>`;
    })
    .join("");
  return `<div class="tag-index-grid">${cards}</div>`;
}
