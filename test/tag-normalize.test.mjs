import test from "node:test";
import assert from "node:assert/strict";
import { LOG_LIMITS, normalizeMeta, validateLogInput } from "../lib/log-schema.mjs";

// ============================================================
// CASE NORMALIZATION (大小写归一化)
// ============================================================

test("大小写：Dfs/dFs/dfs/DFS/DfS 全部归一为 DFS 并去重", () => {
  const r = validateLogInput({ problems: [{ id: "t1", name: "X", tags: "Dfs, dFs, dfs, DFS, DfS" }] });
  assert.deepEqual(r.problems[0].tags, ["DFS"]);
});

test("大小写：dp/Dp/dP/DP 全部归一为 DP", () => {
  const r = validateLogInput({ problems: [{ id: "t2", name: "X", tags: "dp, Dp, dP, DP" }] });
  assert.deepEqual(r.problems[0].tags, ["DP"]);
});

test("大小写：bfs/Bfs/bFs/bFS 全部归一为 BFS", () => {
  const r = validateLogInput({ problems: [{ id: "t3", name: "X", tags: "bfs, Bfs, bFs, bFS" }] });
  assert.deepEqual(r.problems[0].tags, ["BFS"]);
});

test("大小写：lca/Lca/LCa/lcA 全部归一为 LCA", () => {
  const r = validateLogInput({ problems: [{ id: "t4", name: "X", tags: "lca, Lca, LCa, lcA" }] });
  assert.deepEqual(r.problems[0].tags, ["LCA"]);
});

test("大小写：kmp/Kmp/kMp 全部归一为 KMP", () => {
  const r = validateLogInput({ problems: [{ id: "t5", name: "X", tags: "kmp, Kmp, kMp" }] });
  assert.deepEqual(r.problems[0].tags, ["KMP"]);
});

test("大小写：Lis/LcS/rmQ 分别归一为 LIS/LCS/RMQ", () => {
  const r = validateLogInput({ problems: [{ id: "t6", name: "X", tags: "Lis, LcS, rmQ" }] });
  assert.deepEqual(r.problems[0].tags, ["LIS", "LCS", "RMQ"]);
});

test("大小写：spfa/SpFa/SPFA 全部归一为 SPFA", () => {
  const r = validateLogInput({ problems: [{ id: "t7", name: "X", tags: "spfa, SpFa, SPFA" }] });
  assert.deepEqual(r.problems[0].tags, ["SPFA"]);
});

test("大小写：crt/Crt/crT 全部归一为 CRT", () => {
  const r = validateLogInput({ problems: [{ id: "t8", name: "X", tags: "crt, Crt, crT" }] });
  assert.deepEqual(r.problems[0].tags, ["CRT"]);
});

test("大小写：fFt/NtT/FwT/fmT/lCt 批量归一为 FFT/NTT/FWT/FMT/LCT", () => {
  const r = validateLogInput({ problems: [{ id: "t9", name: "X", tags: "fFt, NtT, FwT, fmT, lCt" }] });
  assert.deepEqual(r.problems[0].tags, ["FFT", "NTT", "FWT", "FMT", "LCT"]);
});

test("大小写：trie 归一为混合大小写的规范形式 Trie（非 TRIE）", () => {
  const r = validateLogInput({ problems: [{ id: "t10", name: "X", tags: "trie" }] });
  assert.deepEqual(r.problems[0].tags, ["Trie"]);
});

test("大小写：Trie/trie/TRIE 不同大小写全部去重为 Trie", () => {
  const r = validateLogInput({ problems: [{ id: "t11", name: "X", tags: "Trie, trie, TRIE" }] });
  assert.deepEqual(r.problems[0].tags, ["Trie"]);
});

test("大小写：nim 归一为混合大小写规范形式 Nim（非 NIM）", () => {
  const r = validateLogInput({ problems: [{ id: "t12", name: "X", tags: "nim" }] });
  assert.deepEqual(r.problems[0].tags, ["Nim"]);
});

