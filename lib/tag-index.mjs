// Index categories are intentionally broader than the submission form's taxonomy.
const structures = new Set([
  "数据结构", "数组", "链表", "栈", "单调栈", "队列", "单调队列", "优先队列",
  "堆", "可并堆", "哈希表", "树", "并查集", "线段树", "树状数组", "平衡树",
  "字典树", "trie", "st表", "lct", "树套树", "可持久化", "可持久化线段树",
  "k-d tree", "李超线段树", "珂朵莉树", "分块", "后缀数组", "后缀树",
  "后缀自动机", "ac自动机", "pam", "线性基",
]);
const algorithms = /贪心|排序|二分|三分|枚举|递推|递归|分治|搜索|剪枝|背包|dp|动态规划|dfs|bfs|数学|数论|博弈|字符串|图论|图遍历|最短路|生成树|网络流|最大流|最小割|费用流|连通|差分约束|树链剖分|倍增|lca|概率|期望|高斯|几何|凸包|矩阵|决策单调性|逆元|欧拉|排列组合|线性代数|斜率优化|旋转卡壳|折半|中国剩余|组合|catalan|gcd|kmp|manacher|nim|sg函数|快速幂|哈夫曼|莫队|哈希|a\*|ida\*/i;

export function categoryForTag(tag) {
  const name = String(tag ?? "").trim().toLowerCase();
  if (structures.has(name)) return "structure";
  if (algorithms.test(name)) return "algorithm";
  // Simulation, precision, boundaries, implementation techniques and custom notes.
  return "implementation";
}

export function matchesTagFilter(name, category = "all", query = "") {
  return (category === "all" || categoryForTag(name) === category)
    && String(name).toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * 标签 → 分片/页面文件名的安全编码（构建端与浏览器端共用，必须完全一致）。
 *
 * 静态托管会解码 URL：磁盘上的「%E9...」文件名不会匹配网址中的中文标签。
 * 常规中英文标签直接落盘；包含文件系统保留字符的标签改用 ~ 加 UTF-8 十六进制。
 * ~ 不在直存字符集内，因此安全代号不会与原始标签冲突。
 */
export function tagStorageKey(tag) {
  const name = String(tag ?? "");
  if (!name) return "";
  if (/^[\p{L}\p{N}._-]+$/u.test(name) && !/[. ]$/.test(name)
    && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) return name;
  return `~${[...new TextEncoder().encode(name)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * URL 中的中文仍需百分号编码，静态托管解码后与原始中文目录匹配。
 * 特殊字符标签使用安全代号，避免托管解码后落到非法文件名。
 */
export function tagHref(tag) {
  return `/tags/${encodeURIComponent(tagStorageKey(tag))}/`;
}

export function filterTagIndex(doc = document) {
  const root = doc.getElementById("tag-content");
  if (!root?.querySelector(".tag-index-grid")) return;
  const query = doc.getElementById("tag-search")?.value || "";
  const category = doc.querySelector("[data-tag-category].active")?.dataset.tagCategory || "all";
  const cards = [...root.querySelectorAll(".tag-index-card")];
  let visible = 0;
  for (const card of cards) {
    card.hidden = !matchesTagFilter(card.dataset.tagName, category, query);
    if (!card.hidden) visible++;
  }
  const status = root.querySelector("#tag-filter-status");
  if (status) {
    status.textContent = `显示 ${visible} / ${cards.length} 个标签`;
    status.hidden = category === "all" && !query.trim();
  }
  const empty = root.querySelector("#tag-filter-empty");
  if (empty) empty.hidden = visible !== 0;
}
