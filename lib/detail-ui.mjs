import { escapeHtml } from "./escape-html.mjs";
import { icon } from "./icons.mjs";

export function verseHtml(lines = ["算法如山", "行则将至"]) {
  return `<p class="hero-verse">${lines.map(line => `<span>${escapeHtml(line)}</span>`).join("")}</p>`;
}

export function detailHeroHtml({ title, description = "", symbol = "book", tags = "", verse, actions = "" }) {
  return `<header class="page-hero detail-hero"><div class="hero-art" aria-hidden="true"></div>
    <div class="detail-intro"><span class="detail-symbol">${icon(symbol)}</span><div><h1>${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ""}${tags}</div></div>
    ${verseHtml(verse)}${actions ? `<div class="detail-hero-actions">${actions}</div>` : ""}</header>`;
}

export function detailStatsHtml(stats) {
  return `<div class="detail-stats">${stats.map(([symbol, label, value, href]) => `<a class="detail-stat" href="${escapeHtml(href)}"><span class="stat-icon">${icon(symbol)}</span><span><small>${escapeHtml(label)}</small><strong>${escapeHtml(String(value))}</strong></span>${icon("right")}</a>`).join("")}</div>`;
}

export function recordHref(record) {
  return `/problem/${encodeURIComponent(record.member || "")}/${encodeURIComponent(record.date || "")}/${encodeURIComponent(record.problemId ?? record.problemIndex ?? 0)}/`;
}

export function recordPreviewHtml(record) {
  return `<a class="detail-record-preview" href="${recordHref(record)}"><strong>${escapeHtml(record.problemNumber || "")} ${escapeHtml(record.problem || "")}</strong><p>${escapeHtml(record.summary || record.difficulty || record.platform || "训练记录")}</p><span class="detail-record-meta"><span class="member-initial" aria-hidden="true">${escapeHtml(Array.from(record.member || "")[0] || "")}</span>${escapeHtml(record.member || "")}${icon("calendar")}<time>${escapeHtml(record.date || "")}</time>${icon("right")}</span></a>`;
}

export const knowledgeCategories = [
  { id: "all", title: "全部主题", icon: "grid" },
  { id: "binary", title: "二分", icon: "search", pattern: /二分|三分/ },
  { id: "greedy", title: "贪心", icon: "leaf", pattern: /贪心/ },
  { id: "sorting", title: "排序", icon: "sort", pattern: /排序/ },
  { id: "dp", title: "DP", icon: "grid", pattern: /DP|动态规划|背包/i },
  { id: "graph", title: "图论", icon: "graph", pattern: /图|最短路|生成树|网络流|拓扑|连通|LCA|倍增/i },
  { id: "search", title: "搜索", icon: "search", pattern: /搜索|回溯|剪枝|DFS|BFS/i },
  { id: "string", title: "字符串", icon: "text", pattern: /字符串|文本|KMP|Trie|后缀|自动机/i },
  { id: "math", title: "数学", icon: "math", pattern: /数学|数论|概率|组合|博弈|几何|矩阵|高斯|筛法|质数|素数|模运算|高精度/ },
  { id: "structure", title: "数据结构", icon: "database", pattern: /数据结构|数组|栈|队列|链表|堆|并查集|线段树|树状数组|平衡树|ST表/ },
  { id: "other", title: "其他主题", icon: "code" },
];

export function categoriesForTopic(node) {
  const text = [node.title, ...(node.tags || [])].join(" ");
  const matches = knowledgeCategories.filter(category => category.pattern?.test(text)).map(category => category.id);
  return matches.length ? matches : ["other"];
}