test("大小写：Nim/nim/NIM 全部去重为 Nim", () => {
  const r = validateLogInput({ problems: [{ id: "t13", name: "X", tags: "Nim, nim, NIM" }] });
  assert.deepEqual(r.problems[0].tags, ["Nim"]);
});

test("大小写：sgt 通过别名映射为中文标签 SG函数（非纯大小写变换）", () => {
  const r = validateLogInput({ problems: [{ id: "t14", name: "X", tags: "sgt" }] });
  assert.deepEqual(r.problems[0].tags, ["SG函数"]);
});

test("大小写：sgt/Sgt/SGT 全部去重为 SG函数", () => {
  const r = validateLogInput({ problems: [{ id: "t15", name: "X", tags: "sgt, Sgt, SGT" }] });
  assert.deepEqual(r.problems[0].tags, ["SG函数"]);
});

test("大小写：pam/Pam/PAM 全部归一为 PAM", () => {
  const r = validateLogInput({ problems: [{ id: "t16", name: "X", tags: "pam, Pam, PAM" }] });
  assert.deepEqual(r.problems[0].tags, ["PAM"]);
});

test("大小写：不在映射表中的纯拉丁标签原样保留", () => {
  const r = validateLogInput({ problems: [{ id: "t17", name: "X", tags: "unknown, xyz, hello" }] });
  assert.deepEqual(r.problems[0].tags, ["unknown", "xyz", "hello"]);
});

test("大小写：中文标签中嵌入的拉丁缩写大小写归一（递推dp→递推DP→拆分为[递推,DP]）", () => {
  const r = validateLogInput({ problems: [{ id: "t18", name: "X", tags: "递推dp" }] });
  assert.deepEqual(r.problems[0].tags, ["递推", "DP"]);
});

test("大小写：中文标签中嵌入的混合大小写拉丁缩写归一（贪心Dp→贪心DP→拆分为[贪心,DP]）", () => {
  const r = validateLogInput({ problems: [{ id: "t19", name: "X", tags: "贪心Dp" }] });
  assert.deepEqual(r.problems[0].tags, ["贪心", "DP"]);
});

test("大小写：中文标签中嵌入拉丁缩写但整体未匹配复合/别名时保留", () => {
  const r = validateLogInput({ problems: [{ id: "t20", name: "X", tags: "sam算法" }] });
  assert.deepEqual(r.problems[0].tags, ["SAM算法"]);
});

// ============================================================
// ALIAS MAPPING (别名映射)
// ============================================================

test("别名：深搜→DFS，广搜→BFS，动态规划→DP", () => {
  const r = validateLogInput({ problems: [{ id: "a1", name: "X", tags: "深搜, 广搜, 动态规划" }] });
  assert.deepEqual(r.problems[0].tags, ["DFS", "BFS", "DP"]);
});

test("别名：深度优先搜索→DFS，广度优先搜索→BFS", () => {
  const r = validateLogInput({ problems: [{ id: "a2", name: "X", tags: "深度优先搜索, 广度优先搜索" }] });
  assert.deepEqual(r.problems[0].tags, ["DFS", "BFS"]);
});

test("别名：贪心算法→贪心", () => {
  const r = validateLogInput({ problems: [{ id: "a3", name: "X", tags: "贪心算法" }] });
  assert.deepEqual(r.problems[0].tags, ["贪心"]);
});

test("别名：枚举法→枚举，模拟法→模拟，递归法→递归", () => {
  const r = validateLogInput({ problems: [{ id: "a4", name: "X", tags: "枚举法, 模拟法, 递归法" }] });
  assert.deepEqual(r.problems[0].tags, ["枚举", "模拟", "递归"]);
});

test("别名：递推法→递推，分治法→分治，哈希法→哈希", () => {
  const r = validateLogInput({ problems: [{ id: "a5", name: "X", tags: "递推法, 分治法, 哈希法" }] });
  assert.deepEqual(r.problems[0].tags, ["递推", "分治", "哈希"]);
});

