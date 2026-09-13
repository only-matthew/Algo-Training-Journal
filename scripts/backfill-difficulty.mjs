#!/usr/bin/env node
// 为历史记录补全「难度」字段。
//
// 用途：未填难度的题在活力指数计算中不参与（未标注 = 无法判断难度），
// 而这段历史里 67 条（40%）没有难度。这里用**官方数据**补全，只有极少数无官方
// 来源的自建/校内题才用推断值。
//
// 数据来源：
//   1) 洛谷官方难度：curriculum/luogu-problem-meta.json（scripts/fetch-luogu-meta.mjs 抓取），
//      该文件未覆盖的用洛谷题目页内嵌 JSON 的 difficulty 字段（8 级：0暂无评定/1入门/2普及-/3普及/
//      4普及+/提高-/5提高/6提高+/省选-/7省选/NOI-/8NOI/NOI+/CTS）。
//   2) Codeforces 官方 rating：https://codeforces.com/api/problemset.problems
//      （该场尚未 rated 的题没有 rating，见 MANUAL）。
//   3) 其余为推断值，逐条在 MANUAL 里注明依据。
//
// 默认只报告，加 --write 才写入。原难度存入 difficultyLegacy 便于回滚，
// 并写入 difficultySource 记录来源（官方/推断），便于日后复核。
//
// 用法：
//   node scripts/backfill-difficulty.mjs            # 只报告
//   node scripts/backfill-difficulty.mjs --write    # 应用

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGS_DIR = path.join(ROOT, "logs");
const LUOGU_META = path.join(ROOT, "curriculum", "luogu-problem-meta.json");
const WRITE = process.argv.includes("--write");

// ── Codeforces 官方 rating → 难度档 ──
// 沿用表单的 Rating 区间，但把最低档细分为 ≤999 与 1000-1199（否则 800/900/1000 全挤在一档）。
const CF_RATING_BANDS = Object.freeze([
  [999, "≤999"], [1199, "1000-1199"], [1399, "1200-1399"],
  [1599, "1400-1599"], [1899, "1600-1899"], [2199, "1900-2199"],
]);
function ratingToBand(rating) {
  if (rating == null) return null;
  for (const [max, band] of CF_RATING_BANDS) if (rating <= max) return band;
  return "≥2200";
}

// ── 有官方 contestId+题号 但用官方 rating 覆盖（本脚本内嵌，避免联网依赖）──
// 取自 codeforces.com/api/problemset.problems，只列本次需要补全的记录。
const CF_OFFICIAL_RATING = Object.freeze({
  "2242B": 1000, "2244A": 800, "2244B": 800, "2244C": 1100, "2250A": 800,
  "2245A": 800, "2245B": 1100,
  "2246B": 900, "2248A": 800, "2246A": 800, "2248B": 1000, "2254B": 900,
  "2254C1": 1000, "2253B": 1100, "2252A": 800, "2253A": 800, "2256A": 800,
  "2256B": 1000, "2241B": 1100, "2241A": 800, "2241C": 1000, "2257B": 800,
  "2257A": 800, "2254A": 800, "2254C2": 1200, "2254D": 1300, "2257C": 1200,
});

// ── 洛谷官方难度（本地 meta 未覆盖、从题目页内嵌 JSON 取的）──
const LUOGU_OFFICIAL_EXTRA = Object.freeze({
  P1025: "普及", P11769: "普及+/提高-", P17259: "普及+/提高-", P1007: "普及",
});

