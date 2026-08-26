// scripts/convert-curriculum.js
// 生成学习路线数据层（多源合并）：
//   - curriculum/nodes/<id>.json  39 个知识点节点（37 原有 + 计算几何/字符串进阶/网络流 + 博弈论/分块与莫队）
//   - curriculum/roadmap.json     7 阶段学习路线
// NOI 大纲与蓝桥杯考点不再作为独立知识清单节点，而是把其中的算法标签逐条
// 归并进 39 个知识点节点（noiLabels / lanqiaoLabels），节点已有的标签合并去重，
// 树中缺失的标签补挂到对应节点，并在 noiLevels / lanqiao 中同步级别/组别归属。
// 数据来源（只读）：
//   - know-tree/Luogu-深入浅出.txt（洛谷题单，题源主目录）
//   - know-tree/罗勇军-算法竞赛.txt（罗勇军《算法竞赛》各节例题/习题）
//   - know-tree/刘汝佳.txt（刘汝佳《算法竞赛入门经典》各章练习）
//   - know-tree/NOI_竞赛大纲_2025.md（difficulty 参考 + NOI 大纲算法标签）
//   - know-tree/蓝桥杯_软件赛竞赛大纲_第十七届.md（蓝桥杯考点算法标签）
//   - lib/tag-catalog.mjs（规范标签）
//   - oi-wiki/docs 目录清单（wiki 链接只使用该清单中真实存在的路径）
// 用法：
//   node scripts/convert-curriculum.js           # 目标文件已存在则跳过
//   node scripts/convert-curriculum.js --force   # 强制覆盖

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const KNOW_DIR = path.join(ROOT, "know-tree");
const SRC_FILE = path.join(KNOW_DIR, "Luogu-深入浅出.txt");
const LUO_FILE = path.join(KNOW_DIR, "罗勇军-算法竞赛.txt");
const LIU_FILE = path.join(KNOW_DIR, "刘汝佳.txt");
const NOI_FILE = path.join(KNOW_DIR, "NOI_竞赛大纲_2025.md");
const LANQIAO_FILE = path.join(KNOW_DIR, "蓝桥杯_软件赛竞赛大纲_第十七届.md");
const OI_TREE_FILE = path.join(KNOW_DIR, "tree.txt");
const CF_SUPPLEMENT_FILE = path.join(ROOT, "curriculum", "cf-supplement.json");
const NODES_DIR = path.join(ROOT, "curriculum", "nodes");
const ROADMAP_FILE = path.join(ROOT, "curriculum", "roadmap.json");

const FORCE = process.argv.includes("--force");
const MAX_PROBLEMS_PER_NODE = 80; // 每个节点题单上限，超出按来源优先级截断
const MAX_LUO_PER_NODE = 25; // 罗勇军每节点最多并入题数（大节点保护）
const MAX_LIU_PER_NODE = 12; // 刘汝佳每节点最多并入题数（大节点保护）

// ---------------------------------------------------------------------------
// 1. 平台归一化表：洛谷→洛谷；CodeForces/Codeforces→Codeforces；AtCoder→AtCoder；
//    其余（UVA/HDU/POJ/OpenJ_Bailian/SPOJ/LibreOJ/UniversalOJ）原样。
// ---------------------------------------------------------------------------
const PLATFORM_NORMALIZE = {
  洛谷: "洛谷",
  CodeForces: "Codeforces",
  Codeforces: "Codeforces",
  AtCoder: "AtCoder",
};

// 归一化后允许出现的全部平台值
const VALID_PLATFORMS = [
  "洛谷",
  "Codeforces",
  "AtCoder",
  "UVA",
  "HDU",
  "POJ",
  "OpenJ_Bailian",
  "SPOJ",
  "LibreOJ",
  "UniversalOJ",
];

// ---------------------------------------------------------------------------
// 2. txt 模块头（【编号】标题）→ 节点 id（洛谷题单）
// ---------------------------------------------------------------------------
const MODULE_MAP = {
  "入门1::顺序结构": "basics-sequence",
  "入门2::分支结构": "basics-branch",
  "入门3::循环结构": "basics-loop",
  "入门4::数组": "basics-array",
  "入门5::字符串": "basics-string",
  "入门6::函数与结构体": "basics-function-struct",
  "算法1-1::模拟与高精度": "algo-simulation-bigint",
  "算法1-2::排序": "algo-sorting",
  "算法1-3::暴力枚举": "algo-enumeration",
  "算法1-4::递推与递归": "algo-recurrence-recursion",
  "算法1-5::贪心": "algo-greedy",
  "算法1-6::二分查找与二分答案": "algo-binary-search",
  "算法1-7::搜索": "algo-search-basics",
  "数据结构1-1::线性表": "ds-linear-list",
  "数据结构1-2::二叉树": "ds-binary-tree",
  "数据结构1-3::集合": "ds-set",
  "数据结构1-4::图的基本应用": "ds-graph-basics",
  "数学1::基础数学问题": "math-basics",
  "算法2-1::前缀和、差分与离散化": "algo-prefix-diff-discretize",
  "算法2-2::常见优化技巧": "algo-optimization-tricks",
  "算法2-3::分治与倍增": "algo-divide-conquer-doubling",
  "算法2-4::字符串": "string-basics",
  "算法2-5::进阶搜索": "search-advanced",
  "数据结构2-1::二叉堆与树状数组": "ds-heap-bit",
  "数据结构2-2::线段树": "ds-segtree",
  "图论2-1::树": "graph-tree",
  "图论2-2::最短路": "graph-shortest-path",
  "图论2-3::最小生成树": "graph-mst",
  "图论2-4::连通性问题": "graph-connectivity",
  "动态规划1::动态规划的引入": "dp-intro",
  "动态规划2::线性状态动态规划": "dp-linear",
  "动态规划3::区间与环形动态规划": "dp-interval",
  "动态规划4::树与图上的动态规划": "dp-tree-graph",
  "动态规划5::状态压缩动态规划": "dp-bitmask",
  "数学2-1::进阶数论": "math-number-theory",
  "数学2-2::组合数学与计数": "math-combinatorics",
  "数学2-3::概率与统计": "math-probability",
  "数学2-4::基础线性代数": "math-linear-algebra",
  "数据结构2-3::线段树的进阶用法": "ds-segtree-advanced",
  "动态规划6::动态规划的设计与优化": "dp-optimization",
};