test("别名：大模拟→模拟，大数→高精度，大整数→高精度（去重）", () => {
  const r = validateLogInput({ problems: [{ id: "a6", name: "X", tags: "大模拟, 大数, 大整数" }] });
  assert.deepEqual(r.problems[0].tags, ["模拟", "高精度"]);
});

test("别名：记忆化→记忆化搜索", () => {
  const r = validateLogInput({ problems: [{ id: "a7", name: "X", tags: "记忆化" }] });
  assert.deepEqual(r.problems[0].tags, ["记忆化搜索"]);
});

test("别名：启发式→启发式搜索，迭代加深→迭代加深搜索", () => {
  const r = validateLogInput({ problems: [{ id: "a8", name: "X", tags: "启发式, 迭代加深" }] });
  assert.deepEqual(r.problems[0].tags, ["启发式搜索", "迭代加深搜索"]);
});

test("别名：字典树→Trie，回文自动机→PAM，回文树→PAM（去重）", () => {
  const r = validateLogInput({ problems: [{ id: "a9", name: "X", tags: "字典树, 回文自动机, 回文树" }] });
  assert.deepEqual(r.problems[0].tags, ["Trie", "PAM"]);
});

test("别名：缩点→强连通分量，强连通→强连通分量（去重）", () => {
  const r = validateLogInput({ problems: [{ id: "a10", name: "X", tags: "缩点, 强连通" }] });
  assert.deepEqual(r.problems[0].tags, ["强连通分量"]);
});

test("别名：割点→双连通分量，桥→双连通分量，欧拉路径→欧拉回路", () => {
  const r = validateLogInput({ problems: [{ id: "a11", name: "X", tags: "割点, 桥, 欧拉路径" }] });
  assert.deepEqual(r.problems[0].tags, ["双连通分量", "欧拉回路"]);
});

test("别名：主席树→可持久化线段树，BIT→树状数组", () => {
  const r = validateLogInput({ problems: [{ id: "a12", name: "X", tags: "主席树, BIT" }] });
  assert.deepEqual(r.problems[0].tags, ["可持久化线段树", "树状数组"]);
});

test("别名：bit小写也映射为树状数组", () => {
  const r = validateLogInput({ problems: [{ id: "a13", name: "X", tags: "bit" }] });
  assert.deepEqual(r.problems[0].tags, ["树状数组"]);
});

test("别名：最大公约数→gcd，裴蜀定理→Bézout定理", () => {
  const r = validateLogInput({ problems: [{ id: "a14", name: "X", tags: "最大公约数, 裴蜀定理" }] });
  assert.deepEqual(r.problems[0].tags, ["gcd", "Bézout定理"]);
});

test("别名：费马小定理→逆元，欧拉筛→线性筛", () => {
  const r = validateLogInput({ problems: [{ id: "a15", name: "X", tags: "费马小定理, 欧拉筛" }] });
  assert.deepEqual(r.problems[0].tags, ["逆元", "线性筛"]);
});

test("别名：空格形式 wqs 二分→wqs二分", () => {
  const r = validateLogInput({ problems: [{ id: "a16", name: "X", tags: "wqs 二分" }] });
  assert.deepEqual(r.problems[0].tags, ["wqs二分"]);
});

test("别名：空格形式 st 表→ST表（大小写+空格归一）", () => {
  const r = validateLogInput({ problems: [{ id: "a17", name: "X", tags: "st 表" }] });
  assert.deepEqual(r.problems[0].tags, ["ST表"]);
});

test("别名：深搜+DFS去重为DFS", () => {
  const r = validateLogInput({ problems: [{ id: "a18", name: "X", tags: "深搜, DFS" }] });
  assert.deepEqual(r.problems[0].tags, ["DFS"]);
});

