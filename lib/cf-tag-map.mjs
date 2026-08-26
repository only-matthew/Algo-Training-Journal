// Codeforces 官方英文标签 → 中文规范标签映射。
// 数据来源：扫描 curriculum/nodes/*.json 中所有 Codeforces 题目的 tags 字段（实际出现的
// 全部英文标签见下方「实际扫描」分组），映射目标尽量取 lib/tag-catalog.mjs 词表中的中文
// 规范标签；词表没有合适中文词的采用贴近的规范直译（如 mo → 莫队）。
// 仅供共享模板层纯函数使用（Node 构建端与浏览器端共用），无 DOM 访问。
export const CF_TAG_ALIASES = Object.freeze({
  // ===== 实际扫描自 curriculum/nodes/*.json 的 Codeforces 标签（29 个） =====
  greedy: "贪心",
  math: "数学",
  sortings: "排序",
  dp: "DP",
  "constructive algorithms": "构造",
  implementation: "模拟",
  "brute force": "暴力",
  strings: "字符串",
  bitmasks: "位运算",
  games: "博弈论",
  "binary search": "二分",
  "data structures": "数据结构",
  graphs: "图论",
  "number theory": "数论",
  combinatorics: "组合数学",
  geometry: "计算几何",
  "shortest paths": "最短路",
  "dfs and similar": "DFS",
  "divide and conquer": "分治",
  hashing: "哈希",
  probabilities: "概率",
  flows: "网络流",
  trees: "树",
  "meet-in-the-middle": "折半搜索",
  matrices: "矩阵乘法",
  "two pointers": "双指针",
  dsu: "并查集",
  bfs: "BFS",
  mo: "莫队",

  // ===== 常见 CF 官方标签（防御性补充，未在当前题库出现；映射同 tag-catalog.mjs） =====
  "ternary search": "三分",
  interactive: "交互",
  fft: "FFT",
  "string suffix structures": "后缀自动机",
  "graph matchings": "二分图",
  "chinese remainder theorem": "中国剩余定理",
  "2-sat": "2-SAT",
  "expression parsing": "表达式解析",
});

// 英文 CF 标签（大小写不敏感）→ 中文规范标签；未命中映射时返回原字符串。
export function cfTagToChinese(tag) {
  if (tag == null) return "";
  const key = String(tag).toLowerCase();
  return CF_TAG_ALIASES[key] ?? String(tag);
}