// ---------------------------------------------------------------------------
// 3. 43 个节点元数据（40 原有 + math-geometry/string-advanced/graph-network-flow）。
//    - listId 与 txt 模块头【】内编号一致；
//    - group 按知识归属；
//    - difficulty 依 NOI 大纲难度系数（1-10 整数）；
//    - prerequisites ≤4 个知识前置；
//    - wiki 均来自 oi-wiki/docs 目录清单；
//    - tags 均取自 lib/tag-catalog.mjs 规范标签（2-4 个）。
// ---------------------------------------------------------------------------
const NODE_META = [
  // ===== 算法1 =====
  { id: "algo-simulation-bigint", title: "模拟与高精度", listId: "算法1-1", group: "算法1", difficulty: 3,
    prerequisites: [], wiki: "https://oi-wiki.org/math/bignum/", tags: ["模拟", "高精度"],
    description: "按题意逐步模拟过程，并用高精度处理超大整数运算。" },
  { id: "algo-sorting", title: "排序", listId: "算法1-2", group: "算法1", difficulty: 3,
    prerequisites: [], wiki: "https://oi-wiki.org/basic/sort-intro/", tags: ["排序", "贪心"],
    description: "掌握常用排序算法与 sort 应用，理解排序在解题中的预处理作用。" },
  { id: "algo-enumeration", title: "暴力枚举", listId: "算法1-3", group: "算法1", difficulty: 3,
    prerequisites: [], wiki: "https://oi-wiki.org/basic/enumerate/", tags: ["枚举", "暴力"],
    description: "枚举所有可能状态，配合剪枝与数学推导降低复杂度。" },
  { id: "algo-recurrence-recursion", title: "递推与递归", listId: "算法1-4", group: "算法1", difficulty: 3,
    prerequisites: ["algo-sorting"], wiki: "https://oi-wiki.org/dp/basic/", tags: ["递推", "递归"],
    description: "掌握递推关系建模与递归函数设计，理解分治雏形与记忆化思想。" },
  { id: "algo-greedy", title: "贪心", listId: "算法1-5", group: "算法1", difficulty: 4,
    prerequisites: ["algo-sorting", "algo-enumeration"], wiki: "https://oi-wiki.org/basic/greedy/", tags: ["贪心", "排序"],
    description: "掌握贪心策略的证明与常见模型，学会排序后按最优顺序决策。" },
  { id: "algo-binary-search", title: "二分查找与二分答案", listId: "算法1-6", group: "算法1", difficulty: 4,
    prerequisites: ["algo-sorting", "algo-recurrence-recursion"], wiki: "https://oi-wiki.org/basic/binary/", tags: ["二分", "二分答案"],
    description: "掌握二分查找与二分答案的单调性判定，解决最优化问题。" },
  { id: "algo-search-basics", title: "搜索", listId: "算法1-7", group: "算法1", difficulty: 4,
    prerequisites: ["algo-recurrence-recursion"], wiki: "https://oi-wiki.org/search/dfs/", tags: ["DFS", "BFS"],
    description: "掌握 DFS/BFS 框架与状态表示，解决可达性与路径类问题。" },

  // ===== 数据结构1 =====
  { id: "ds-linear-list", title: "线性表", listId: "数据结构1-1", group: "数据结构1", difficulty: 3,
    prerequisites: [], wiki: "https://oi-wiki.org/ds/linked-list/", tags: ["栈", "队列", "链表"],
    description: "掌握栈、队列、链表等线性结构的实现与应用场景。" },
  { id: "ds-binary-tree", title: "二叉树", listId: "数据结构1-2", group: "数据结构1", difficulty: 4,
    prerequisites: ["ds-linear-list", "algo-recurrence-recursion"], wiki: "https://oi-wiki.org/ds/bst/", tags: ["树", "递归"],
    description: "掌握二叉树的存储与遍历，理解递归在树结构上的应用。" },
  { id: "ds-set", title: "集合", listId: "数据结构1-3", group: "数据结构1", difficulty: 4,
    prerequisites: ["ds-linear-list", "algo-sorting"], wiki: "https://oi-wiki.org/ds/dsu/", tags: ["并查集", "哈希表"],
    description: "掌握哈希表、并查集与 STL 集合容器的使用，维护元素关系。" },
  { id: "ds-graph-basics", title: "图的基本应用", listId: "数据结构1-4", group: "数据结构1", difficulty: 4,
    prerequisites: ["ds-linear-list", "algo-search-basics"], wiki: "https://oi-wiki.org/graph/save/", tags: ["图论", "图遍历", "拓扑排序"],
    description: "掌握图的存储与遍历，运用拓扑排序解决依赖关系问题。" },

  // ===== 数学1 =====
  { id: "math-basics", title: "基础数学问题", listId: "数学1", group: "数学1", difficulty: 3,
    prerequisites: [], wiki: "https://oi-wiki.org/math/binary-exponentiation/", tags: ["数论", "gcd", "快速幂"],
    description: "掌握进制转换、质数判定与筛法、gcd 等基础数论工具。" },

  // ===== 算法2 =====
  { id: "algo-prefix-diff-discretize", title: "前缀和、差分与离散化", listId: "算法2-1", group: "算法2", difficulty: 5,
    prerequisites: ["math-basics"], wiki: "https://oi-wiki.org/basic/prefix-sum/", tags: ["前缀和", "差分", "离散化"],
    description: "掌握前缀和、差分与离散化，快速处理区间统计与范围修改。" },
  { id: "algo-optimization-tricks", title: "常见优化技巧", listId: "算法2-2", group: "算法2", difficulty: 5,
    prerequisites: ["algo-prefix-diff-discretize", "algo-binary-search"], wiki: "https://oi-wiki.org/misc/two-pointer/", tags: ["双指针", "单调队列", "单调栈"],
    description: "掌握双指针、单调栈/队列等优化手段，降低枚举与查询复杂度。" },
  { id: "algo-divide-conquer-doubling", title: "分治与倍增", listId: "算法2-3", group: "算法2", difficulty: 5,
    prerequisites: ["algo-recurrence-recursion", "algo-sorting"], wiki: "https://oi-wiki.org/basic/divide-and-conquer/", tags: ["分治", "倍增"],
    description: "掌握分治与倍增两大思想，应用于排序、逆序对与区间查询。" },
  { id: "string-basics", title: "字符串", listId: "算法2-4", group: "算法2", difficulty: 6,
    prerequisites: ["algo-divide-conquer-doubling"], wiki: "https://oi-wiki.org/string/kmp/", tags: ["字符串", "KMP", "Trie"],
    description: "掌握 KMP、Trie、AC 自动机等字符串匹配与检索算法。" },
  { id: "search-advanced", title: "进阶搜索", listId: "算法2-5", group: "算法2", difficulty: 6,
    prerequisites: ["algo-search-basics", "algo-binary-search"], wiki: "https://oi-wiki.org/search/opt/", tags: ["剪枝", "迭代加深搜索", "启发式搜索"],
    description: "掌握剪枝、迭代加深、启发式与折半搜索等高级搜索技巧。" },

  // ===== 数据结构2 =====
  { id: "ds-heap-bit", title: "二叉堆与树状数组", listId: "数据结构2-1", group: "数据结构2", difficulty: 6,
    prerequisites: ["ds-linear-list", "algo-divide-conquer-doubling"], wiki: "https://oi-wiki.org/ds/binary-heap/", tags: ["堆", "树状数组"],
    description: "掌握堆与树状数组的实现，支持优先队列与动态前缀统计。" },
  { id: "ds-segtree", title: "线段树", listId: "数据结构2-2", group: "数据结构2", difficulty: 7,
    prerequisites: ["ds-binary-tree", "algo-divide-conquer-doubling"], wiki: "https://oi-wiki.org/ds/seg/", tags: ["线段树", "数据结构"],
    description: "掌握线段树的建树、区间修改与查询，处理动态区间问题。" },
  { id: "ds-segtree-advanced", title: "线段树的进阶用法", listId: "数据结构2-3", group: "数据结构2", difficulty: 9,
    prerequisites: ["ds-segtree", "math-number-theory"], wiki: "https://oi-wiki.org/ds/persistent-seg/", tags: ["可持久化线段树", "可持久化", "线段树"],
    description: "掌握可持久化、动态开点、线段树合并等进阶线段树技巧。" },

  // ===== 图论2 =====
  { id: "graph-tree", title: "树", listId: "图论2-1", group: "图论2", difficulty: 6,
    prerequisites: ["ds-binary-tree", "ds-graph-basics", "algo-divide-conquer-doubling"], wiki: "https://oi-wiki.org/graph/tree-basic/", tags: ["树", "LCA", "树链剖分"],
    description: "掌握树的遍历、直径、重心、LCA 与树上差分等基础树上算法。" },
  { id: "graph-shortest-path", title: "最短路", listId: "图论2-2", group: "图论2", difficulty: 7,
    prerequisites: ["ds-graph-basics", "ds-heap-bit"], wiki: "https://oi-wiki.org/graph/shortest-path/", tags: ["最短路", "差分约束"],
    description: "掌握 Dijkstra、SPFA、Floyd 等最短路算法及差分约束应用。" },
  { id: "graph-mst", title: "最小生成树", listId: "图论2-3", group: "图论2", difficulty: 6,
    prerequisites: ["ds-graph-basics", "ds-set"], wiki: "https://oi-wiki.org/graph/mst/", tags: ["最小生成树", "并查集"],
    description: "掌握 Kruskal 与 Prim 算法，理解最小生成树的建模与变形。" },
  { id: "graph-connectivity", title: "连通性问题", listId: "图论2-4", group: "图论2", difficulty: 7,
    prerequisites: ["ds-graph-basics", "graph-shortest-path"], wiki: "https://oi-wiki.org/graph/connectivity/", tags: ["连通性", "强连通分量", "双连通分量"],
    description: "掌握 Tarjan 系列算法，处理强连通、割点割边与双连通分量。" },

  // ===== 动态规划 =====
  { id: "dp-intro", title: "动态规划的引入", listId: "动态规划1", group: "动态规划", difficulty: 4,
    prerequisites: ["algo-recurrence-recursion", "algo-greedy"], wiki: "https://oi-wiki.org/dp/basic/", tags: ["DP", "递推"],
    description: "理解状态、转移与最优子结构，掌握线性递推型 DP 的基本写法。" },
  { id: "dp-linear", title: "线性状态动态规划", listId: "动态规划2", group: "动态规划", difficulty: 5,
    prerequisites: ["dp-intro", "math-basics"], wiki: "https://oi-wiki.org/dp/knapsack/", tags: ["线性DP", "背包"],
    description: "掌握线性 DP 模型，包括背包、LIS/LCS 等经典问题。" },
  { id: "dp-interval", title: "区间与环形动态规划", listId: "动态规划3", group: "动态规划", difficulty: 6,
    prerequisites: ["dp-linear", "algo-prefix-diff-discretize"], wiki: "https://oi-wiki.org/dp/interval/", tags: ["区间DP", "环形DP"],
    description: "掌握区间 DP 的枚举框架与环形问题的破环成链技巧。" },
  { id: "dp-tree-graph", title: "树与图上的动态规划", listId: "动态规划4", group: "动态规划", difficulty: 6,
    prerequisites: ["dp-linear", "graph-tree"], wiki: "https://oi-wiki.org/dp/tree/", tags: ["树形DP", "DP"],
    description: "掌握树形 DP 与图上 DP，处理树上选点与图论模型。" },
  { id: "dp-bitmask", title: "状态压缩动态规划", listId: "动态规划5", group: "动态规划", difficulty: 7,
    prerequisites: ["dp-linear", "math-basics"], wiki: "https://oi-wiki.org/dp/state/", tags: ["状压DP", "状态压缩", "位运算"],
    description: "掌握状压 DP 的位运算状态表示与转移优化。" },
  { id: "dp-optimization", title: "动态规划的设计与优化", listId: "动态规划6", group: "动态规划", difficulty: 8,
    prerequisites: ["dp-linear", "dp-interval", "ds-segtree"], wiki: "https://oi-wiki.org/dp/misc/", tags: ["斜率优化", "决策单调性", "单调队列优化"],
    description: "掌握单调队列、斜率优化、决策单调性等 DP 优化手段。" },

  // ===== 数学2 =====
  { id: "math-number-theory", title: "进阶数论", listId: "数学2-1", group: "数学2", difficulty: 7,
    prerequisites: ["math-basics", "algo-divide-conquer-doubling"], wiki: "https://oi-wiki.org/math/index/", tags: ["数论", "逆元", "中国剩余定理", "欧拉函数"],
    description: "掌握扩展欧几里得、逆元、CRT、欧拉函数与筛法进阶。" },
  { id: "math-combinatorics", title: "组合数学与计数", listId: "数学2-2", group: "数学2", difficulty: 7,
    prerequisites: ["math-number-theory", "dp-linear"], wiki: "https://oi-wiki.org/math/index/", tags: ["组合数学", "排列组合", "Catalan数"],
    description: "掌握排列组合、容斥、Catalan 与 Stirling 数等计数工具。" },
  { id: "math-probability", title: "概率与统计", listId: "数学2-3", group: "数学2", difficulty: 8,
    prerequisites: ["math-number-theory", "dp-linear"], wiki: "https://oi-wiki.org/dp/probability/", tags: ["概率", "期望", "概率DP"],
    description: "掌握概率与期望的计算，处理期望 DP 与概率模型问题。" },
  { id: "math-linear-algebra", title: "基础线性代数", listId: "数学2-4", group: "数学2", difficulty: 8,
    prerequisites: ["math-number-theory", "dp-linear"], wiki: "https://oi-wiki.org/math/index/", tags: ["线性代数", "高斯消元", "矩阵乘法", "线性基"],
    description: "掌握矩阵乘法、高斯消元与线性基等线性代数工具。" },

  // ===== 新增：罗勇军《算法竞赛》覆盖但原 40 节点缺失的专题 =====
  { id: "math-geometry", title: "计算几何", listId: "数学3", group: "数学2", difficulty: 8,
    prerequisites: ["math-linear-algebra", "graph-tree"], wiki: "https://oi-wiki.org/geometry/", tags: ["计算几何", "凸包", "旋转卡壳", "几何"],
    description: "掌握向量叉积、线段相交、多边形、凸包、旋转卡壳与半平面交等计算几何工具。" },
  { id: "string-advanced", title: "字符串进阶", listId: "算法2-6", group: "算法2", difficulty: 9,
    prerequisites: ["string-basics"], wiki: "https://oi-wiki.org/string/", tags: ["Manacher", "后缀数组", "AC自动机", "后缀自动机"],
    description: "掌握 Manacher、回文树、AC 自动机、后缀数组与后缀自动机等高级字符串算法。" },
  { id: "graph-network-flow", title: "网络流与二分图", listId: "图论2-5", group: "图论2", difficulty: 9,
    prerequisites: ["graph-shortest-path", "graph-connectivity"], wiki: "https://oi-wiki.org/graph/flow/", tags: ["网络流", "最大流", "费用流", "二分图"],
    description: "掌握最大流、最小割、费用流与二分图匹配的建模与算法。" },
];

// 新增节点补充的洛谷模板题（经典题号，保证题单有可刷入口）
const NEW_NODE_LUOGU = {
  "math-geometry": ["P2742", "P1452"],
  "string-advanced": ["P3805", "P3808", "P3809"],
  "graph-network-flow": ["P3376", "P3386", "P3381"],
};