test("别名：深搜+广搜+dfs+bfs+深度优先搜索+广度优先搜索→DFS/BFS", () => {
  const r = validateLogInput({ problems: [{ id: "a19", name: "X", tags: "深搜, 广搜, dfs, bfs, 深度优先搜索, 广度优先搜索" }] });
  assert.deepEqual(r.problems[0].tags, ["DFS", "BFS"]);
});

test("别名：sam→后缀自动机", () => {
  const r = validateLogInput({ problems: [{ id: "a20", name: "X", tags: "sam" }] });
  assert.deepEqual(r.problems[0].tags, ["后缀自动机"]);
});

test("别名：sa→后缀数组", () => {
  const r = validateLogInput({ problems: [{ id: "a21", name: "X", tags: "sa" }] });
  assert.deepEqual(r.problems[0].tags, ["后缀数组"]);
});

test("别名：DLX→Dancing Links", () => {
  const r = validateLogInput({ problems: [{ id: "a22", name: "X", tags: "dlx" }] });
  assert.deepEqual(r.problems[0].tags, ["Dancing Links"]);
});

test("别名：manacher→Manacher", () => {
  const r = validateLogInput({ problems: [{ id: "a23", name: "X", tags: "manacher" }] });
  assert.deepEqual(r.problems[0].tags, ["Manacher"]);
});

test("别名：扩展kmp→Z函数", () => {
  const r = validateLogInput({ problems: [{ id: "a24", name: "X", tags: "扩展kmp" }] });
  assert.deepEqual(r.problems[0].tags, ["Z函数"]);
});

test("别名：dsu→并查集", () => {
  const r = validateLogInput({ problems: [{ id: "a25", name: "X", tags: "dsu" }] });
  assert.deepEqual(r.problems[0].tags, ["并查集"]);
});

test("别名：brute force→暴力", () => {
  const r = validateLogInput({ problems: [{ id: "a26", name: "X", tags: "brute force" }] });
  assert.deepEqual(r.problems[0].tags, ["暴力"]);
});

test("别名：已在规范集中的中文标签原样保留", () => {
  const r = validateLogInput({ problems: [{ id: "a27", name: "X", tags: "随机化, 打表, 高精度" }] });
  assert.deepEqual(r.problems[0].tags, ["随机化", "打表", "高精度"]);
});

test("别名：已在规范集中的拉丁标签原样保留", () => {
  const r = validateLogInput({ problems: [{ id: "a28", name: "X", tags: "LCA, FFT, NTT" }] });
  assert.deepEqual(r.problems[0].tags, ["LCA", "FFT", "NTT"]);
});

// ============================================================
// COMPOUND SPLITTING (复合标签拆分)
// ============================================================

test("复合拆分：暴力枚举→[暴力, 枚举]", () => {
  const r = validateLogInput({ problems: [{ id: "c1", name: "X", tags: "暴力枚举" }] });
  assert.deepEqual(r.problems[0].tags, ["暴力", "枚举"]);
});

test("复合拆分：暴力搜索→[暴力, 搜索]", () => {
  const r = validateLogInput({ problems: [{ id: "c2", name: "X", tags: "暴力搜索" }] });
  assert.deepEqual(r.problems[0].tags, ["暴力", "搜索"]);
});

test("复合拆分：贪心枚举→[贪心, 枚举]", () => {
  const r = validateLogInput({ problems: [{ id: "c3", name: "X", tags: "贪心枚举" }] });
  assert.deepEqual(r.problems[0].tags, ["贪心", "枚举"]);
});

test("复合拆分：贪心排序→[贪心, 排序]", () => {
  const r = validateLogInput({ problems: [{ id: "c4", name: "X", tags: "贪心排序" }] });
  assert.deepEqual(r.problems[0].tags, ["贪心", "排序"]);
});

test("复合拆分：贪心DP→[贪心, DP]", () => {
  const r = validateLogInput({ problems: [{ id: "c5", name: "X", tags: "贪心DP" }] });
  assert.deepEqual(r.problems[0].tags, ["贪心", "DP"]);
});