// ── 无官方来源的推断值（自建/校内题，以及 CF 尚未 rated 的场次）──
// 依据：题面描述的算法内容、代码规模与所用数据结构、题目来源赛事。
const MANUAL = Object.freeze({
  "新型冠状病毒（COVID19）传播": ["普及-", "自建题；set/map 模拟同刻同位置传播，O(n²)，59 行"],
  "部分A+B": ["入门", "PAT 乙级基础题型；28 行按位取数求和"],
  "数字统计": ["入门", "PAT 乙级基础题型；16 行计数"],
  "公交系统": ["普及-", "前缀和 + 区间推导，26 行（标签：前缀和）"],
  "挖掘机技术哪家强": ["入门", "PAT 乙级最值统计；核心逻辑 1 行"],
  "数码管": ["普及-", "模拟相邻数字笔画差单调，40 行"],
  "舞蹈面试": ["普及+/提高-", "滑动窗口 + 二分答案，44 行（标签）"],
  "ab串": ["普及-", "线性 DP，19 行"],
  "最长公共前后缀长度": ["普及", "KMP / 回文处理，25 行（标签：KMP、DP）"],
  "蹦蹦菇": ["普及", "多元 BFS，31 行（标签：多元BFS）"],
  // Codeforces Round 1118 尚未 rated（contest.list 里 phase=BEFORE），官方无 rating。
  // 按 Div. 2 A/B 位置判断。
  "Monocarp's Contest": ["≤999", "CF Div. 2 A 题位；该场尚未 rated"],
  "Monocarp and Projects": ["≤999", "CF Div. 2 B 题位；该场尚未 rated"],
});

const KNOWN = new Set([
  "入门", "普及-", "普及", "普及+/提高-", "提高", "提高+/省选-", "省选/NOI-", "NOI/NOI+/CTS",
  "≤999", "1000-1199", "1200-1399", "1400-1599", "1600-1899", "1900-2199", "≥2200",
]);

function luoguDifficultyIndex() {
  const index = new Map(Object.entries(LUOGU_OFFICIAL_EXTRA));
  if (!fs.existsSync(LUOGU_META)) return index;
  try {
    const meta = JSON.parse(fs.readFileSync(LUOGU_META, "utf8"));
    for (const problem of meta.problems || []) {
      if (problem?.number && problem.difficulty) index.set(String(problem.number).toUpperCase(), problem.difficulty);
    }
  } catch { /* 元数据缺失时退化为只用手工补充表 */ }
  return index;
}

function listMetaFiles(dir = LOGS_DIR, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listMetaFiles(full, out);
    else if (entry.name === "meta.json") out.push(full);
  }
  return out.sort();
}

function main() {
  const luogu = luoguDifficultyIndex();
  const applied = [];
  const unresolved = [];
  let scanned = 0;
  let problems = 0;

  for (const file of listMetaFiles()) {
    scanned += 1;
    let meta;
    try {
      meta = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch { continue; }
    if (!Array.isArray(meta.problems)) continue;

    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    let dirty = false;

    meta.problems.forEach((problem) => {
      problems += 1;
      const current = String(problem.difficulty || "");
      if (KNOWN.has(current)) return; // 已有难度，跳过

      const number = String(problem.problemNumber || "").toUpperCase();
      let band = null;
      let source = "";

      if (problem.platform === "洛谷" && luogu.has(number)) {
        band = luogu.get(number);
        source = "洛谷官方";
      } else if (problem.platform === "Codeforces" && number in CF_OFFICIAL_RATING) {
        const rating = CF_OFFICIAL_RATING[number];
        band = ratingToBand(rating);
        source = `CF 官方 rating ${rating}`;
      }

      if (!band && MANUAL[problem.name]) {
        const [value, why] = MANUAL[problem.name];
        band = value;
        source = `推断：${why}`;
      }

      if (!band) {
        unresolved.push({ file: relative, name: problem.name, platform: problem.platform, number: problem.problemNumber });
        return;
      }

      applied.push({ file: relative, name: problem.name, from: current, to: band, source });
      if (WRITE) {
        problem.difficultyLegacy = current;
        problem.difficulty = band;
        problem.difficultySource = source;
        dirty = true;
      }
    });

    if (WRITE && dirty) fs.writeFileSync(file, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  }

  console.log(`扫描 ${scanned} 个 meta.json，共 ${problems} 条记录。`);
  console.log("");
  console.log(`待补难度：${applied.length} 条`);
  for (const item of applied) {
    console.log(`  ${item.file.padEnd(30)} 「${item.name}」 -> ${item.to.padEnd(14)}（${item.source}）`);
  }
  console.log("");
  console.log(`仍无难度来源：${unresolved.length} 条`);
  for (const item of unresolved) console.log(`  ${item.file.padEnd(30)} ${item.platform} ${item.number || "-"} 「${item.name}」`);
  console.log("");
  console.log(WRITE ? `已写入 ${applied.length} 条（原值存 difficultyLegacy，来源存 difficultySource）。` : "dry-run：未修改任何文件，确认后加 --write。");
}

main();