// ---------------------------------------------------------------------------
// 3b. OI 知识树（know-tree/tree.txt）主题 → 节点 id 映射。
//     用于「补充 OI 知识树，遇到相同的就合并」：已有节点吸收主题（oiTree 字段 + 标签），
//     完全缺失的主题（博弈论、分块与莫队）另建新节点。
// ---------------------------------------------------------------------------
const OI_TOPIC_TO_NODE = {
  // ===== 数学 =====
  "数论": "math-number-theory", "质数": "math-number-theory", "质数判定": "math-number-theory",
  "质数筛法": "math-number-theory", "分解质因数": "math-number-theory", "因数个数 / 因数之和": "math-number-theory",
  "互质相关": "math-number-theory", "欧拉函数 φ(n)": "math-number-theory", "欧拉定理": "math-number-theory",
  "费马小定理": "math-number-theory", "扩展欧几里得": "math-number-theory", "中国剩余定理": "math-number-theory",
  "逆元": "math-number-theory", "高次同余方程 (BSGS)": "math-number-theory",
  "莫比乌斯反演": "math-number-theory", "杜教筛": "math-number-theory", "Min_25 筛": "math-number-theory",
  "整数分块": "math-number-theory", "快速幂": "math-basics",
  "组合数学": "math-combinatorics", "排列组合": "math-combinatorics", "加法原理": "math-combinatorics",
  "乘法原理": "math-combinatorics", "排列 (A(n,m))": "math-combinatorics", "组合 (C(n,m))": "math-combinatorics",
  "二项式定理": "math-combinatorics", "卢卡斯定理 (Lucas)": "math-combinatorics", "卡特兰数": "math-combinatorics",
  "容斥原理": "math-combinatorics", "错排问题": "math-combinatorics", "鸽巢原理": "math-combinatorics",
  "拉格朗日插值法": "math-combinatorics", "斯特林数": "math-combinatorics", "贝尔数": "math-combinatorics",
  "康托展开": "math-combinatorics",
  "线性代数": "math-linear-algebra", "高斯消元": "math-linear-algebra", "矩阵乘法": "math-linear-algebra",
  "行列式": "math-linear-algebra", "逆矩阵": "math-linear-algebra", "线性基": "math-linear-algebra",
  "概率论": "math-probability", "随机变量": "math-probability", "期望": "math-probability",
  "概率 DP": "math-probability",
  "博弈论": "math-game-theory", "SG 函数": "math-game-theory", "Nim 游戏": "math-game-theory",
  "巴什博弈": "math-game-theory", "威佐夫博弈": "math-game-theory", "斐波那契博弈": "math-game-theory",
  "差分与前缀和": "algo-prefix-diff-discretize",
  "复杂度分析": "math-basics",
  // ===== 计算几何 =====
  "计算几何": "math-geometry", "基础几何": "math-geometry", "向量": "math-geometry",
  "点积 (Dot)": "math-geometry", "叉积 (Cross)": "math-geometry", "旋转": "math-geometry",
  "直线 / 线段": "math-geometry", "圆": "math-geometry", "多边形": "math-geometry",
  "三角形": "math-geometry", "凸包 (Graham Scan, Andrew)": "math-geometry", "半平面交": "math-geometry",
  "几何算法": "math-geometry", "最近点对": "math-geometry", "旋转卡壳": "math-geometry",
  "三角剖分": "math-geometry", "扫描线": "math-geometry",
  // ===== 图论 =====
  "图论": "ds-graph-basics", "基础": "ds-graph-basics", "图的存储": "ds-graph-basics",
  "邻接矩阵": "ds-graph-basics", "邻接表": "ds-graph-basics", "遍历": "ds-graph-basics",
  "拓扑排序": "ds-graph-basics", "入度表法": "ds-graph-basics",
  "DFS (深度优先搜索)": "algo-search-basics", "BFS (广度优先搜索)": "algo-search-basics",
  "最短路算法": "graph-shortest-path", "单源最短路": "graph-shortest-path",
  "Dijkstra (堆优化)": "graph-shortest-path", "SPFA (队列优化 Bellman-Ford)": "graph-shortest-path",
  "Bellman-Ford": "graph-shortest-path", "全源最短路": "graph-shortest-path", "Floyd": "graph-shortest-path",
  "Johnson": "graph-shortest-path", "负权环与差分约束": "graph-shortest-path",
  "SPFA 判负环": "graph-shortest-path", "差分约束系统": "graph-shortest-path",
  "最小生成树 (MST)": "graph-mst", "Prim": "graph-mst", "Kruskal (并查集实现)": "graph-mst",
  "连通性": "graph-connectivity", "强连通分量 (SCC)": "graph-connectivity", "Tarjan": "graph-connectivity",
  "Kosaraju": "graph-connectivity", "割点与桥": "graph-connectivity", "Tarjan 求割点/桥": "graph-connectivity",
  "2-SAT 问题": "graph-connectivity",
  "网络流": "graph-network-flow", "最大流": "graph-network-flow", "EK (Edmonds-Karp)": "graph-network-flow",
  "Dinic": "graph-network-flow", "费用流": "graph-network-flow", "上下界网络流": "graph-network-flow",
  "匹配": "graph-network-flow", "二分图匹配": "graph-network-flow", "匈牙利算法": "graph-network-flow",
  "一般图匹配": "graph-network-flow", "带花树开花 (Blossom)": "graph-network-flow",
  "LCA (最近公共祖先)": "graph-tree", "倍增法": "graph-tree", "Tarjan 离线": "graph-tree",
  "RMQ (ST表)": "graph-tree", "树链剖分": "graph-tree", "点分治": "graph-tree",
  // ===== 动态规划 =====
  "动态规划 (DP)": "dp-intro", "基础 DP": "dp-linear", "线性 DP": "dp-linear",
  "最长上升子序列 (LIS)": "dp-linear", "最长公共子序列 (LCS)": "dp-linear", "数字三角形": "dp-linear",
  "区间 DP": "dp-interval", "石子合并": "dp-interval", "括号匹配": "dp-interval",
  "背包问题": "dp-linear", "01 背包": "dp-linear", "完全背包": "dp-linear",
  "多重背包": "dp-linear", "分组背包": "dp-linear", "树形背包": "dp-tree-graph",
  "进阶 DP": "dp-bitmask", "状压 DP": "dp-bitmask", "旅行商问题 (TSP)": "dp-bitmask",
  "插头 DP": "dp-bitmask", "数位 DP": "dp-linear", "计数类数位 DP": "dp-linear",
  "记忆化搜索": "search-advanced",
  "优化技巧": "dp-optimization", "单调队列优化": "dp-optimization", "斜率优化": "dp-optimization",
  "四边形不等式优化": "dp-optimization", "树状数组/线段树优化": "dp-optimization",
  // ===== 数据结构 =====
  "数据结构": "ds-linear-list", "基础结构": "ds-linear-list", "栈": "ds-linear-list",
  "队列": "ds-linear-list", "链表": "ds-linear-list",
  "并查集 (Union-Find)": "ds-set", "路径压缩": "ds-set", "按秩合并": "ds-set",
  "树状结构": "ds-heap-bit", "树状数组 (BIT)": "ds-heap-bit",
  "ST 表 (稀疏表)": "algo-divide-conquer-doubling", "静态 RMQ": "algo-divide-conquer-doubling",
  "线段树 (Segment Tree)": "ds-segtree", "区间修改区间查询": "ds-segtree", "权值线段树": "ds-segtree",
  "平衡树": "ds-segtree-advanced", "Treap": "ds-segtree-advanced", "Splay": "ds-segtree-advanced",
  "AVL": "ds-segtree-advanced", "红黑树 (概念)": "ds-segtree-advanced",
  "哈希": "string-basics", "字符串哈希": "string-basics", "哈希冲突处理": "string-basics",
  "高级结构": "ds-segtree-advanced", "可持久化线段树 (主席树)": "ds-segtree-advanced",
  "动态树 (Link-Cut Tree)": "ds-segtree-advanced",
  "分块 (莫队算法基础)": "ds-block-mo", "莫队算法": "ds-block-mo",
  // ===== 字符串 =====
  "字符串": "string-basics", "基础": "string-basics", "字符串匹配": "string-basics",
  "KMP 算法": "string-basics", "Trie 树 (字典树)": "string-basics",
  "高级": "string-advanced", "AC 自动机": "string-advanced", "Manacher (回文串)": "string-advanced",
  "后缀数组 (SA)": "string-advanced", "后缀自动机 (SAM)": "string-advanced",
  // ===== 搜索 =====
  "搜索": "algo-search-basics", "深度优先搜索 (DFS)": "algo-search-basics",
  "广度优先搜索 (BFS)": "algo-search-basics", "最短路 (无权图)": "algo-search-basics",
  "状态空间搜索": "algo-search-basics", "双向广搜": "algo-search-basics",
  "回溯法": "algo-search-basics", "剪枝策略": "search-advanced", "迭代加深": "search-advanced",
  "双向 BFS": "search-advanced", "启发式搜索 (A*)": "search-advanced", "估价函数": "search-advanced",
  "IDA*": "search-advanced", "模拟退火": "search-advanced",
  // ===== 其他算法 =====
  "贪心算法": "algo-greedy", "活动选择问题": "algo-greedy", "霍夫曼编码": "algo-greedy",
  "二分与三分": "algo-binary-search", "二分答案": "algo-binary-search", "三分求极值": "algo-binary-search",
  "离散化": "algo-prefix-diff-discretize", "坐标压缩": "algo-prefix-diff-discretize",
  "倍增法": "algo-divide-conquer-doubling", "树上倍增": "algo-divide-conquer-doubling",
  "构造算法": "algo-divide-conquer-doubling", "分治构造": "algo-divide-conquer-doubling",
};

// OI 知识树带来的全新专题节点（原节点体系未覆盖）
const OI_NEW_NODES = [
  {
    id: "math-game-theory", title: "博弈论", listId: "数学2-5", group: "数学2", difficulty: 8,
    prerequisites: ["math-combinatorics", "dp-intro"],
    wiki: "https://oi-wiki.org/math/game-theory/",
    tags: ["博弈论", "SG函数", "Nim"],
    description: "掌握 SG 函数、Nim 游戏与巴什博弈、威佐夫博弈、斐波那契博弈等经典博弈模型。",
    noiLevels: ["提高级", "NOI级"], lanqiao: ["大学A组"],
    problems: [
      { platform: "洛谷", number: "P2197", name: "", source: "洛谷", role: "练习", note: "Nim 游戏模板" },
      { platform: "洛谷", number: "P1247", name: "", source: "洛谷", role: "练习", note: "取火柴游戏" },
      { platform: "洛谷", number: "P2252", name: "", source: "洛谷", role: "练习", note: "威佐夫博弈" },
      { platform: "洛谷", number: "P1290", name: "", source: "洛谷", role: "练习", note: "欧几里得的游戏" },
      { platform: "洛谷", number: "P4018", name: "", source: "洛谷", role: "练习", note: "巴什博弈变式" },
      { platform: "Codeforces", number: "276B", name: "Little Girl and Game", source: "Codeforces·精选", role: "练习", note: "", rating: 1200, tags: ["games"] },
      { platform: "Codeforces", number: "1404B", name: "Tree Tag", source: "Codeforces·精选", role: "练习", note: "", rating: 1700, tags: ["games", "trees"] },
    ],
  },
  {
    id: "ds-block-mo", title: "分块与莫队", listId: "数据结构2-4", group: "数据结构2", difficulty: 8,
    prerequisites: ["ds-segtree", "ds-heap-bit"],
    wiki: "https://oi-wiki.org/misc/mo-algo/",
    tags: ["分块", "莫队算法"],
    description: "掌握根号分块思想与莫队算法，处理离线区间查询与带修改问题。",
    noiLevels: ["提高级", "NOI级"], lanqiao: ["大学A组"],
    problems: [
      { platform: "洛谷", number: "P1972", name: "", source: "洛谷", role: "练习", note: "HH的项链（莫队模板）" },
      { platform: "洛谷", number: "P1494", name: "", source: "洛谷", role: "练习", note: "小Z的袜子" },
      { platform: "洛谷", number: "P2709", name: "", source: "洛谷", role: "练习", note: "小B的询问" },
      { platform: "洛谷", number: "P1903", name: "", source: "洛谷", role: "练习", note: "数颜色（带修莫队）" },
      { platform: "洛谷", number: "P2801", name: "", source: "洛谷", role: "练习", note: "教主的魔法（分块）" },
      { platform: "Codeforces", number: "1000F", name: "One Occurrence", source: "Codeforces·精选", role: "练习", note: "", rating: 2000, tags: ["data structures", "mo"] },
      { platform: "Codeforces", number: "877F", name: "Ann and Books", source: "Codeforces·精选", role: "练习", note: "", rating: 2200, tags: ["mo", "data structures"] },
    ],
  },
];

// 读取 curriculum/cf-supplement.json（Codeforces 补充题，可离线精选或 fetch-codeforces.js 生成）
function loadCfSupplement() {
  if (!fs.existsSync(CF_SUPPLEMENT_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CF_SUPPLEMENT_FILE, "utf8"));
  } catch (error) {
    console.warn(`[warn] cf-supplement.json 解析失败，跳过：${error.message}`);
    return {};
  }
}

// 读取 curriculum/luogu-problem-meta.json（洛谷官方题名/难度，scripts/fetch-luogu-meta.mjs 生成）。
// 返回 Map<"平台|题号", { name, difficulty }>；文件缺失或解析失败时返回空 Map（不影响生成）。
function loadLuoguMeta() {
  const metaFile = path.join(ROOT, "curriculum", "luogu-problem-meta.json");
  if (!fs.existsSync(metaFile)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    const map = new Map();
    for (const p of raw.problems || []) {
      if (p && p.platform && p.number) map.set(`${p.platform}|${p.number}`, p);
    }
    return map;
  } catch (error) {
    console.warn(`[warn] luogu-problem-meta.json 解析失败，跳过富化：${error.message}`);
    return new Map();
  }
}

