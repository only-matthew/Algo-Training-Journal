#!/usr/bin/env node
// ============================================================================
// 从 Codeforces 官方 API 拉取题目（含算法标签与 rating），按知识点节点映射与
// 难度区间筛选，生成/扩充 curriculum/cf-supplement.json，供 convert-curriculum.js
// 合并进节点题单（source=Codeforces·API）。
//
// 用法：
//   node scripts/fetch-codeforces.js            # 每节点取 8 道
//   node scripts/fetch-codeforces.js --count 12 # 每节点取 12 道
//   node scripts/fetch-codeforces.js --all      # 覆盖全部可映射节点
//
// 依赖：Node 24+（内置 fetch）；需要能访问 codeforces.com 的网络环境。
// 本机沙箱可能被网络策略拦截（SSL 失败），可在能访问 CF 的环境（如 CI/代理）运行。
// ============================================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const NODES_DIR = path.join(ROOT, "curriculum", "nodes");
const OUTPUT = path.join(ROOT, "curriculum", "cf-supplement.json");
const API = "https://codeforces.com/api/problemset.problems";

const COUNT = Number(process.argv[process.argv.indexOf("--count") + 1] || 8);

// 难度系数(1-10) → CF rating 区间（约）
const RATING_RANGE = {
  1: [800, 1000], 2: [800, 1200], 3: [900, 1300], 4: [1000, 1400],
  5: [1100, 1500], 6: [1200, 1600], 7: [1400, 1800], 8: [1600, 2100],
  9: [1800, 2400], 10: [2000, 3500],
};

// 节点 → 匹配的 CF 官方标签（候选池）
const CF_NODE_TAGS = {
  "basics-sequence": ["implementation", "math"],
  "basics-branch": ["implementation"],
  "basics-loop": ["implementation"],
  "basics-array": ["implementation"],
  "basics-string": ["strings", "implementation"],
  "basics-function-struct": ["implementation"],
  "algo-simulation-bigint": ["implementation", "constructive algorithms"],
  "algo-sorting": ["sortings"],
  "algo-enumeration": ["brute force"],
  "algo-recurrence-recursion": ["dfs and similar", "divide and conquer"],
  "algo-greedy": ["greedy"],
  "algo-binary-search": ["binary search", "ternary search"],
  "algo-search-basics": ["dfs and similar", "graphs"],
  "search-advanced": ["meet-in-the-middle", "dfs and similar"],
  "ds-linear-list": ["data structures"],
  "ds-binary-tree": ["trees", "data structures"],
  "ds-set": ["dsu", "hashing", "data structures"],
  "ds-graph-basics": ["graphs", "dfs and similar"],
  "math-basics": ["math"],
  "algo-prefix-diff-discretize": ["data structures", "two pointers"],
  "algo-optimization-tricks": ["two pointers", "data structures"],
  "algo-divide-conquer-doubling": ["divide and conquer"],
  "string-basics": ["strings", "hashing"],
  "string-advanced": ["string suffix structures", "strings"],
  "ds-heap-bit": ["data structures"],
  "ds-segtree": ["data structures"],
  "ds-segtree-advanced": ["data structures"],
  "ds-block-mo": ["data structures"],
  "graph-tree": ["trees", "dfs and similar"],
  "graph-shortest-path": ["shortest paths", "graphs"],
  "graph-mst": ["graphs", "dsu"],
  "graph-connectivity": ["graphs", "2-sat"],
  "graph-network-flow": ["flows", "graph matchings"],
  "dp-intro": ["dp"],
  "dp-linear": ["dp"],
  "dp-interval": ["dp"],
  "dp-tree-graph": ["dp", "trees"],
  "dp-bitmask": ["dp", "bitmasks"],
  "dp-optimization": ["dp"],
  "math-number-theory": ["number theory", "chinese remainder theorem"],
  "math-combinatorics": ["combinatorics"],
  "math-probability": ["probabilities"],
  "math-linear-algebra": ["matrices"],
  "math-game-theory": ["games"],
  "math-geometry": ["geometry"],
};

