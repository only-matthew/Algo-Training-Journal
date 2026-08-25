// scripts/convert-curriculum.js
// 生成学习路线数据层（多源合并）：
//   - curriculum/nodes/<id>.json  43 个知识点节点（40 原有 + 计算几何/字符串进阶/网络流）
//   - curriculum/nodes/<id>.json  6 个 NOI 大纲 / 蓝桥杯知识清单节点
//   - curriculum/roadmap.json     10 阶段学习路线（含 NOI 大纲、蓝桥杯知识树分支）
// 数据来源（只读）：
//   - know-tree/Luogu-深入浅出.txt（洛谷题单，题源主目录）
//   - know-tree/罗勇军-算法竞赛.txt（罗勇军《算法竞赛》各节例题/习题）
//   - know-tree/刘汝佳.txt（刘汝佳《算法竞赛入门经典》各章练习）
//   - know-tree/NOI_竞赛大纲_2025.md（difficulty 参考 + NOI 大纲知识树）
//   - know-tree/蓝桥杯_软件赛竞赛大纲_第十七届.md（蓝桥杯考点知识树）
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
  {
    id: "phase-7", index: 7,
    title: "NOI 竞赛大纲（2025）",
    subtitle: "按 CCF《NOI 竞赛大纲（2025 年修订版）》分级：入门级（CSP-J）/ 提高级（NOIP·CSP-S）/ NOI 级",
    goal: "对照 NOI 大纲三级知识清单自检，明确各级别应掌握的知识点与配套练习。",
    milestone: "完成各级知识清单题单，覆盖对应级别全部考点。",
    difficulty: [1, 10],
    reference: "依据：CCF《NOI 竞赛大纲（2025 年修订版）》",
    nodes: ["noi-basic", "noi-intermediate", "noi-advanced"],
  },
  {
    id: "phase-8", index: 8,
    title: "蓝桥杯考点（第十七届）",
    subtitle: "按《第十七届蓝桥杯大赛软件赛竞赛大纲》分大学 C / B / A 组考点清单",
    goal: "对照蓝桥杯三组考点清单训练，覆盖各组别竞赛考点。",
    milestone: "完成各组考点题单，按组别难度递进刷题。",
    difficulty: [1, 10],
    reference: "依据：《第十七届蓝桥杯大赛软件赛竞赛大纲》",
    nodes: ["lq-c", "lq-b", "lq-a"],
  },
];

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

function truncate(s, n) {
  const arr = Array.from(String(s || ""));
  return arr.length > n ? arr.slice(0, n).join("") + "…" : arr.join("");
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
function buildNodes(modules, luoSections, liuChapters, oiTreeDetails) {
  const nodes = [];
  const problemsByNode = new Map();
  const cfSupplement = loadCfSupplement();

  for (const meta of NODE_META) {
    const problems = [];
    const byKey = new Map();
    // push 支持富化：同一道题已存在时，补充 name/rating/tags（保留先来的 source/role）
    const push = (platform, number, source, role, note, extra = {}) => {
      const key = platform + "|" + number;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.name && extra.name) existing.name = extra.name;
        if (existing.rating == null && extra.rating != null) existing.rating = extra.rating;
        if ((!existing.tags || !existing.tags.length) && extra.tags && extra.tags.length) existing.tags = extra.tags;
        return;
      }
      const problem = { platform, number, name: extra.name || "", source, role, note: note || "" };
      if (extra.rating != null) problem.rating = extra.rating;
      if (extra.tags && extra.tags.length) problem.tags = extra.tags;
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
      noiLevels: NOI_NODE_LEVELS[meta.id] || [],
      lanqiao: LANQIAO_NODE_GROUPS[meta.id] || [],
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
      const key = platform + "|" + number;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.name && extra.name) existing.name = extra.name;
        if (existing.rating == null && extra.rating != null) existing.rating = extra.rating;
        if ((!existing.tags || !existing.tags.length) && extra.tags && extra.tags.length) existing.tags = extra.tags;
        return;
      }
      const problem = { platform, number, name: extra.name || "", source, role, note: note || "" };
      if (extra.rating != null) problem.rating = extra.rating;
      if (extra.tags && extra.tags.length) problem.tags = extra.tags;
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
      noiLevels: def.noiLevels || [],
      lanqiao: def.lanqiao || [],
      ref: buildRef(def.id, false, [], []),
      oiTree,
      problems: problems.slice(0, MAX_PROBLEMS_PER_NODE),
    });
    problemsByNode.set(def.id, problems);
  }
  return { nodes, problemsByNode };
}