// 解析 OI 知识树 tree.txt（## 一级 → ### 二级 → #### 主题 → #####/###### 细节），
// 返回 { 主题标题 → 叶子细节数组 }（只保留有映射的主题）
function parseOiTree() {
  const text = fs.readFileSync(OI_TREE_FILE, "utf8");
  const stack = []; // 每级当前标题
  const topicDetails = new Map(); // 主题标题 -> 子细节列表
  const detailStack = []; // 用于收集 #####/###### 细节
  let lastTopic = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(#{2,6})\s*(.+)$/.exec(line);
    if (!m) continue;
    const level = m[1].length;
    const title = m[2].trim();
    if (level <= 4) {
      // 主题级（####）及以上的容器标题
      if (level === 4 && OI_TOPIC_TO_NODE[title]) {
        lastTopic = title;
        if (!topicDetails.has(title)) topicDetails.set(title, []);
      } else {
        lastTopic = null;
      }
      stack.length = 0;
      continue;
    }
    // #####/###### 细节行：挂到最近的主题下
    if (lastTopic && topicDetails.has(lastTopic)) {
      topicDetails.get(lastTopic).push(title);
    }
  }
  return topicDetails;
}

// ---------------------------------------------------------------------------
// 4. Codeforces 补充题：platform "Codeforces"、name 留空、source "Codeforces"、
//    role "练习"。按指令清单直接写入，不核实。
// ---------------------------------------------------------------------------
const CF_SUPPLEMENTS = {
  "algo-simulation-bigint": ["1182B", "1498A"],
  "algo-sorting": ["339A", "1092B"],
  "algo-enumeration": ["1399C", "1343A"],
  "algo-greedy": ["1328A", "489C", "546B", "1343C", "1618D", "1635C", "1642C", "1490E", "1539C", "1654C"],
  "algo-binary-search": ["474B", "1201C", "1538C"],
  "math-basics": ["122A", "1327A", "1370A", "1372B", "1603A", "1526B"],
  "algo-prefix-diff-discretize": ["466C", "1426D", "1555C", "1462D"],
  "algo-optimization-tricks": ["1352D", "1582C", "1133C"],
  "algo-divide-conquer-doubling": ["1385D"],
  "search-advanced": ["1607F"],
  "ds-segtree": ["339D", "380C"],
  "graph-tree": ["1592C"],
  "graph-shortest-path": ["20C", "601A"],
  "dp-intro": ["455A", "327A"],
  "dp-linear": ["1625C", "1452D"],
  "math-combinatorics": ["1475C", "478B", "1520D"],
};

// ---------------------------------------------------------------------------
// 5. NOI 大纲级别 / 蓝桥杯组别 标注（用于节点 ref 与知识树）
// ---------------------------------------------------------------------------
const NOI_NODE_LEVELS = {
  // 入门级（CSP-J）
  "algo-simulation-bigint": ["入门级"], "algo-sorting": ["入门级", "提高级"],
  "algo-enumeration": ["入门级"], "algo-recurrence-recursion": ["入门级"],
  "algo-greedy": ["入门级"], "algo-binary-search": ["入门级", "提高级"],
  "algo-search-basics": ["入门级"], "ds-linear-list": ["入门级"], "ds-binary-tree": ["入门级"],
  "ds-set": ["入门级", "提高级"], "ds-graph-basics": ["入门级", "提高级"], "math-basics": ["入门级"],
  "algo-prefix-diff-discretize": ["入门级", "提高级"],
  // 提高级（NOIP / CSP-S）
  "algo-optimization-tricks": ["提高级"], "algo-divide-conquer-doubling": ["提高级"],
  "string-basics": ["提高级"], "search-advanced": ["提高级"],
  "ds-heap-bit": ["提高级"], "ds-segtree": ["提高级"],
  "graph-tree": ["提高级"], "graph-shortest-path": ["提高级"], "graph-mst": ["提高级"],
  "graph-connectivity": ["提高级"],
  "dp-intro": ["入门级", "提高级"], "dp-linear": ["提高级"], "dp-interval": ["提高级"],
  "dp-tree-graph": ["提高级"], "dp-bitmask": ["提高级"], "dp-optimization": ["提高级", "NOI级"],
  "math-number-theory": ["提高级", "NOI级"], "math-combinatorics": ["提高级"],
  "math-probability": ["提高级", "NOI级"], "math-linear-algebra": ["提高级"],
  // NOI 级
  "ds-segtree-advanced": ["NOI级"], "math-geometry": ["NOI级"],
  "string-advanced": ["NOI级"], "graph-network-flow": ["NOI级"],
  "math-game-theory": ["提高级", "NOI级"], "ds-block-mo": ["提高级", "NOI级"],
};

const LANQIAO_NODE_GROUPS = {
  // 大学 C 组（基础）
  "algo-simulation-bigint": ["大学C组"], "algo-sorting": ["大学C组"], "algo-enumeration": ["大学C组"],
  "algo-search-basics": ["大学C组"], "algo-greedy": ["大学C组"], "algo-binary-search": ["大学C组"],
  "dp-intro": ["大学C组"], "ds-linear-list": ["大学C组"], "math-basics": ["大学C组"],
  // 大学 B 组（进阶，含 C 组）
  "algo-recurrence-recursion": ["大学B组"], "algo-prefix-diff-discretize": ["大学B组"],
  "algo-optimization-tricks": ["大学B组"], "algo-divide-conquer-doubling": ["大学B组"],
  "string-basics": ["大学B组"], "search-advanced": ["大学B组"], "ds-binary-tree": ["大学B组"],
  "ds-set": ["大学B组"], "ds-heap-bit": ["大学B组"], "ds-graph-basics": ["大学B组"],
  "dp-linear": ["大学B组"], "dp-interval": ["大学B组"], "dp-tree-graph": ["大学B组"],
  "dp-bitmask": ["大学B组"], "dp-optimization": ["大学B组"],
  "graph-tree": ["大学B组"], "graph-shortest-path": ["大学B组"], "graph-mst": ["大学B组"],
  "graph-connectivity": ["大学B组"], "math-number-theory": ["大学B组"],
  "math-combinatorics": ["大学B组"], "math-linear-algebra": ["大学B组"],
  // 大学 A 组（高阶，含 B、C 组）
  "ds-segtree": ["大学A组"], "ds-segtree-advanced": ["大学A组"], "string-advanced": ["大学A组"],
  "graph-network-flow": ["大学A组"], "math-geometry": ["大学A组"], "math-probability": ["大学A组"],
  "math-game-theory": ["大学A组"], "ds-block-mo": ["大学A组"],
};

// ---------------------------------------------------------------------------
// 6. 罗勇军《算法竞赛》节号 → 节点 id
// ---------------------------------------------------------------------------
const LUO_SECTION_TO_NODE = {
  "1.1": "ds-linear-list", "1.2": "ds-linear-list", "1.3": "ds-linear-list",
  "1.4": "ds-binary-tree", "1.5": "ds-heap-bit",
  "2.2": "algo-optimization-tricks", "2.3": "algo-binary-search", "2.4": "algo-binary-search",
  "2.5": "algo-divide-conquer-doubling", "2.6": "algo-prefix-diff-discretize", "2.7": "algo-prefix-diff-discretize",
  "2.8": "algo-sorting", "2.9": "algo-divide-conquer-doubling", "2.10": "algo-greedy",
  "3.1": "algo-search-basics", "3.2": "search-advanced", "3.3": "algo-search-basics",
  "3.5": "search-advanced", "3.8": "search-advanced", "3.9": "search-advanced",
  "4.1": "ds-set", "4.2": "ds-heap-bit", "4.3": "ds-segtree",
  "4.4": "ds-segtree-advanced", "4.5": "ds-segtree-advanced", "4.6": "ds-segtree-advanced",
  "4.7": "graph-tree", "4.8": "graph-tree", "4.9": "graph-tree", "4.10": "graph-tree",
  "4.12": "ds-segtree-advanced", "4.14": "ds-segtree-advanced", "4.15": "ds-segtree-advanced",
  "4.16": "ds-segtree-advanced", "4.17": "ds-segtree-advanced", "4.18": "ds-segtree-advanced",
  "5.1": "dp-intro", "5.2": "dp-linear", "5.3": "dp-linear", "5.4": "dp-bitmask",
  "5.5": "dp-interval", "5.6": "dp-tree-graph",
  "5.7": "dp-optimization", "5.8": "dp-optimization", "5.9": "dp-optimization", "5.10": "dp-optimization",
  "6.3": "math-linear-algebra", "6.4": "math-linear-algebra", "6.5": "math-linear-algebra",
  "6.6": "dp-optimization",
  "6.7": "math-number-theory", "6.8": "math-number-theory", "6.9": "math-number-theory",
  "6.10": "math-number-theory", "6.11": "math-number-theory", "6.13": "math-number-theory",
  "6.14": "math-number-theory", "6.16": "math-number-theory", "6.17": "math-number-theory",
  "7.1": "math-combinatorics", "7.2": "math-combinatorics", "7.3": "math-combinatorics",
  "7.4": "math-combinatorics", "7.5": "math-combinatorics", "7.6": "math-combinatorics",
  "7.7": "math-combinatorics", "7.8": "math-combinatorics", "7.9": "math-combinatorics",
  "8.1": "math-geometry", "8.2": "math-geometry", "8.3": "math-geometry",
  "8.4": "math-geometry", "8.5": "math-geometry", "8.6": "math-geometry", "8.7": "math-geometry",
  "9.1": "string-basics", "9.2": "string-advanced", "9.3": "string-basics",
  "9.4": "string-advanced", "9.5": "string-basics",
  "9.6": "string-advanced", "9.7": "string-advanced", "9.8": "string-advanced",
  "10.2": "ds-graph-basics", "10.3": "graph-connectivity",
  "10.4": "graph-connectivity", "10.5": "graph-connectivity", "10.6": "graph-tree",
  "10.7": "graph-connectivity", "10.8": "graph-shortest-path", "10.9": "graph-mst",
  "10.10": "graph-network-flow", "10.11": "graph-network-flow",
  "10.12": "graph-network-flow", "10.13": "graph-network-flow",
};

// 刘汝佳《算法竞赛入门经典》章节 → 节点 id（按去除章节号后的标题匹配）
function liuChapterNode(title) {
  const t = String(title || "").trim();
  if (t.includes("数学")) return "math-number-theory";
  const map = {
    "数组和字符串": "basics-array",
    "函数与递归": "basics-function-struct",
    "C++与STL入门": "ds-linear-list",
    "数据结构基础": "ds-binary-tree",
    "暴力求解法": "algo-enumeration",
    "高效算法设计": "algo-divide-conquer-doubling",
  };
  return map[t] || null;
}

