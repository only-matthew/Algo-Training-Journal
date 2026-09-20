// 洛谷标签 → 站内规范标签的映射。
//
// 为什么要这一层：AtCoder 官方与 kenkoooo 都不提供算法标签，洛谷的 `AT_<任务 ID>`
// 镜像页（与题目列表页）是唯一可用的来源，而洛谷的标签是它自己的一套中文名（`/_lfe/tags`，
// 505 条，其中 262 条是算法标签）。名字多数与站内规范标签一致，但带后缀/空格的写法
// （`深度优先搜索 DFS`、`状压 DP`、`KMP 算法`）无法被 normalizeTag 直接认出，需要显式映射。
//
// 三条规则：能落到站内规范标签的一律映射过去；分类名与「语言入门」那套基础语法标签
// 直接丢弃（它们不是算法标签）；确实没有对应规范标签的成熟技巧（莫队、笛卡尔树…）
// 保留原名，宁可多一个标签页，也不要错误地归到别的知识点上。
import { CANONICAL_TAG_SET, normalizeTag } from "./tag-catalog.mjs";

/** 洛谷算法标签的 type 值：`/_lfe/tags` 里只有 type=2 是算法标签。 */
export const LUOGU_ALGORITHM_TAG_TYPE = 2;

/** 洛谷标签原名（含空格）→ 站内规范标签；值为数组时表示一条洛谷标签对应多个站内标签。 */
export const LUOGU_TAG_ALIASES = Object.freeze({
  // 动态规划
  "动态规划 DP": "DP",
  "背包 DP": "背包",
  "数位 DP": "数位DP",
  "区间 DP": "区间DP",
  "树形 DP": "树形DP",
  "轮廓线 DP": "轮廓线DP",
  "状压 DP": "状压DP",
  "线性 DP": "线性DP",
  "DP 套 DP": "DP套DP",
  "动态 DP": "动态DP",
  "凸完全单调性（wqs 二分）": "wqs二分",
  "斜率维护技巧 slope trick": "slope trick",
  // 搜索
  "深度优先搜索 DFS": "DFS",
  "广度优先搜索 BFS": "BFS",
  "启发式迭代加深搜索 IDA*": "IDA*",
  "爬山算法 Local search": "爬山算法",
  "折半搜索 meet in the middle": "折半搜索",
  "随机调整": "随机化",
  // 字符串
  "字典树 Trie": "Trie",
  "AC 自动机": "AC自动机",
  "KMP 算法": "KMP",
  "后缀数组 SA": "后缀数组",
  "后缀自动机 SAM": "后缀自动机",
  "回文自动机 PAM": "PAM",
  "Manacher 算法": "Manacher",
  "Z 函数": "Z函数",
  "哈希 hashing": "哈希",
  "Lyndon 分解": "Lyndon分解",
  // 树与数据结构
  "最近公共祖先 LCA": "LCA",
  "动态树 LCT": "LCT",
  "Prüfer 序列": "Prüfer序列",
  "颜色段均摊（珂朵莉树 ODT）": "珂朵莉树",
  "吉司机线段树 segment tree beats": "吉司机线段树",
  "离线处理": "离线",
  // 数论 / 组合 / 代数
  "最大公约数 gcd": "gcd",
  "中国剩余定理 CRT": "CRT",
  "Lucas 定理": "Lucas定理",
  "Bézout 定理": "Bézout定理",
  "大步小步算法 BSGS": "BSGS",
  "线性筛法": "线性筛",
  "Dirichlet 卷积": "Dirichlet卷积",
  "Pólya 定理": "Pólya定理",
  "Dilworth 定理": "Dilworth定理",
  "Fibonacci 数列": "Fibonacci",
  "Catalan 数": "Catalan数",
  "Stirling 数": "Stirling数",
  "SG 函数": "SG函数",
  "Nim 积": "Nim积",
  "Berlekamp-Massey(BM) 算法": "Berlekamp-Massey",
  "Stern-Brocot 树": "Stern-Brocot树",
  "集合幂级数，子集卷积": ["集合幂级数", "子集卷积"],
  // 多项式与变换
  "快速傅里叶变换 FFT": "FFT",
  "快速数论变换 NTT": "NTT",
  "快速沃尔什变换 FWT": "FWT",
  "快速莫比乌斯变换 FMT": "FMT",
  // 图论 / 计算几何
  "Kruskal 重构树": "Kruskal重构树",
  "Floyd 算法": "Floyd",
  "一般图的最大匹配": "一般图最大匹配",
  "最大流最小割定理": "最小割",
  "闵可夫斯基和 Minkowski sum": "闵可夫斯基和",
  "双指针 two-pointer": "双指针",
  "A*  算法": "A*",
  // 数学分支：站内只有「数学」这一个规范标签
  "概率论": "概率",
  "微积分": "数学",
  "导数": "数学",
  "积分": "数学",
  "定积分": "数学",
  "级数": "数学",
  // 暴力数据结构（如暴力维护）归到「暴力」
  "暴力数据结构": "暴力",
});