test("复合拆分：二分搜索→[二分, 搜索]", () => {
  const r = validateLogInput({ problems: [{ id: "c6", name: "X", tags: "二分搜索" }] });
  assert.deepEqual(r.problems[0].tags, ["二分", "搜索"]);
});

test("复合拆分：二分枚举→[二分, 枚举]", () => {
  const r = validateLogInput({ problems: [{ id: "c7", name: "X", tags: "二分枚举" }] });
  assert.deepEqual(r.problems[0].tags, ["二分", "枚举"]);
});

test("复合拆分：模拟搜索→[模拟, 搜索]", () => {
  const r = validateLogInput({ problems: [{ id: "c8", name: "X", tags: "模拟搜索" }] });
  assert.deepEqual(r.problems[0].tags, ["模拟", "搜索"]);
});

test("复合拆分：递归搜索→[递归, 搜索]", () => {
  const r = validateLogInput({ problems: [{ id: "c9", name: "X", tags: "递归搜索" }] });
  assert.deepEqual(r.problems[0].tags, ["递归", "搜索"]);
});

test("复合拆分：分治递归→[分治, 递归]", () => {
  const r = validateLogInput({ problems: [{ id: "c10", name: "X", tags: "分治递归" }] });
  assert.deepEqual(r.problems[0].tags, ["分治", "递归"]);
});

test("复合拆分：DFS剪枝→[DFS, 剪枝]", () => {
  const r = validateLogInput({ problems: [{ id: "c11", name: "X", tags: "DFS剪枝" }] });
  assert.deepEqual(r.problems[0].tags, ["DFS", "剪枝"]);
});

test("复合拆分：位运算DP→[位运算, DP]", () => {
  const r = validateLogInput({ problems: [{ id: "c12", name: "X", tags: "位运算DP" }] });
  assert.deepEqual(r.problems[0].tags, ["位运算", "DP"]);
});

test("复合拆分：树形搜索→[树, 搜索]", () => {
  const r = validateLogInput({ problems: [{ id: "c13", name: "X", tags: "树形搜索" }] });
  assert.deepEqual(r.problems[0].tags, ["树", "搜索"]);
});

test("复合拆分：图论搜索→[图论, 搜索]", () => {
  const r = validateLogInput({ problems: [{ id: "c14", name: "X", tags: "图论搜索" }] });
  assert.deepEqual(r.problems[0].tags, ["图论", "搜索"]);
});

test("复合拆分：字符串DP→[字符串, DP]", () => {
  const r = validateLogInput({ problems: [{ id: "c15", name: "X", tags: "字符串DP" }] });
  assert.deepEqual(r.problems[0].tags, ["字符串", "DP"]);
});

test("复合拆分：线段树分治→[线段树, 分治]", () => {
  const r = validateLogInput({ problems: [{ id: "c16", name: "X", tags: "线段树分治" }] });
  assert.deepEqual(r.problems[0].tags, ["线段树", "分治"]);
});

test("复合拆分：记忆化DP→[记忆化搜索, DP]（子标签走别名）", () => {
  const r = validateLogInput({ problems: [{ id: "c17", name: "X", tags: "记忆化DP" }] });
  assert.deepEqual(r.problems[0].tags, ["记忆化搜索", "DP"]);
});

test("复合拆分：KMP自动机→[KMP, AC自动机]", () => {
  const r = validateLogInput({ problems: [{ id: "c18", name: "X", tags: "KMP自动机" }] });
  assert.deepEqual(r.problems[0].tags, ["KMP", "AC自动机"]);
});

test("复合拆分：线段树树状数组→[线段树, 树状数组]", () => {
  const r = validateLogInput({ problems: [{ id: "c19", name: "X", tags: "线段树树状数组" }] });
  assert.deepEqual(r.problems[0].tags, ["线段树", "树状数组"]);
});