// ---------------------------------------------------------------------------
// 7. 10 阶段学习路线（每阶段含 id/index/title/subtitle/goal/milestone/
//    difficulty:[低,高]/nodes/reference）
// ---------------------------------------------------------------------------
const PHASES = [
  {
    id: "phase-0", index: 0,
    title: "基础算法",
    subtitle: "模拟与高精度、排序、枚举、递推递归、贪心与二分",
    goal: "掌握基础算法思想与常见套路，具备独立分析并解决中等难度题目的能力。",
    milestone: "完成基础算法题单，能熟练进行贪心与二分建模。",
    difficulty: [3, 5],
    reference: "参考：罗勇军《算法竞赛》第 2 章 基本算法 · 刘汝佳《算法竞赛入门经典》第 7 章 暴力求解法 · NOI 大纲·入门级",
    nodes: ["algo-simulation-bigint", "algo-sorting", "algo-enumeration", "algo-recurrence-recursion", "algo-greedy", "algo-binary-search", "math-basics"],
  },
  {
    id: "phase-1", index: 1,
    title: "搜索与基础数据结构",
    subtitle: "DFS/BFS 搜索、线性表、二叉树、集合并查集与图的基本应用",
    goal: "理解搜索框架与基础数据结构的原理，能运用它们解决图与集合类问题。",
    milestone: "完成搜索与基础数据结构题单，独立实现栈队列链表与并查集。",
    difficulty: [3, 7],
    reference: "参考：罗勇军《算法竞赛》第 1、3 章 · 刘汝佳《算法竞赛入门经典》第 6 章 数据结构基础 · NOI 大纲·入门级/提高级",
    nodes: ["algo-search-basics", "ds-linear-list", "ds-binary-tree", "ds-set", "ds-graph-basics"],
  },
  {
    id: "phase-2", index: 2,
    title: "中级算法与数据结构",
    subtitle: "前缀和差分离散化、优化技巧、分治倍增、字符串算法、进阶搜索与线段树",
    goal: "掌握中级算法与数据结构，形成从暴力到优化的问题解决能力。",
    milestone: "完成中级题单，线段树与 KMP/Trie 等字符串算法运用熟练。",
    difficulty: [5, 8],
    reference: "参考：罗勇军《算法竞赛》第 2、4、9 章 · 刘汝佳《算法竞赛入门经典》第 8 章 高效算法设计 · NOI 大纲·提高级",
    nodes: ["algo-prefix-diff-discretize", "algo-optimization-tricks", "algo-divide-conquer-doubling", "string-basics", "search-advanced", "ds-heap-bit", "ds-segtree"],
  },
  {
    id: "phase-3", index: 3,
    title: "动态规划",
    subtitle: "从 DP 引入到线性、区间、树图、状压 DP 及优化技巧",
    goal: "建立完整的动态规划思维，掌握经典模型并能识别与套用。",
    milestone: "完成各阶段 DP 题单，能独立推导状态转移并优化复杂度。",
    difficulty: [4, 8],
    reference: "参考：罗勇军《算法竞赛》第 5 章 动态规划 · NOI 大纲·入门级/提高级 · 蓝桥杯·大学 B 组",
    nodes: ["dp-intro", "dp-linear", "dp-interval", "dp-tree-graph", "dp-bitmask", "dp-optimization"],
  },
  {
    id: "phase-4", index: 4,
    title: "图论",
    subtitle: "树、最短路、最小生成树与连通性",
    goal: "掌握图论核心算法，能对实际问题进行图论建模。",
    milestone: "完成图论题单，最短路与 Tarjan 系列算法熟练运用。",
    difficulty: [6, 8],
    reference: "参考：罗勇军《算法竞赛》第 4、10 章 · NOI 大纲·提高级 · 蓝桥杯·大学 B 组",
    nodes: ["graph-tree", "graph-shortest-path", "graph-mst", "graph-connectivity"],
  },
  {
    id: "phase-5", index: 5,
    title: "数学进阶",
    subtitle: "进阶数论、组合数学、概率统计、基础线性代数与博弈论",
    goal: "构建竞赛数学知识体系，能解决数论与计数类综合问题。",
    milestone: "完成数学进阶题单，数论与组合计数工具运用自如。",
    difficulty: [7, 9],
    reference: "参考：罗勇军《算法竞赛》第 6、7 章 · 刘汝佳《算法竞赛入门经典》第 10 章 数学概念与方法 · NOI 大纲·提高级",
    nodes: ["math-number-theory", "math-combinatorics", "math-probability", "math-linear-algebra", "math-game-theory"],
  },
  {
    id: "phase-6", index: 6,
    title: "高级专题",
    subtitle: "线段树进阶、计算几何、字符串进阶、网络流与分块莫队等 NOI 级专题",
    goal: "掌握高级数据结构与专题算法，具备冲击 NOI 级难题的能力。",
    milestone: "完成高级专题题单，能综合运用多种高级技巧解题。",
    difficulty: [8, 10],
    reference: "参考：罗勇军《算法竞赛》第 4、8、9、10 章高阶内容 · NOI 大纲·NOI 级 · 蓝桥杯·大学 A 组",
    nodes: ["ds-segtree-advanced", "math-geometry", "string-advanced", "graph-network-flow", "ds-block-mo"],
  },
];

// ---------------------------------------------------------------------------
// 7b. NOI 大纲 / 蓝桥杯考点 → 节点 的算法标签映射规则。
// 两份大纲中的算法标签（知识点）逐条归并进现有 43 个节点：
//   - 节点已有的标签 / 已覆盖的知识点：合并去重（由 Set 去重保证）；
//   - 树中没有的知识点：按规则补挂到对应节点（如 数位DP→线性DP、欧拉回路→图的基本应用）；
//   - 每条规则按顺序 first-match-wins，复合词条在前、通用词条在后，避免误挂
//     （如"堆排序"先于"堆"、"可持久化线段树"先于"线段树"、"拓扑"先于"排序"）。
// 仅收录算法 / 数据结构 / 数学类标签；"基础知识与编程环境""C++ 程序设计"等
// 语言与工具类条目不属于知识树范围，不参与合并。
// ---------------------------------------------------------------------------
function normalizeLabel(s) {
  return String(s || "")
    .replace(/[\s（）()【】\[\],，、；;:：]/g, "")
    .toLowerCase();
}

const NOI_LABEL_RULES = [
  // ===== 排序（复合词条优先于"堆"/"排序"）=====
  { match: "堆排序", node: "algo-sorting" },
  { match: "归并排序", node: "algo-sorting" },
  { match: "快速排序", node: "algo-sorting" },
  { match: "桶排序", node: "algo-sorting" },
  { match: "基数排序", node: "algo-sorting" },
  { match: "冒泡排序", node: "algo-sorting" },
  { match: "选择排序", node: "algo-sorting" },
  { match: "插入排序", node: "algo-sorting" },
  { match: "计数排序", node: "algo-sorting" },
  { match: "拓扑", node: "ds-graph-basics" }, // 拓扑排序 / 有向无环图的拓扑排序
  { match: "排序", node: "algo-sorting" },
  // ===== 高级数据结构（复合词条优先）=====
  { match: "可持久化线段树", node: "ds-segtree-advanced" },
  { match: "可持久化", node: "ds-segtree-advanced" },
  { match: "平衡树", node: "ds-segtree-advanced" },
  { match: "树套树", node: "ds-segtree-advanced" },
  { match: "动态树", node: "ds-segtree-advanced" },
  { match: "k-d树", node: "ds-segtree-advanced" },
  { match: "kd树", node: "ds-segtree-advanced" },
  { match: "虚树", node: "ds-segtree-advanced" },
  { match: "笛卡尔树", node: "ds-segtree-advanced" },
  { match: "动态开点", node: "ds-segtree-advanced" },
  { match: "线段树", node: "ds-segtree" },
  { match: "树状数组", node: "ds-heap-bit" },
  { match: "二叉堆", node: "ds-heap-bit" },
  { match: "优先队列", node: "ds-heap-bit" },
  { match: "左偏树", node: "ds-heap-bit" },
  { match: "二项堆", node: "ds-heap-bit" },
  { match: "可合并堆", node: "ds-heap-bit" },
  { match: "堆", node: "ds-heap-bit" },
  { match: "块状链表", node: "ds-block-mo" },
  { match: "分块", node: "ds-block-mo" },
  { match: "平衡规划", node: "ds-block-mo" },
  { match: "离线", node: "ds-block-mo" },
  { match: "ST表", node: "algo-divide-conquer-doubling" },
  { match: "稀疏表", node: "algo-divide-conquer-doubling" },
  // ===== 树上算法（复合词条优先于"树"）=====
  { match: "树链剖分", node: "graph-tree" },
  { match: "最近公共祖先", node: "graph-tree" },
  { match: "lca", node: "graph-tree" },
  { match: "树上差分", node: "graph-tree" },
  { match: "树的重心", node: "graph-tree" },
  { match: "直径", node: "graph-tree" },
  { match: "dfs序", node: "graph-tree" },
  { match: "欧拉序", node: "graph-tree" },
  { match: "子树和", node: "graph-tree" },
  { match: "基环树", node: "graph-tree" },
  { match: "树型动态规划", node: "dp-tree-graph" },
  { match: "树形dp", node: "dp-tree-graph" },
  { match: "树状数组", node: "ds-heap-bit" },
  { match: "二叉树", node: "ds-binary-tree" },
  { match: "哈夫曼", node: "ds-binary-tree" },
  { match: "二叉搜索", node: "ds-binary-tree" },
  { match: "完全二叉树", node: "ds-binary-tree" },
  { match: "树的定义", node: "ds-binary-tree" },
  { match: "树的表示", node: "ds-binary-tree" },
  { match: "孩子兄弟", node: "ds-binary-tree" },
  // ===== 图论 =====
  { match: "最小树形图", node: "graph-mst" },
  { match: "最小生成树", node: "graph-mst" },
  { match: "prim", node: "graph-mst" },
  { match: "kruskal", node: "graph-mst" },
  { match: "单源次短路", node: "graph-shortest-path" },
  { match: "次短路", node: "graph-shortest-path" },
  { match: "bellman-ford", node: "graph-shortest-path" },
  { match: "dijkstra", node: "graph-shortest-path" },
  { match: "spfa", node: "graph-shortest-path" },
  { match: "floyd", node: "graph-shortest-path" },
  { match: "单源最短路", node: "graph-shortest-path" },
  { match: "最短路", node: "graph-shortest-path" },
  { match: "差分约束", node: "graph-shortest-path" },
  { match: "强连通", node: "graph-connectivity" },
  { match: "双连通", node: "graph-connectivity" },
  { match: "割点", node: "graph-connectivity" },
  { match: "割边", node: "graph-connectivity" },
  { match: "2-sat", node: "graph-connectivity" },
  { match: "连通图", node: "graph-connectivity" },
  { match: "网络流", node: "graph-network-flow" },
  { match: "匈牙利", node: "graph-network-flow" },
  { match: "km算法", node: "graph-network-flow" },
  { match: "一般图的匹配", node: "graph-network-flow" },
  { match: "支配集", node: "graph-network-flow" },
  { match: "独立集", node: "graph-network-flow" },
  { match: "覆盖集", node: "graph-network-flow" },
  { match: "二分图的判定", node: "ds-graph-basics" },
  { match: "偶图", node: "ds-graph-basics" },
  { match: "欧拉图", node: "ds-graph-basics" },
  { match: "欧拉道路", node: "ds-graph-basics" },
  { match: "欧拉回路", node: "ds-graph-basics" },
  { match: "有向无环图", node: "ds-graph-basics" },
  { match: "邻接矩阵", node: "ds-graph-basics" },
  { match: "邻接表", node: "ds-graph-basics" },
  { match: "图的定义", node: "ds-graph-basics" },
  { match: "稀疏图", node: "ds-graph-basics" },
  // ===== 字符串 =====
  { match: "扩展kmp", node: "string-advanced" },
  { match: "kmp", node: "string-basics" },
  { match: "字典树", node: "string-basics" },
  { match: "trie", node: "string-basics" },
  { match: "字符串哈希", node: "string-basics" },
  { match: "字符串匹配", node: "string-basics" },
  { match: "manacher", node: "string-advanced" },
  { match: "ac自动机", node: "string-advanced" },
  { match: "后缀数组", node: "string-advanced" },
  { match: "后缀树", node: "string-advanced" },
  { match: "后缀自动机", node: "string-advanced" },
  { match: "有穷自动机", node: "string-advanced" },
  // ===== 搜索 =====
  { match: "记忆化搜索", node: "search-advanced" },
  { match: "启发式", node: "search-advanced" },
  { match: "迭代加深", node: "search-advanced" },
  { match: "双向广度", node: "search-advanced" },
  { match: "剪枝", node: "search-advanced" },
  { match: "深度优先", node: "algo-search-basics" },
  { match: "广度优先", node: "algo-search-basics" },
  { match: "dfs", node: "algo-search-basics" },
  { match: "bfs", node: "algo-search-basics" },
  { match: "泛洪", node: "algo-search-basics" },
  // ===== 基础算法 =====
  { match: "枚举法", node: "algo-enumeration" },
  { match: "模拟法", node: "algo-simulation-bigint" },
  { match: "贪心法", node: "algo-greedy" },
  { match: "递推法", node: "algo-recurrence-recursion" },
  { match: "递归", node: "algo-recurrence-recursion" },
  { match: "二分法", node: "algo-binary-search" },
  { match: "二分", node: "algo-binary-search" },
  { match: "倍增法", node: "algo-divide-conquer-doubling" },
  { match: "前缀和", node: "algo-prefix-diff-discretize" },
  { match: "差分", node: "algo-prefix-diff-discretize" },
  { match: "离散化", node: "algo-prefix-diff-discretize" },
  { match: "扫描线", node: "math-geometry" },
  { match: "分治", node: "algo-divide-conquer-doubling" },
  { match: "构造思想", node: "algo-divide-conquer-doubling" },
  { match: "高精度", node: "algo-simulation-bigint" },
  // ===== DP =====
  { match: "状态压缩", node: "dp-bitmask" },
  { match: "状压", node: "dp-bitmask" },
  { match: "背包", node: "dp-linear" },
  { match: "一维动态规划", node: "dp-linear" },
  { match: "多维动态规划", node: "dp-linear" },
  { match: "数位dp", node: "dp-linear" },
  { match: "区间类型", node: "dp-interval" },
  { match: "区间", node: "dp-interval" },
  { match: "复杂动态规划", node: "dp-optimization" },
  { match: "常用优化", node: "dp-optimization" },
  { match: "优化", node: "dp-optimization" },
  { match: "动态规划", node: "dp-intro" },
  // ===== 哈希 / 集合 =====
  { match: "多重集合", node: "math-combinatorics" },
  { match: "哈希冲突", node: "ds-set" },
  { match: "数值哈希", node: "ds-set" },
  { match: "哈希", node: "ds-set" },
  { match: "并查集", node: "ds-set" },
  { match: "集合", node: "ds-set" },
  // ===== 线性表 =====
  { match: "单调队列", node: "algo-optimization-tricks" },
  { match: "双端队列", node: "ds-linear-list" },
  { match: "双端栈", node: "ds-linear-list" },
  { match: "链表", node: "ds-linear-list" },
  { match: "栈", node: "ds-linear-list" },
  { match: "队列", node: "ds-linear-list" },
  { match: "vector", node: "ds-linear-list" },
  // ===== 数学：数论 =====
  { match: "扩展欧几里得", node: "math-number-theory" },
  { match: "中国剩余定理", node: "math-number-theory" },
  { match: "欧拉定理", node: "math-number-theory" },
  { match: "欧拉函数", node: "math-number-theory" },
  { match: "费马小定理", node: "math-number-theory" },
  { match: "威尔逊", node: "math-number-theory" },
  { match: "裴蜀", node: "math-number-theory" },
  { match: "逆元", node: "math-number-theory" },
  { match: "同余", node: "math-number-theory" },
  { match: "原根", node: "math-number-theory" },
  { match: "bsgs", node: "math-number-theory" },
  { match: "大步小步", node: "math-number-theory" },
  { match: "狄利克雷", node: "math-number-theory" },
  { match: "dirichlet", node: "math-number-theory" },
  { match: "二次剩余", node: "math-number-theory" },
  { match: "莫比乌斯", node: "math-number-theory" },
  { match: "杜教筛", node: "math-number-theory" },
  { match: "min_25", node: "math-number-theory" },
  // ===== 数学：组合 =====
  { match: "prüfer", node: "math-combinatorics" },
  { match: "斯特林", node: "math-combinatorics" },
  { match: "stirling", node: "math-combinatorics" },
  { match: "burnside", node: "math-combinatorics" },
  { match: "pólya", node: "math-combinatorics" },
  { match: "母函数", node: "math-combinatorics" },
  { match: "置换群", node: "math-combinatorics" },
  { match: "群", node: "math-combinatorics" },
  { match: "错排", node: "math-combinatorics" },
  { match: "圆排列", node: "math-combinatorics" },
  { match: "鸽巢", node: "math-combinatorics" },
  { match: "二项式定理", node: "math-combinatorics" },
  { match: "容斥", node: "math-combinatorics" },
  { match: "卡特兰", node: "math-combinatorics" },
  { match: "catalan", node: "math-combinatorics" },
  { match: "排列", node: "math-combinatorics" },
  { match: "组合", node: "math-combinatorics" },
  { match: "杨辉三角", node: "math-combinatorics" },
  { match: "加法原理", node: "math-combinatorics" },
  { match: "乘法原理", node: "math-combinatorics" },
  // ===== 数学：线性代数 / 高等数学 =====
  { match: "高斯消元", node: "math-linear-algebra" },
  { match: "线性基", node: "math-linear-algebra" },
  { match: "逆矩阵", node: "math-linear-algebra" },
  { match: "行列式", node: "math-linear-algebra" },
  { match: "线性相关", node: "math-linear-algebra" },
  { match: "向量", node: "math-linear-algebra" },
  { match: "矩阵", node: "math-linear-algebra" },
  { match: "单纯形", node: "math-linear-algebra" },
  { match: "快速傅里叶", node: "math-linear-algebra" },
  { match: "fft", node: "math-linear-algebra" },
  { match: "泰勒", node: "math-linear-algebra" },
  { match: "微分", node: "math-linear-algebra" },
  { match: "积分", node: "math-linear-algebra" },
  // ===== 数学：概率 / 信息论 =====
  { match: "条件概率", node: "math-probability" },
  { match: "贝叶斯", node: "math-probability" },
  { match: "概率", node: "math-probability" },
  { match: "期望", node: "math-probability" },
  { match: "方差", node: "math-probability" },
  { match: "熵", node: "math-probability" },
  { match: "互信息", node: "math-probability" },
  { match: "信息复杂度", node: "math-probability" },
  { match: "描述复杂度", node: "math-probability" },
  { match: "通讯复杂度", node: "math-probability" },
  // ===== 数学：博弈论 =====
  { match: "尼姆", node: "math-game-theory" },
  { match: "nim", node: "math-game-theory" },
  { match: "sg函数", node: "math-game-theory" },
  { match: "博弈", node: "math-game-theory" },
  // ===== 数学：基础 =====
  { match: "复杂度分析", node: "math-basics" },
  { match: "时间复杂度", node: "math-basics" },
  { match: "空间复杂度", node: "math-basics" },
  { match: "整除", node: "math-basics" },
  { match: "因数", node: "math-basics" },
  { match: "质数", node: "math-basics" },
  { match: "素数", node: "math-basics" },
  { match: "取整", node: "math-basics" },
  { match: "模运算", node: "math-basics" },
  { match: "唯一分解", node: "math-basics" },
  { match: "辗转相除", node: "math-basics" },
  { match: "欧几里得", node: "math-basics" },
  { match: "筛法", node: "math-basics" },
  // ===== 计算几何 =====
  { match: "凸包", node: "math-geometry" },
  { match: "半平面交", node: "math-geometry" },
  { match: "点、线、面", node: "math-geometry" },
  { match: "图形面积", node: "math-geometry" },
  { match: "几何", node: "math-geometry" },
  // 通用词条（放在最后，避免抢先命中复合词条）
  { match: "树", node: "ds-binary-tree" },
];