// 代表性练习：从若干节点各取前 maxPer 题（跨节点去重，上限 cap）
function pickProblems(nodeIds, problemsByNode, maxPer, cap) {
  const out = [];
  const seen = new Set();
  for (const id of nodeIds) {
    const probs = problemsByNode.get(id) || [];
    let added = 0;
    for (const p of probs) {
      const key = p.platform + "|" + p.number;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ platform: p.platform, number: p.number, name: "", source: p.source, role: "练习", note: "" });
      added += 1;
      if (added >= maxPer || out.length >= cap) break;
    }
    if (out.length >= cap) break;
  }
  return out;
}

function noiNodeDescription(levelData, contestLine) {
  const cats = levelData.categories.map((c) => {
    const pts = c.points.slice(0, 12).map((p) => truncate(p.text, 30));
    const more = c.points.length > 12 ? `；…（共 ${c.points.length} 项）` : "";
    return `【${c.title}】${pts.join("；")}${more}`;
  });
  return `${contestLine}\n${cats.join("\n")}`;
}

function lanqiaoNodeDescription(groupData, contestLine) {
  const mods = groupData.modules.map((m) => {
    const pts = m.points.slice(0, 12).map((p) => `${p.name} ${p.diff}`);
    const more = m.points.length > 12 ? `；…（共 ${m.points.length} 项）` : "";
    return `【${m.title}】${pts.join("；")}${more}`;
  });
  return `${contestLine}\n${mods.join("\n")}`;
}

// ---------------------------------------------------------------------------
// 15. NOI 大纲 / 蓝桥杯 知识清单节点（知识树分支）
// ---------------------------------------------------------------------------
const NOI_POOL = {
  "noi-basic": ["algo-simulation-bigint", "algo-sorting", "algo-enumeration", "algo-recurrence-recursion", "algo-greedy", "algo-binary-search", "algo-search-basics", "ds-linear-list", "ds-binary-tree", "ds-set", "ds-graph-basics", "math-basics", "algo-prefix-diff-discretize"],
  "noi-intermediate": ["algo-optimization-tricks", "algo-divide-conquer-doubling", "string-basics", "search-advanced", "ds-heap-bit", "ds-segtree", "graph-tree", "graph-shortest-path", "graph-mst", "graph-connectivity", "dp-intro", "dp-linear", "dp-interval", "dp-tree-graph", "dp-bitmask", "math-number-theory", "math-combinatorics", "math-probability", "math-linear-algebra"],
  "noi-advanced": ["ds-segtree-advanced", "math-geometry", "string-advanced", "graph-network-flow", "dp-optimization", "math-number-theory", "math-probability"],
};

const LANQIAO_POOL = {
  "lq-c": ["algo-simulation-bigint", "algo-sorting", "algo-enumeration", "algo-search-basics", "algo-greedy", "algo-binary-search", "dp-intro", "ds-linear-list", "math-basics"],
  "lq-b": ["algo-recurrence-recursion", "algo-prefix-diff-discretize", "algo-optimization-tricks", "algo-divide-conquer-doubling", "string-basics", "search-advanced", "ds-binary-tree", "ds-set", "ds-heap-bit", "ds-graph-basics", "dp-linear", "dp-interval", "dp-tree-graph", "dp-bitmask", "dp-optimization", "graph-tree", "graph-shortest-path", "graph-mst", "graph-connectivity", "math-number-theory", "math-combinatorics", "math-linear-algebra"],
  "lq-a": ["ds-segtree", "ds-segtree-advanced", "string-advanced", "graph-network-flow", "math-geometry", "math-probability"],
};

