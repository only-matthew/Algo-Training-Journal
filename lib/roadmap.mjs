// 路线图（Roadmap）共享 HTML 模板：浏览器端与构建端共用同一份结构。
// 仅依赖 Node 安全模块（render-safety / problem-detail），全部为纯函数、无 DOM 访问。
// 样式类名统一使用 roadmap- 前缀（tag-chip / review-chip 为既有共用类）。
import { escapeHtml } from "./render-safety.mjs";
import { originalProblemUrl } from "./problem-detail.mjs";

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

function tagsHtml(tags) {
  const chips = (tags || [])
    .map((t) => (t != null ? `<span class="tag-chip">${escapeHtml(String(t))}</span>` : ""))
    .join("");
  return chips ? `<div class="roadmap-tags">${chips}</div>` : "";
}

// 3. 阶段卡片
export function roadmapPhaseCardHtml(phase, member) {
  const stats = statsFor(phase.stats, member);
  const nodes = phase.nodes || [];
  return `<article class="card roadmap-phase-card">
    <h3 class="roadmap-phase-title"><a href="/roadmap/${encodeURIComponent(phase.id)}/">${escapeHtml(String(phase.title || ""))}</a></h3>
    ${difficultyRangeHtml(phase.difficulty)}
    ${phase.goal ? `<p class="roadmap-phase-goal">${escapeHtml(String(phase.goal))}</p>` : ""}
    ${phase.milestone ? `<p class="roadmap-phase-milestone">里程碑：${escapeHtml(String(phase.milestone))}</p>` : ""}
    ${phase.reference ? `<p class="roadmap-phase-ref">${escapeHtml(String(phase.reference))}</p>` : ""}
    ${progressBarHtml(stats)}
    <p class="roadmap-phase-count">${nodes.length} 个节点</p>
  </article>`;
}

// 4. 节点卡片
export function roadmapNodeCardHtml(node, phaseId, member) {
  const stats = statsFor(node.stats, member);
  return `<article class="card roadmap-node-card">
    <h4 class="roadmap-node-title"><a href="/roadmap/${encodeURIComponent(phaseId)}/${encodeURIComponent(node.id)}/">${escapeHtml(String(node.title || ""))}</a></h4>
    ${node.listId ? `<span class="roadmap-list-id">${escapeHtml(String(node.listId))}</span>` : ""}
    ${difficultyBadgeHtml(node.difficulty)}
    ${tagsHtml(node.tags)}
    ${prerequisiteTitlesHtml(node.prerequisites)}
    ${wikiLinkHtml(node.wiki)}
    ${node.ref ? `<p class="roadmap-node-ref">${escapeHtml(String(node.ref))}</p>` : ""}
    ${progressBarHtml(stats)}
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

// 8. 题目行
export function roadmapProblemRowHtml(problem) {
  const numberText = escapeHtml(String(problem.number != null ? problem.number : ""));
  const platformText = escapeHtml(String(problem.platform || ""));
  const url = originalProblemUrl(problem.platform, problem.number, problem.name);
  const numberPart = url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${platformText} ${numberText}</a>`
    : `${platformText} ${numberText}`;
  const name = problem.name
    ? escapeHtml(String(problem.name))
    : (numberText || escapeHtml(String(problem.problemId != null ? problem.problemId : "")));
  const sourceBadge = problem.source ? `<span class="tag-chip roadmap-source">${escapeHtml(String(problem.source))}</span>` : "";
  const rating = problem.rating != null ? `<span class="roadmap-problem-rating">★ ${escapeHtml(String(problem.rating))}</span>` : "";
  const tagChips = (problem.tags || []).length
    ? `<span class="roadmap-problem-tags">${problem.tags.map((t) => `<span class="tag-chip roadmap-tag">${escapeHtml(String(t))}</span>`).join("")}</span>`
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
  return `<div class="roadmap-problem-row">
    <div class="roadmap-problem-main">
      <p class="roadmap-problem-number">${numberPart}</p>
      <p class="roadmap-problem-name">${name}</p>
      <div class="roadmap-problem-meta">${sourceBadge}${rating}${tagChips}${role}${note}</div>
    </div>
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
  const rows = problems.map((problem) => roadmapProblemRowHtml(problem)).join("");
  return `<div class="roadmap-node">
    <div class="roadmap-node-head">
      <h2>${escapeHtml(String(node.title || ""))}</h2>
      ${node.listId ? `<span class="roadmap-list-id">${escapeHtml(String(node.listId))}</span>` : ""}
      ${node.group ? `<span class="roadmap-node-group">${escapeHtml(String(node.group))}</span>` : ""}
      ${difficultyBadgeHtml(node.difficulty)}
    </div>
    ${node.description ? `<p class="roadmap-node-desc">${escapeHtml(String(node.description))}</p>` : ""}
    ${prerequisiteTitlesHtml(node.prerequisites)}
    ${wikiLinkHtml(node.wiki)}
    ${node.ref ? `<p class="roadmap-node-ref">${escapeHtml(String(node.ref))}</p>` : ""}
    ${(node.oiTree && node.oiTree.length) ? `<div class="roadmap-oi-tree"><h3>📖 OI 知识树覆盖</h3><ul>${node.oiTree.map((t) => `<li>${escapeHtml(String(t))}</li>`).join("")}</ul></div>` : ""}
    ${tagsHtml(node.tags)}
    ${progressBarHtml(stats)}
    <div class="roadmap-problem-list">${rows}</div>
  </div>`;
}