// NOI 大纲中 STL 容器等完整条目 → 节点的精确匹配（键为原始文本，查找时规范化）
const NOI_LABEL_EXACT = {
  "集合(set)、多重集合(multiset)": "ds-set",
  "映射(map)、多重映射(multimap)": "ds-set",
  "位集合(bitset)": "ds-set",
  "栈(stack)、队列(queue)、链表(list)、向量(vector)等容器": "ds-linear-list",
  "双端队列(deque)、优先队列(priority_queue)": "ds-heap-bit",
  "进制与进制转换：二进制、八进制、十进制、十六进制": "math-basics",
};

const LANQIAO_LABEL_RULES = [
  // 排序（"堆排序"先于"堆"）
  { match: "堆排序", node: "algo-sorting" },
  { match: "归并排序", node: "algo-sorting" },
  { match: "快速排序", node: "algo-sorting" },
  { match: "桶排序", node: "algo-sorting" },
  { match: "基数排序", node: "algo-sorting" },
  { match: "冒泡排序", node: "algo-sorting" },
  { match: "选择排序", node: "algo-sorting" },
  { match: "插入排序", node: "algo-sorting" },
  { match: "拓扑序列", node: "ds-graph-basics" },
  { match: "拓扑", node: "ds-graph-basics" },
  // 搜索
  { match: "双向bfs", node: "search-advanced" },
  { match: "记忆化搜索", node: "search-advanced" },
  { match: "迭代加深", node: "search-advanced" },
  { match: "启发式", node: "search-advanced" },
  { match: "剪枝", node: "search-advanced" },
  { match: "bfs、dfs", node: "algo-search-basics" },
  { match: "dfs序", node: "graph-tree" },
  { match: "bfs", node: "algo-search-basics" },
  { match: "dfs", node: "algo-search-basics" },
  // DP
  { match: "背包dp", node: "dp-linear" },
  { match: "树形dp", node: "dp-tree-graph" },
  { match: "状压dp", node: "dp-bitmask" },
  { match: "数位dp", node: "dp-linear" },
  { match: "dp的常见优化", node: "dp-optimization" },
  { match: "dp", node: "dp-linear" },
  { match: "普通一维", node: "dp-linear" },
  // 字符串
  { match: "manacher", node: "string-advanced" },
  { match: "哈希", node: "string-basics" },
  { match: "kmp", node: "string-basics" },
  // 图论
  { match: "欧拉回路", node: "ds-graph-basics" },
  { match: "最小生成树", node: "graph-mst" },
  { match: "单源最短路", node: "graph-shortest-path" },
  { match: "差分约束", node: "graph-shortest-path" },
  { match: "二分图匹配", node: "graph-network-flow" },
  { match: "图的连通性", node: "graph-connectivity" },
  { match: "割点", node: "graph-connectivity" },
  { match: "桥", node: "graph-connectivity" },
  { match: "强连通", node: "graph-connectivity" },
  { match: "lca", node: "graph-tree" },
  { match: "最近共同祖先", node: "graph-tree" },
  { match: "树链剖分", node: "graph-tree" },
  // 数学
  { match: "排列组合", node: "math-combinatorics" },
  { match: "二项式定理", node: "math-combinatorics" },
  { match: "容斥原理", node: "math-combinatorics" },
  { match: "模意义下的逆元", node: "math-number-theory" },
  { match: "矩阵运算", node: "math-linear-algebra" },
  { match: "高斯消元", node: "math-linear-algebra" },
  { match: "初等数论", node: "math-basics" },
  // 数据结构
  { match: "树状数组", node: "ds-heap-bit" },
  { match: "st表", node: "algo-divide-conquer-doubling" },
  { match: "堆", node: "ds-heap-bit" },
  { match: "动态开点", node: "ds-segtree-advanced" },
  { match: "平衡树", node: "ds-segtree-advanced" },
  { match: "可持久化", node: "ds-segtree-advanced" },
  { match: "树套树", node: "ds-segtree-advanced" },
  { match: "动态树", node: "ds-segtree-advanced" },
  // 基础
  { match: "枚举", node: "algo-enumeration" },
  { match: "模拟", node: "algo-simulation-bigint" },
  { match: "贪心", node: "algo-greedy" },
  { match: "二分", node: "algo-binary-search" },
  { match: "高精度", node: "algo-simulation-bigint" },
  { match: "链表", node: "ds-linear-list" },
  { match: "栈", node: "ds-linear-list" },
  { match: "队列", node: "ds-linear-list" },
];

// 把一批大纲条目（{ text, diff }）按规则归并，返回 Map<nodeId, Set<labelText>>
// exactRules：完整条目文本 → 节点 id，优先于子串规则精确命中。
function matchSyllabusLabels(points, rules, exactRules = {}) {
  const exactNorm = {};
  for (const [key, nodeId] of Object.entries(exactRules)) {
    exactNorm[normalizeLabel(key)] = nodeId;
  }
  const hits = new Map();
  for (const pt of points) {
    const text = String(pt.text || pt.name || "").trim();
    if (!text) continue;
    const norm = normalizeLabel(text);
    const exact = exactNorm[norm];
    if (exact) {
      if (!hits.has(exact)) hits.set(exact, new Set());
      hits.get(exact).add(text);
      continue;
    }
    for (const rule of rules) {
      if (norm.includes(normalizeLabel(rule.match))) {
        if (!hits.has(rule.node)) hits.set(rule.node, new Set());
        hits.get(rule.node).add(text);
        break;
      }
    }
  }
  return hits;
}