function buildKnowledgeNodes(noiLevels, lanqiaoGroups, problemsByNode) {
  const noiById = {};
  for (const lv of noiLevels) {
    const key = lv.level === "入门级" ? "noi-basic" : lv.level === "提高级" ? "noi-intermediate" : "noi-advanced";
    noiById[key] = lv;
  }
  const lqById = {};
  for (const g of lanqiaoGroups) {
    const m = /大学([A-Z])组/.exec(g.group);
    if (m) lqById["lq-" + m[1].toLowerCase()] = g;
  }

  const defs = [
    { id: "noi-basic", title: "入门级（CSP-J）", listId: "NOI·入门级", group: "NOI大纲", difficulty: 3, prerequisites: [], pick: 4, cap: 40, wiki: "https://oi-wiki.org/intro/", tags: ["NOI大纲", "CSP-J"], noi: "入门级" },
    { id: "noi-intermediate", title: "提高级（NOIP / CSP-S）", listId: "NOI·提高级", group: "NOI大纲", difficulty: 6, prerequisites: ["noi-basic"], pick: 3, cap: 36, wiki: "https://oi-wiki.org/intro/", tags: ["NOI大纲", "NOIP", "CSP-S"], noi: "提高级" },
    { id: "noi-advanced", title: "NOI 级", listId: "NOI·NOI级", group: "NOI大纲", difficulty: 9, prerequisites: ["noi-intermediate"], pick: 2, cap: 24, wiki: "https://oi-wiki.org/intro/", tags: ["NOI大纲", "NOI级"], noi: "NOI级" },
    { id: "lq-c", title: "大学 C 组（基础）", listId: "蓝桥杯·C组", group: "蓝桥杯", difficulty: 4, prerequisites: [], pick: 3, cap: 36, wiki: "", tags: ["蓝桥杯", "大学C组"], lanqiao: "大学C组" },
    { id: "lq-b", title: "大学 B 组（进阶）", listId: "蓝桥杯·B组", group: "蓝桥杯", difficulty: 6, prerequisites: ["lq-c"], pick: 3, cap: 36, wiki: "", tags: ["蓝桥杯", "大学B组"], lanqiao: "大学B组" },
    { id: "lq-a", title: "大学 A 组（高阶）", listId: "蓝桥杯·A组", group: "蓝桥杯", difficulty: 8, prerequisites: ["lq-b"], pick: 2, cap: 24, wiki: "", tags: ["蓝桥杯", "大学A组"], lanqiao: "大学A组" },
  ];

  const nodes = [];
  for (const d of defs) {
    const isNoi = d.noi != null;
    const src = isNoi ? noiById[d.id] : lqById[d.id];
    const pool = isNoi ? NOI_POOL[d.id] : LANQIAO_POOL[d.id];
    const contestLine = isNoi
      ? `CCF《NOI 竞赛大纲（2025 年修订版）》${d.title}（难度系数对应 ${d.noi === "入门级" ? "1-5" : d.noi === "提高级" ? "5-8" : "7-10"}）知识点清单：`
      : `《第十七届蓝桥杯大赛软件赛竞赛大纲》${d.title}（难度 1-10 递进）考点清单：`;
    const description = isNoi
      ? (src ? noiNodeDescription(src, contestLine) : contestLine)
      : (src ? lanqiaoNodeDescription(src, contestLine) : contestLine);
    const problems = pickProblems(pool || [], problemsByNode, d.pick, d.cap);
    if (problems.length === 0) throw new Error(`知识节点 ${d.id} 无题目`);

    nodes.push({
      id: d.id,
      title: d.title,
      listId: d.listId,
      group: d.group,
      difficulty: d.difficulty,
      prerequisites: d.prerequisites,
      wiki: d.wiki,
      tags: d.tags,
      description,
      noiLevels: isNoi ? [d.noi] : [],
      lanqiao: isNoi ? [] : [d.lanqiao],
      ref: isNoi ? "依据：CCF《NOI 竞赛大纲（2025 年修订版）》" : "依据：《第十七届蓝桥杯大赛软件赛竞赛大纲》",
      problems,
    });
  }
  return nodes;
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

  const { nodes, problemsByNode } = buildNodes(modules, luoSections, liuChapters, oiTreeDetails);
  const knowledgeNodes = buildKnowledgeNodes(noiLevels, lanqiaoGroups, problemsByNode);
  const allNodes = [...nodes, ...knowledgeNodes];

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
  console.log(`节点数=${allNodes.length}（普通 ${nodes.length} + 知识清单 ${knowledgeNodes.length}） 阶段数=${PHASES.length} 写入文件数=${written}`);
}

main();