test("复合拆分：双指针滑动窗口→[双指针, 滑动窗口]", () => {
  const r = validateLogInput({ problems: [{ id: "c20", name: "X", tags: "双指针滑动窗口" }] });
  assert.deepEqual(r.problems[0].tags, ["双指针", "滑动窗口"]);
});

test("复合拆分：贪心枚举DP→[贪心, 枚举, DP]（三项拆分）", () => {
  const r = validateLogInput({ problems: [{ id: "c21", name: "X", tags: "贪心枚举DP" }] });
  assert.deepEqual(r.problems[0].tags, ["贪心", "枚举", "DP"]);
});

test("复合拆分：矩阵快速幂→[矩阵乘法, 快速幂]", () => {
  const r = validateLogInput({ problems: [{ id: "c22", name: "X", tags: "矩阵快速幂" }] });
  assert.deepEqual(r.problems[0].tags, ["矩阵乘法", "快速幂"]);
});

test("复合拆分：DFS搜索→[DFS]（单项拆分，unwrapped为标量）", () => {
  const r = validateLogInput({ problems: [{ id: "c23", name: "X", tags: "DFS搜索" }] });
  assert.deepEqual(r.problems[0].tags, ["DFS"]);
});

test("复合拆分：BFS搜索→[BFS]（单项拆分）", () => {
  const r = validateLogInput({ problems: [{ id: "c24", name: "X", tags: "BFS搜索" }] });
  assert.deepEqual(r.problems[0].tags, ["BFS"]);
});

test("复合拆分：贪心构造走复合→[贪心, 构造]（不经过别名映射为贪心）", () => {
  const r = validateLogInput({ problems: [{ id: "c25", name: "X", tags: "贪心构造" }] });
  assert.deepEqual(r.problems[0].tags, ["贪心", "构造"]);
});

test("复合拆分：贪心算法走别名→[贪心]（不经过复合）", () => {
  const r = validateLogInput({ problems: [{ id: "c26", name: "X", tags: "贪心算法" }] });
  assert.deepEqual(r.problems[0].tags, ["贪心"]);
});

test("复合拆分：贪心构造+贪心算法→去重为[贪心, 构造]", () => {
  const r = validateLogInput({ problems: [{ id: "c27", name: "X", tags: "贪心构造, 贪心算法" }] });
  assert.deepEqual(r.problems[0].tags, ["贪心", "构造"]);
});

test("复合拆分：范围dp→[区间DP]（单项拆分）", () => {
  const r = validateLogInput({ problems: [{ id: "c28", name: "X", tags: "范围dp" }] });
  assert.deepEqual(r.problems[0].tags, ["区间DP"]);
});

test("复合拆分：未在复合表中的标签原样通过（搜索DFS→[搜索DFS]）", () => {
  const r = validateLogInput({ problems: [{ id: "c29", name: "X", tags: "搜索DFS" }] });
  assert.deepEqual(r.problems[0].tags, ["搜索DFS"]);
});

test("复合拆分：模拟搜索+DFS剪枝+暴力搜索+搜索→去重后[模拟,搜索,DFS,剪枝,暴力]", () => {
  const r = validateLogInput({ problems: [{ id: "c30", name: "X", tags: "模拟搜索，DFS剪枝, 暴力搜索, 搜索" }] });
  assert.deepEqual(r.problems[0].tags, ["模拟", "搜索", "DFS", "剪枝", "暴力"]);
});

// ============================================================
// COMBINED SCENARIOS (组合场景)
// ============================================================

test("组合：分离器+复合+去重（暴力/枚举/暴力枚举→[暴力,枚举]）", () => {
  const r = validateLogInput({ problems: [{ id: "x1", name: "X", tags: "暴力, 枚举, 暴力枚举" }] });
  assert.deepEqual(r.problems[0].tags, ["暴力", "枚举"]);
});

test("组合：拉丁大小写+别名+去重（Dfs/DFS/深搜→[DFS]）", () => {
  const r = validateLogInput({ problems: [{ id: "x2", name: "X", tags: "Dfs,DFS,深搜" }] });
  assert.deepEqual(r.problems[0].tags, ["DFS"]);
});

