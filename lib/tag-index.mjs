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
 * 不能用 encodeURIComponent：它按 RFC 3986 保留 ! ~ * ' ( )，而星号在 Windows 文件系统上
 * 是通配符——标签「A*」「IDA*」会把路径变成 data/tags/A*.json，实测直接 ENOENT，
 * 整次构建失败。这里只保留「字母 / 数字 / 连字符 / 下划线 / 点」，其余一律百分号编码：
 * 中英文字节都能编码、结果可逆，且不会出现尺寸写不动或跨平台不一致的字符。
 */
export function tagStorageKey(tag) {
  const raw = new TextEncoder().encode(String(tag ?? ""));
  let out = "";
  for (const byte of raw) {
    const char = String.fromCharCode(byte);
    out += /[A-Za-z0-9._-]/.test(char) ? char : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

/**
 * 标签页地址。必须用 tagStorageKey 而不是 encodeURIComponent 生成：
 * encodeURIComponent 不会转义星号，浏览器访问含星号的标签页时实际路径会被规范化成
 * 字面星号，而静态目录是按 %2A 落盘的（Windows 上星号根本写不出来），链接就会 404。
 */
export function tagHref(tag) {
  return `/tags/${tagStorageKey(tag)}/`;
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