const NOI_LEVEL_ORDER = ["入门级", "提高级", "NOI级"];
const LANQIAO_GROUP_ORDER = ["大学C组", "大学B组", "大学A组"];

function sortByOrder(values, order) {
  return [...values].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

// ---------------------------------------------------------------------------
// 8. 解析洛谷题单 txt：### 分组 → #### 【编号】标题 → [problem:平台-题号] 行
// ---------------------------------------------------------------------------
function parseSource() {
  const text = fs.readFileSync(SRC_FILE, "utf8");
  const modules = new Map();
  let currentKey = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("https://")) continue;

    const header = /^#### 【([^】]+)】(.+)$/.exec(line);
    if (header) {
      const key = header[1].trim() + "::" + header[2].trim();
      const nodeId = MODULE_MAP[key];
      if (!nodeId) throw new Error(`未匹配的模块头: ${line}`);
      currentKey = key;
      modules.set(key, { nodeId, txtCount: 0, problems: new Map() });
      continue;
    }

    const pm = /^\[problem:([^\]]+)\](.*)$/.exec(line);
    if (!pm) continue;

    if (!currentKey || !modules.has(currentKey)) {
      console.warn(`[warn] problem 出现在模块外，已跳过: ${line}`);
      continue;
    }
    const content = pm[1].trim();
    const dash = content.indexOf("-");
    if (dash <= 0) throw new Error(`无法解析 platform-number: ${line}`);
    const platformRaw = content.slice(0, dash);
    const number = content.slice(dash + 1);
    const platform = PLATFORM_NORMALIZE[platformRaw] ?? platformRaw;
    if (!VALID_PLATFORMS.includes(platform)) {
      console.warn(`[warn] 非规范平台 "${platformRaw}" 已跳过: ${line}`);
      continue;
    }

    let note = (pm[2] || "").trim();
    if (note.length > 80) note = Array.from(note).slice(0, 80).join("");

    const mod = modules.get(currentKey);
    mod.txtCount += 1;
    if (!mod.problems.has(platform + "|" + number)) {
      mod.problems.set(platform + "|" + number, { platform, number, note });
    }
  }
  return modules;
}

// ---------------------------------------------------------------------------
// 9. 解析罗勇军《算法竞赛》txt：## 章节 → ### X.X 小节（例题：/习题：）→ [problem:]
//    返回 [{ num, title, nodeId, problems: [{platform, number, role}] }]
// ---------------------------------------------------------------------------
function parseLuo() {
  const text = fs.readFileSync(LUO_FILE, "utf8");
  const sections = [];
  let current = null;
  let role = "练习";
  let chapterTitle = "";

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const ch = /^## 第.+章 (.+?)<hr/.exec(line);
    if (ch) {
      chapterTitle = ch[1].trim();
      continue;
    }
    const sec = /^### (\d+\.\d+) (.+?)<hr/.exec(line);
    if (sec) {
      const num = sec[1].trim();
      const nodeId = LUO_SECTION_TO_NODE[num];
      if (!nodeId) {
        console.warn(`[warn] 罗勇军小节 ${num}（${sec[2].trim()}）未映射到节点，跳过`);
      }
      current = { num, title: sec[2].replace(/\\\*/g, "*").trim(), chapter: chapterTitle, nodeId: nodeId || null, problems: [] };
      sections.push(current);
      role = "练习";
      continue;
    }
    if (line === "例题：") { role = "例题"; continue; }
    if (line === "习题：") { role = "习题"; continue; }
    const pm = /^\[problem:([^\]]+)\]/.exec(line);
    if (!pm) continue;
    if (!current || !current.nodeId) continue;
    const content = pm[1].trim();
    const dash = content.indexOf("-");
    if (dash <= 0) continue;
    const platformRaw = content.slice(0, dash);
    const number = content.slice(dash + 1);
    const platform = PLATFORM_NORMALIZE[platformRaw] ?? platformRaw;
    if (!VALID_PLATFORMS.includes(platform)) continue;
    current.problems.push({ platform, number, role });
  }
  return sections.filter((s) => s.nodeId);
}

// ---------------------------------------------------------------------------
// 10. 解析刘汝佳《算法竞赛入门经典》txt：第X章 标题 → [problem:]
//     返回 [{ chapter, nodeId, problems: [{platform, number}] }]
// ---------------------------------------------------------------------------
function parseLiu() {
  const text = fs.readFileSync(LIU_FILE, "utf8");
  const chapters = [];
  let current = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const ch = /^第[一二三四五六七八九十]+章 (.+)$/.exec(line);
    if (ch) {
      const nodeId = liuChapterNode(ch[1].trim());
      if (!nodeId) {
        console.warn(`[warn] 刘汝佳章节 "${ch[1].trim()}" 未映射到节点，跳过`);
      }
      current = { chapter: ch[1].trim(), nodeId: nodeId || null, problems: [] };
      if (nodeId) chapters.push(current);
      continue;
    }
    const pm = /^\[problem:([^\]]+)\]/.exec(line);
    if (!pm || !current || !current.nodeId) continue;
    const content = pm[1].trim();
    const dash = content.indexOf("-");
    if (dash <= 0) continue;
    const platformRaw = content.slice(0, dash);
    const number = content.slice(dash + 1);
    const platform = PLATFORM_NORMALIZE[platformRaw] ?? platformRaw;
    if (!VALID_PLATFORMS.includes(platform)) continue;
    current.problems.push({ platform, number });
  }
  return chapters;
}

// ---------------------------------------------------------------------------
// 11. 解析 NOI 大纲：## 2.x 级别 → ### 2.x.y 类别 → 知识点（[难度]）
//     返回 [{ level, contest, categories: [{title, points: [{diff, text}]}] }]
// ---------------------------------------------------------------------------
function parseNoi() {
  const text = fs.readFileSync(NOI_FILE, "utf8");
  const levels = [];
  let current = null;
  let category = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const lv = /^## 2\.(\d) (.+)$/.exec(line);
    if (lv) {
      const name = lv[2].split("（")[0].replace(/\s+/g, "");
      current = { level: name, contest: lv[2], categories: [] };
      levels.push(current);
      category = null;
      continue;
    }
    if (!current) continue;
    const cat = /^### 2\.\d\.\d+ (.+)$/.exec(line);
    if (cat) {
      category = { title: cat[1].trim(), points: [] };
      current.categories.push(category);
      continue;
    }
    if (!category) continue;
    if (/^\*\*.+\*\*$/.test(line)) continue;
    const pt = /^(?:[-*]|\d+\.)\s*\[(\d+)\]\s*(.+)$/.exec(line);
    if (pt) category.points.push({ diff: Number(pt[1]), text: pt[2].trim() });
  }
  return levels;
}