test("组合：递推dp+dfs搜索+深搜+dp→去重为[递推,DP,DFS]", () => {
  const r = validateLogInput({ problems: [{ id: "x3", name: "X", tags: "递推dp, dfs搜索, 深搜, dp" }] });
  assert.deepEqual(r.problems[0].tags, ["递推", "DP", "DFS"]);
});

test("组合：AC自动机DP→复合拆分→[AC自动机, DP]", () => {
  const r = validateLogInput({ problems: [{ id: "x4", name: "X", tags: "AC自动机DP" }] });
  assert.deepEqual(r.problems[0].tags, ["AC自动机", "DP"]);
});

test("组合：记忆化dp→大小写归一→记忆化DP→复合拆分→[记忆化搜索,DP]", () => {
  const r = validateLogInput({ problems: [{ id: "x5", name: "X", tags: "记忆化dp" }] });
  assert.deepEqual(r.problems[0].tags, ["记忆化搜索", "DP"]);
});

test("组合：STL容器→复合拆分→[STL]（复合优先于别名）", () => {
  const r = validateLogInput({ problems: [{ id: "x6", name: "X", tags: "STL容器" }] });
  assert.deepEqual(r.problems[0].tags, ["STL"]);
});

test("组合：最短路DP→复合拆分→[最短路, DP]", () => {
  const r = validateLogInput({ problems: [{ id: "x7", name: "X", tags: "最短路DP" }] });
  assert.deepEqual(r.problems[0].tags, ["最短路", "DP"]);
});

test("组合：大模拟搜索→未命中任何复合/别名→原样通过", () => {
  const r = validateLogInput({ problems: [{ id: "x8", name: "X", tags: "大模拟搜索" }] });
  assert.deepEqual(r.problems[0].tags, ["大模拟搜索"]);
});

test("组合：博弈论DP→[博弈论, DP]", () => {
  const r = validateLogInput({ problems: [{ id: "x9", name: "X", tags: "博弈论DP" }] });
  assert.deepEqual(r.problems[0].tags, ["博弈论", "DP"]);
});

test("组合：概率DP→[概率, DP]", () => {
  const r = validateLogInput({ problems: [{ id: "x10", name: "X", tags: "概率DP" }] });
  assert.deepEqual(r.problems[0].tags, ["概率", "DP"]);
});

test("组合：期望DP→[期望, DP]", () => {
  const r = validateLogInput({ problems: [{ id: "x11", name: "X", tags: "期望DP" }] });
  assert.deepEqual(r.problems[0].tags, ["期望", "DP"]);
});

// ============================================================
// EDGE CASES & LIMITS (边界与限制)
// ============================================================

test("边界：超过30字符的标签抛出RangeError", () => {
  assert.throws(
    () => validateLogInput({ problems: [{ id: "e1", name: "X", tags: "x".repeat(31) }] }),
    /每个标签不能超过 30 个字符/,
  );
});

test("边界：复合拆分后超过10个标签→抛出RangeError", () => {
  const tags = "贪心枚举DP, 暴力搜索, 模拟搜索, 分治递归, 二分枚举, 树形搜索, 图论搜索";
  assert.throws(
    () => validateLogInput({ problems: [{ id: "e2", name: "X", tags }] }),
    /每道题最多填写 10 个标签/,
  );
});

test("边界：normalizeMeta在超过10个时截断（不抛出异常）", () => {
  const tags = "贪心枚举DP, 暴力搜索, 模拟搜索, 分治递归, 二分枚举, 树形搜索, 图论搜索";
  const result = normalizeMeta({ problems: [{ name: "X", tags }] });
  assert.equal(result.problems[0].tags.length, 10);
});

test("边界：空字符串返回空数组", () => {
  const r = validateLogInput({ problems: [{ id: "e3", name: "X", tags: "" }] });
  assert.deepEqual(r.problems[0].tags, []);
});