function existingNumbers(node) {
  const set = new Set();
  for (const p of node.problems || []) {
    if (p.platform === "Codeforces") set.add(String(p.number).toUpperCase().replace(/\s+/g, ""));
  }
  return set;
}

async function main() {
  const nodes = new Map();
  for (const file of fs.readdirSync(NODES_DIR)) {
    if (!file.endsWith(".json")) continue;
    const node = JSON.parse(fs.readFileSync(path.join(NODES_DIR, file), "utf8"));
    if (node.id && CF_NODE_TAGS[node.id]) nodes.set(node.id, node);
  }
  console.log(`可映射节点：${nodes.size}`);

  console.log(`正在请求 Codeforces API：${API}`);
  const res = await fetch(API, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== "OK") throw new Error(`API status: ${data.status}`);
  const problems = data.result.problems || [];
  const solved = new Map((data.result.problemStatistics || []).map((s) => [s.contestId + String(s.index).toUpperCase(), s.solvedCount || 0]));
  console.log(`拉取到题目 ${problems.length} 道`);

  const supplement = {};
  for (const [id, node] of nodes) {
    const tags = CF_NODE_TAGS[id];
    const [lo, hi] = RATING_RANGE[node.difficulty] || [800, 3500];
    const mid = (lo + hi) / 2;
    const existing = existingNumbers(node);
    const candidates = [];
    for (const p of problems) {
      const num = String(p.contestId) + String(p.index || "").toUpperCase();
      if (existing.has(num)) continue;
      if (p.rating == null || p.rating < lo || p.rating > hi) continue;
      const hit = (p.tags || []).filter((t) => tags.includes(t));
      if (!hit.length) continue;
      candidates.push({ number: num, name: p.name || "", rating: p.rating, tags: hit, solved: solved.get(p.contestId + String(p.index || "").toUpperCase()) || 0, dist: Math.abs(p.rating - mid) });
    }
    candidates.sort((a, b) => a.dist - b.dist || b.solved - a.solved);
    const picked = candidates.slice(0, COUNT).map(({ number, name, rating, tags }) => ({ number, name, rating, tags, source: "Codeforces·API" }));
    if (picked.length) supplement[id] = picked;
  }
  console.log(`生成补充：${Object.keys(supplement).length} 个节点共 ${Object.values(supplement).reduce((s, a) => s + a.length, 0)} 道题`);

  // 合并：保留既有精选项（Codeforces·精选），覆盖 API 项
  let merged = {};
  if (fs.existsSync(OUTPUT)) {
    try {
      const old = JSON.parse(fs.readFileSync(OUTPUT, "utf8"));
      for (const [id, list] of Object.entries(old)) {
        if (!merged[id]) merged[id] = [];
        for (const e of list) if (e.source !== "Codeforces·API") merged[id].push(e);
      }
    } catch (error) {
      console.warn(`[warn] 解析旧 ${path.basename(OUTPUT)} 失败：${error.message}`);
    }
  }
  for (const [id, list] of Object.entries(supplement)) {
    const seen = new Set((merged[id] || []).map((e) => e.number.toUpperCase()));
    const mergedList = merged[id] || [];
    for (const e of list) {
      if (seen.has(e.number.toUpperCase())) continue;
      seen.add(e.number.toUpperCase());
      mergedList.push(e);
    }
    merged[id] = mergedList;
  }

  const sorted = {};
  for (const id of Object.keys(merged).sort()) sorted[id] = merged[id];
  fs.writeFileSync(OUTPUT, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  const total = Object.values(sorted).reduce((s, a) => s + a.length, 0);
  console.log(`已写入 ${OUTPUT}：${Object.keys(sorted).length} 个节点共 ${total} 道题（含既有精选）`);
  console.log("提示：运行 node scripts/convert-curriculum.js --force 重新生成 curriculum/，再 npm run generate 重建站点。");
}

main().catch((error) => {
  console.error(`抓取失败：${error.message}`);
  console.error("请确认网络可访问 codeforces.com（如需要代理/CI 环境）。");
  process.exitCode = 1;
});