// ---------------------------------------------------------------------------
// 12. 解析蓝桥杯大纲：## 一/二/三、组别 → ### N. 模块 → - 知识点 [难度]；
//     C 组为表格行。返回 [{ group, modules: [{title, points: [{name, diff}]}] }]
// ---------------------------------------------------------------------------
function parseLanqiao() {
  const text = fs.readFileSync(LANQIAO_FILE, "utf8");
  const groups = [];
  let current = null;
  let module = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const g = /^## (一|二|三)、(.+)$/.exec(line);
    if (g) {
      current = { group: g[2].split("（")[0].replace(/\s+/g, ""), modules: [] };
      groups.push(current);
      module = null;
      continue;
    }
    if (!current) continue;
    const mod = /^### (\d+)\.\s*(.+)$/.exec(line);
    if (mod) {
      module = { title: mod[2].replace(/（.+）$/, "").trim(), points: [] };
      current.modules.push(module);
      continue;
    }
    const row = /^\|\s*(\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(\[[0-9,\-]+\])\s*\|$/.exec(line);
    if (row) {
      module = { title: row[2].trim(), points: [] };
      current.modules.push(module);
      module.points.push({ name: row[3].trim(), diff: row[4].trim() });
      continue;
    }
    const row2 = /^\|\s*\|\s*\|\s*([^|]+)\s*\|\s*(\[[0-9,\-]+\])\s*\|$/.exec(line);
    if (row2 && module) {
      module.points.push({ name: row2[1].trim(), diff: row2[2].trim() });
      continue;
    }
    // A 组双列表格行：| 内容 | [难度] |
    const rowA = /^\|\s*([^|]+)\s*\|\s*(\[[0-9,\-]+\])\s*\|$/.exec(line);
    if (rowA && module) {
      module.points.push({ name: rowA[1].trim(), diff: rowA[2].trim() });
      continue;
    }
    if (!module) continue;
    const pt = /^-\s*(.+?)\s*(\[[0-9\-]+\])$/.exec(line);
    if (pt) module.points.push({ name: pt[1].trim(), diff: pt[2].trim() });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// 13. 节点 ref 计算（多来源标注）
// ---------------------------------------------------------------------------
function buildRef(nodeId, hasLuogu, luoProblems, liuProblems) {
  const parts = [];
  if (hasLuogu) parts.push("洛谷·深入浅出");
  if (luoProblems.length) {
    const nums = [...new Set(luoProblems.map((s) => s.num))].slice(0, 8);
    parts.push(`罗勇军《算法竞赛》${nums.join("/")}`);
  }
  const liuCh = [...new Set(liuProblems.map((c) => c.chapter))].slice(0, 2);
  if (liuCh.length) parts.push(`刘汝佳《算法竞赛入门经典》${liuCh.join("/")}`);
  const noi = NOI_NODE_LEVELS[nodeId];
  if (noi && noi.length) parts.push(`NOI 大纲·${noi.join("/")}`);
  const lq = LANQIAO_NODE_GROUPS[nodeId];
  if (lq && lq.length) parts.push(`蓝桥杯·${lq.join("/")}`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// 14. 生成 43 个普通节点（洛谷 + 罗勇军 + 刘汝佳 + CF + 新节点补充题，来源去重）
// ---------------------------------------------------------------------------
function buildNodes(modules, luoSections, liuChapters, oiTreeDetails, syllabusMerges) {
  const nodes = [];
  const problemsByNode = new Map();
  const cfSupplement = loadCfSupplement();
  const luoguMeta = loadLuoguMeta();

  // 汇总某节点的 NOI/蓝桥杯算法标签（合并去重、排序）与级别/组别（原有标注 ∪ 标签推导）
  function nodeSyllabus(nodeId) {
    const noiLabels = [...(syllabusMerges.noiLabels.get(nodeId) || [])].sort((a, b) => a.localeCompare(b, "zh-CN"));
    const lanqiaoLabels = [...(syllabusMerges.lanqiaoLabels.get(nodeId) || [])].sort((a, b) => a.localeCompare(b, "zh-CN"));
    const noiLevels = sortByOrder(
      new Set([...(NOI_NODE_LEVELS[nodeId] || []), ...(syllabusMerges.noiLevelSet.get(nodeId) || [])]),
      NOI_LEVEL_ORDER
    );
    const lanqiao = sortByOrder(
      new Set([...(LANQIAO_NODE_GROUPS[nodeId] || []), ...(syllabusMerges.lanqiaoGroupSet.get(nodeId) || [])]),
      LANQIAO_GROUP_ORDER
    );
    return { noiLabels, lanqiaoLabels, noiLevels, lanqiao };
  }

  for (const meta of NODE_META) {
    const problems = [];
    const byKey = new Map();
    // push 支持富化：同一道题已存在时，补充 name/rating/tags/difficulty（保留先来的 source/role）。
    // 洛谷题单富化：从 luogu-problem-meta.json 按「平台|题号」补齐官方题名与难度（任意来源的洛谷题都生效）。
    const push = (platform, number, source, role, note, extra = {}) => {
      const metaEntry = luoguMeta.get(platform + "|" + number);
      if (metaEntry) {
        if (!extra.name && metaEntry.name) extra = { ...extra, name: metaEntry.name };
        if (extra.difficulty == null && metaEntry.difficulty) extra = { ...extra, difficulty: metaEntry.difficulty };
      }
      const key = platform + "|" + number;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.name && extra.name) existing.name = extra.name;
        if (existing.rating == null && extra.rating != null) existing.rating = extra.rating;
        if ((!existing.tags || !existing.tags.length) && extra.tags && extra.tags.length) existing.tags = extra.tags;
        if (existing.difficulty == null && extra.difficulty) existing.difficulty = extra.difficulty;
        return;
      }
      const problem = { platform, number, name: extra.name || "", source, role, note: note || "" };
      if (extra.rating != null) problem.rating = extra.rating;
      if (extra.tags && extra.tags.length) problem.tags = extra.tags;
      if (extra.difficulty) problem.difficulty = extra.difficulty;
      byKey.set(key, problem);
      problems.push(problem);
    };

    // 1) 洛谷题单（最高优先级）
    let luoguMod = null;
    for (const [, m] of modules) {
      if (m.nodeId === meta.id) { luoguMod = m; break; }
    }
    if (luoguMod) {
      for (const p of luoguMod.problems.values()) {
        push(p.platform, p.number, "洛谷深入浅出", "练习", p.note);
      }
    }
    // 2) Codeforces 补充（CF_SUPPLEMENTS 清单）
    for (const num of CF_SUPPLEMENTS[meta.id] || []) {
      push("Codeforces", num, "Codeforces", "练习", "");
    }
    // 3) Codeforces 补充（curriculum/cf-supplement.json：精选 / fetch-codeforces.js 生成）
    for (const entry of cfSupplement[meta.id] || []) {
      push("Codeforces", entry.number, entry.source || "Codeforces·精选", "练习", entry.note || "", entry);
    }
    // 4) 罗勇军《算法竞赛》（每节点上限保护）
    const luoProblems = luoSections.filter((s) => s.nodeId === meta.id);
    let luoAdded = 0;
    for (const s of luoProblems) {
      for (const p of s.problems) {
        if (luoAdded >= MAX_LUO_PER_NODE) break;
        const before = problems.length;
        push(p.platform, p.number, "罗勇军·算法竞赛", p.role, "");
        if (problems.length > before) luoAdded += 1;
      }
      if (luoAdded >= MAX_LUO_PER_NODE) break;
    }
    // 5) 刘汝佳《算法竞赛入门经典》（每节点上限保护）
    const liuProblems = liuChapters.filter((c) => c.nodeId === meta.id);
    let liuAdded = 0;
    for (const c of liuProblems) {
      for (const p of c.problems) {
        if (liuAdded >= MAX_LIU_PER_NODE) break;
        const before = problems.length;
        push(p.platform, p.number, "刘汝佳·算法竞赛入门经典", "练习", "");
        if (problems.length > before) liuAdded += 1;
      }
      if (liuAdded >= MAX_LIU_PER_NODE) break;
    }
    // 6) 新增节点的洛谷模板题补充
    for (const num of NEW_NODE_LUOGU[meta.id] || []) {
      push("洛谷", num, "洛谷", "练习", "");
    }

    if (problems.length === 0) throw new Error(`节点 ${meta.id} 无题目`);
    const capped = problems.slice(0, MAX_PROBLEMS_PER_NODE);

    // OI 知识树覆盖（tree.txt 合并：主题 → 细节列表）
    const oiTree = [];
    for (const [topic, details] of oiTreeDetails) {
      if (OI_TOPIC_TO_NODE[topic] !== meta.id) continue;
      oiTree.push(details.length ? `${topic}（${details.join(" / ")}）` : topic);
    }

    // NOI 大纲 / 蓝桥杯考点算法标签合并
    const { noiLabels, lanqiaoLabels, noiLevels, lanqiao } = nodeSyllabus(meta.id);

    nodes.push({
      id: meta.id,
      title: meta.title,
      listId: meta.listId,
      group: meta.group,
      difficulty: meta.difficulty,
      prerequisites: meta.prerequisites,
      wiki: meta.wiki,
      tags: meta.tags,
      description: meta.description,
      noiLevels,
      lanqiao,
      noiLabels,
      lanqiaoLabels,
      ref: buildRef(meta.id, !!luoguMod, luoProblems, liuProblems),
      oiTree,
      problems: capped,
    });
    problemsByNode.set(meta.id, capped);
  }

  // OI 知识树带来的全新专题节点（博弈论、分块与莫队）
  for (const def of OI_NEW_NODES) {
    const problems = [];
    const byKey = new Map();
    const push = (platform, number, source, role, note, extra = {}) => {
      const metaEntry = luoguMeta.get(platform + "|" + number);
      if (metaEntry) {
        if (!extra.name && metaEntry.name) extra = { ...extra, name: metaEntry.name };
        if (extra.difficulty == null && metaEntry.difficulty) extra = { ...extra, difficulty: metaEntry.difficulty };
      }
      const key = platform + "|" + number;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.name && extra.name) existing.name = extra.name;
        if (existing.rating == null && extra.rating != null) existing.rating = extra.rating;
        if ((!existing.tags || !existing.tags.length) && extra.tags && extra.tags.length) existing.tags = extra.tags;
        if (existing.difficulty == null && extra.difficulty) existing.difficulty = extra.difficulty;
        return;
      }
      const problem = { platform, number, name: extra.name || "", source, role, note: note || "" };
      if (extra.rating != null) problem.rating = extra.rating;
      if (extra.tags && extra.tags.length) problem.tags = extra.tags;
      if (extra.difficulty) problem.difficulty = extra.difficulty;
      byKey.set(key, problem);
      problems.push(problem);
    };
    for (const p of def.problems) push(p.platform, p.number, p.source, p.role, p.note, p);
    for (const entry of cfSupplement[def.id] || []) {
      push("Codeforces", entry.number, entry.source || "Codeforces·精选", "练习", entry.note || "", entry);
    }
    if (problems.length === 0) throw new Error(`节点 ${def.id} 无题目`);
    // OI 知识树覆盖（新节点同样合并 tree.txt 主题）
    const oiTree = [];
    for (const [topic, details] of oiTreeDetails) {
      if (OI_TOPIC_TO_NODE[topic] !== def.id) continue;
      oiTree.push(details.length ? `${topic}（${details.join(" / ")}）` : topic);
    }
    // NOI 大纲 / 蓝桥杯考点算法标签合并（新节点同样参与）
    const { noiLabels, lanqiaoLabels, noiLevels, lanqiao } = nodeSyllabus(def.id);
    nodes.push({
      id: def.id,
      title: def.title,
      listId: def.listId,
      group: def.group,
      difficulty: def.difficulty,
      prerequisites: def.prerequisites,
      wiki: def.wiki,
      tags: def.tags,
      description: def.description,
      noiLevels,
      lanqiao,
      noiLabels,
      lanqiaoLabels,
      ref: buildRef(def.id, false, [], []),
      oiTree,
      problems: problems.slice(0, MAX_PROBLEMS_PER_NODE),
    });
    problemsByNode.set(def.id, problems);
  }
  return { nodes, problemsByNode };
}

// ---------------------------------------------------------------------------
// 15. 汇总 NOI 大纲 / 蓝桥杯考点 → 节点的算法标签归并结果。
//     按级别/组别分别匹配，返回：
//       noiLabels / lanqiaoLabels: Map<nodeId, Set<labelText>>
//       noiLevelSet / lanqiaoGroupSet: Map<nodeId, Set<级别|组别>>
// ---------------------------------------------------------------------------
function collectSyllabusMerges(noiLevels, lanqiaoGroups) {
  const noiLabels = new Map();
  const noiLevelSet = new Map();
  for (const lv of noiLevels) {
    const points = [];
    for (const cat of lv.categories || []) {
      for (const p of cat.points || []) points.push({ text: p.text, diff: p.diff });
    }
    const hits = matchSyllabusLabels(points, NOI_LABEL_RULES, NOI_LABEL_EXACT);
    for (const [nodeId, labels] of hits) {
      if (!noiLabels.has(nodeId)) noiLabels.set(nodeId, new Set());
      for (const label of labels) noiLabels.get(nodeId).add(label);
      if (!noiLevelSet.has(nodeId)) noiLevelSet.set(nodeId, new Set());
      noiLevelSet.get(nodeId).add(lv.level);
    }
  }

  const lanqiaoLabels = new Map();
  const lanqiaoGroupSet = new Map();
  for (const g of lanqiaoGroups) {
    const points = [];
    for (const m of g.modules || []) {
      for (const p of m.points || []) points.push({ text: p.name, diff: p.diff });
    }
    const hits = matchSyllabusLabels(points, LANQIAO_LABEL_RULES);
    for (const [nodeId, labels] of hits) {
      if (!lanqiaoLabels.has(nodeId)) lanqiaoLabels.set(nodeId, new Set());
      for (const label of labels) lanqiaoLabels.get(nodeId).add(label);
      if (!lanqiaoGroupSet.has(nodeId)) lanqiaoGroupSet.set(nodeId, new Set());
      lanqiaoGroupSet.get(nodeId).add(g.group);
    }
  }

  return { noiLabels, noiLevelSet, lanqiaoLabels, lanqiaoGroupSet };
}

function writeJson(filePath, data, label) {
  if (fs.existsSync(filePath) && !FORCE) {
    console.log(`[skip] ${label} 已存在（用 --force 覆盖）`);
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`[write] ${label}`);
  return true;
}

function main() {
  const modules = parseSource();
  const luoSections = parseLuo();
  const liuChapters = parseLiu();
  const noiLevels = parseNoi();
  const lanqiaoGroups = parseLanqiao();
  const oiTreeDetails = parseOiTree();

  const syllabusMerges = collectSyllabusMerges(noiLevels, lanqiaoGroups);
  const { nodes } = buildNodes(modules, luoSections, liuChapters, oiTreeDetails, syllabusMerges);
  const allNodes = nodes;

  // 校验阶段并集 = 全部节点
  const nodeIds = allNodes.map((n) => n.id);
  const roadmapIds = PHASES.flatMap((p) => p.nodes);
  const union = [...new Set(roadmapIds)].sort();
  const sorted = [...nodeIds].sort();
  if (JSON.stringify(union) !== JSON.stringify(sorted)) {
    const missing = nodeIds.filter((id) => !roadmapIds.includes(id));
    const extra = [...new Set(roadmapIds)].filter((id) => !nodeIds.includes(id));
    throw new Error(`roadmap 阶段 nodes 并集 != 节点集合。缺失=${missing.join(",")} 多余=${extra.join(",")}`);
  }

  // 写节点
  let written = 0;
  for (const node of allNodes) {
    if (writeJson(path.join(NODES_DIR, node.id + ".json"), node, `节点 ${node.id}`)) written++;
  }
  if (writeJson(ROADMAP_FILE, PHASES, "roadmap.json")) written++;

  // NOI/蓝桥杯标签归并统计
  let noiCount = 0;
  let lanqiaoCount = 0;
  for (const n of allNodes) {
    noiCount += (n.noiLabels || []).length;
    lanqiaoCount += (n.lanqiaoLabels || []).length;
  }

  console.log("\n===== 数据来源统计 =====");
  const countBySource = {};
  for (const n of allNodes) {
    for (const p of n.problems) countBySource[p.source] = (countBySource[p.source] || 0) + 1;
  }
  for (const [src, cnt] of Object.entries(countBySource).sort((a, b) => b[1] - a[1])) {
    console.log(`${src}: ${cnt} 题`);
  }
  console.log(`\n洛谷模块数=${modules.size} 罗勇军小节数=${luoSections.length} 刘汝佳章节数=${liuChapters.length}`);
  console.log(`NOI 级别数=${noiLevels.length} 蓝桥杯组别数=${lanqiaoGroups.length} OI知识树主题数=${oiTreeDetails.size}`);
  console.log(`节点数=${allNodes.length} 阶段数=${PHASES.length} 写入文件数=${written}`);
  console.log(`NOI 大纲标签归并 ${noiCount} 条、蓝桥杯考点标签归并 ${lanqiaoCount} 条（已合并进对应节点）`);
}

main();