test("边界：纯分隔符返回空数组", () => {
  const r = validateLogInput({ problems: [{ id: "e4", name: "X", tags: "   ,   ，  " }] });
  assert.deepEqual(r.problems[0].tags, []);
});

test("边界：仅空白/分隔符返回空数组", () => {
  const r = validateLogInput({ problems: [{ id: "e5", name: "X", tags: "，,、" }] });
  assert.deepEqual(r.problems[0].tags, []);
});

test("边界：null标签返回空数组", () => {
  const r = validateLogInput({ problems: [{ id: "e6", name: "X", tags: null }] });
  assert.deepEqual(r.problems[0].tags, []);
});

test("边界：undefined标签返回空数组", () => {
  const r = validateLogInput({ problems: [{ id: "e7", name: "X" }] });
  assert.deepEqual(r.problems[0].tags, []);
});

test("边界：特殊字符（点号、方括号）原样通过", () => {
  const r = validateLogInput({ problems: [{ id: "e8", name: "X", tags: "hello.world, [tag]" }] });
  assert.deepEqual(r.problems[0].tags, ["hello.world", "[tag]"]);
});

test("边界：纯数字标签原样通过", () => {
  const r = validateLogInput({ problems: [{ id: "e9", name: "X", tags: "123, 456" }] });
  assert.deepEqual(r.problems[0].tags, ["123", "456"]);
});

test("边界：混合分隔符（、和, 和，）同时工作", () => {
  const r = validateLogInput({ problems: [{ id: "e10", name: "X", tags: "暴力、枚举, DFS，搜索" }] });
  assert.deepEqual(r.problems[0].tags, ["暴力", "枚举", "DFS", "搜索"]);
});

test("边界：前导/尾随/连续分隔符正确处理（,暴力,,枚举,→[暴力,枚举]）", () => {
  const r = validateLogInput({ problems: [{ id: "e11", name: "X", tags: ",暴力,,枚举," }] });
  assert.deepEqual(r.problems[0].tags, ["暴力", "枚举"]);
});

test("边界：数组输入格式支持内置分隔符", () => {
  const r = validateLogInput({ problems: [{ id: "e12", name: "X", tags: ["暴力、模拟", "枚举"] }] });
  assert.deepEqual(r.problems[0].tags, ["暴力", "模拟", "枚举"]);
});

test("边界：恰好30字符的标签成功通过", () => {
  const tag = "a".repeat(30);
  const r = validateLogInput({ problems: [{ id: "e13", name: "X", tags: tag }] });
  assert.deepEqual(r.problems[0].tags, [tag]);
});

test("边界：非字符串非数组标签抛出TypeError", () => {
  assert.throws(
    () => validateLogInput({ problems: [{ id: "e14", name: "X", tags: 12345 }] }),
    /标签必须是文本或数组/,
  );
});

test("边界：CJK+非规范拉丁混合标签原样通过", () => {
  const r = validateLogInput({ problems: [{ id: "e15", name: "X", tags: "Hello世界" }] });
  assert.deepEqual(r.problems[0].tags, ["Hello世界"]);
});

test("边界：6个复合标签刚好产生10个唯一标签（成功通过）", () => {
  const tags = "贪心枚举DP, 暴力搜索, 模拟搜索, 分治递归, 二分枚举, 树形搜索";
  const r = validateLogInput({ problems: [{ id: "e16", name: "X", tags }] });
  assert.equal(r.problems[0].tags.length, 10);
  assert.deepEqual(r.problems[0].tags, ["贪心", "枚举", "DP", "暴力", "搜索", "模拟", "分治", "递归", "二分", "树"]);
});

test("边界：线段树分治→复合拆分→分治（非cdq分治/整体二分分治）", () => {
  const r = validateLogInput({ problems: [{ id: "e17", name: "X", tags: "线段树分治" }] });
  assert.deepEqual(r.problems[0].tags, ["线段树", "分治"]);
});