/**
 * 分类名与「语言入门」语法标签：洛谷把它们和算法标签放在同一个 type 里，但它们不是
 * 算法知识点，写进训练日志只会污染标签体系，因此直接丢弃。
 */
export const LUOGU_TAG_DROP = Object.freeze(new Set([
  "语言入门", "顺序结构", "分支结构", "循环结构", "数组", "字符串（入门）", "结构体", "函数与递归",
  "基础算法", "树形数据结构", "线性数据结构", "动态规划优化", "树论", "其它技巧", "组合优化",
]));

// 与 lib/log-schema.mjs 的标签分隔符保持一致：标签里若带分隔符，下次保存时会被拆成两个。
const TAG_SEPARATOR = /[,，、]/;
// 站内单标签上限（lib/log-schema.mjs LOG_LIMITS.tag）。超长的洛谷标签名直接丢弃：
// 截断会造出一个谁都不认识的标签，原样塞进去又会让保存被拒。
const MAX_TAG_LENGTH = 30;

function canonicalize(name) {
  const mapped = LUOGU_TAG_ALIASES[name];
  if (mapped) return Array.isArray(mapped) ? mapped : [mapped];
  const normalized = normalizeTag(name);
  const parts = Array.isArray(normalized) ? normalized : [normalized];
  // 归一后能对上规范标签就用规范标签，否则保留洛谷原名（可能是站内还没有的成熟技巧）。
  return parts.map((part) => (CANONICAL_TAG_SET.has(part) ? part : name));
}

/**
 * 洛谷标签名 → 站内标签列表。
 *
 * 去重、按分隔符再切一次（防住「集合幂级数，子集卷积」这类名字被后续保存拆开），
 * 并按 `limit` 截断——AtCoder 题目一般只有 0–2 个标签，上限只是防御性的。
 */
export function normalizeLuoguTagNames(names, { limit = 6 } = {}) {
  const result = [];
  const push = (value) => {
    const tag = String(value ?? "").trim();
    if (!tag || LUOGU_TAG_DROP.has(tag)) return;
    for (const part of tag.split(TAG_SEPARATOR)) {
      const piece = part.trim();
      if (!piece || piece.length > MAX_TAG_LENGTH || result.includes(piece)) continue;
      result.push(piece);
    }
  };
  for (const name of names || []) {
    if (typeof name !== "string") continue;
    for (const tag of canonicalize(name.trim())) push(tag);
  }
  return result.slice(0, limit);
}

/** 洛谷题目 JSON 里的数字标签 id + `/_lfe/tags` 字典 → 站内标签列表。 */
export function resolveLuoguTagIds(ids, dictionary, options) {
  const names = [];
  for (const id of ids || []) {
    const entry = dictionary?.get?.(Number(id));
    if (entry && entry.type === LUOGU_ALGORITHM_TAG_TYPE) names.push(entry.name);
  }
  return normalizeLuoguTagNames(names, options);
}
