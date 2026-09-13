#!/usr/bin/env node
// 把所有平台的题目难度统一换算为 Codeforces Rating 数值。
//
// 背景：队员反映 CF Rating 更直观，而此前难度是混杂的多套标签：
//   - Codeforces: 「≤1199」这类档位字符串（新旧两套并存，还有历史遗留的「≤1199」）
//   - 洛谷: 「普及-」等 8 级官方难度
//   - 自建/校内题: 「未标注」
//   - 极少数历史脏值: 「普及+/提高」「普及/提高-」
// 统一后每条记录只带一个数字 difficultyRating，与 CF 同尺度，可直接比较与计算。
//
// 换算依据：
//   - Codeforces 有官方 rating 的用精确值（codeforces.com/api/problemset.problems）
//   - 洛谷 8 级 → 等值 CF Rating（区间中点），官方难度取自 curriculum/luogu-problem-meta.json
//   - 无官方来源的自建/校内题用推断值，逐条在 MANUAL_RATING 注明依据
//
// 默认只报告，加 --write 才写入。原难度存入 difficultyLegacy / difficultyRatingSource。
//
// 用法：
//   node scripts/backfill-rating.mjs            # 只报告
//   node scripts/backfill-rating.mjs --write    # 应用

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DIFFICULTY_LABEL_RATING, RATING_BAND_VALUES } from "../lib/rating.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGS_DIR = path.join(ROOT, "logs");
const LUOGU_META = path.join(ROOT, "curriculum", "luogu-problem-meta.json");
const WRITE = process.argv.includes("--write");

// 换算表与表单共用 lib/rating.mjs，避免两处维护走偏
const LUOGU_LABEL_TO_RATING = DIFFICULTY_LABEL_RATING;
const BAND_TO_RATING = RATING_BAND_VALUES;

// ── Codeforces 官方 rating（codeforces.com/api/problemset.problems）──
const CF_OFFICIAL_RATING = Object.freeze({
  "2242B": 1000, "2244A": 800, "2244B": 800, "2244C": 1100, "2250A": 800,
  "2245A": 800, "2245B": 1100, "2246B": 900, "2248A": 800, "2246A": 800,
  "2248B": 1000, "2254B": 900, "2254C1": 1000, "2253B": 1100, "2252A": 800,
  "2253A": 800, "2256A": 800, "2256B": 1000, "2241B": 1100, "2241A": 800,
  "2241C": 1000, "2257B": 800, "2257A": 800, "2254A": 800, "2254C2": 1200,
  "2254D": 1300, "2257C": 1200,
  "1182B": 1300, // Plus from Picture（用户在 CF 提交记录里 AC 过，官方 rating 1300）
});

// ── 无官方 rating / 无官方难度的推断值 ──
const MANUAL_RATING = Object.freeze({
  // Codeforces Round 1118 尚未 rated（contest.list 中 phase=BEFORE），按题位推断
  "2260A": [800, "CF Div. 2 A 题位；该场尚未 rated"],
  "2260B": [1100, "CF Div. 2 B 题位；该场尚未 rated"],
  // 自建 / 校内题 / PAT 基础题：依据题面算法内容、代码规模与数据结构
  "新型冠状病毒（COVID19）传播": [1000, "自建题；set/map 模拟同刻同位置传播 O(n²)，59 行"],
  "部分A+B": [800, "PAT 乙级基础题型；28 行按位取数求和"],
  "数字统计": [800, "PAT 乙级基础题型；16 行计数"],
  "公交系统": [1000, "前缀和 + 区间推导，26 行（标签：前缀和）"],
  "挖掘机技术哪家强": [800, "PAT 乙级最值统计；核心逻辑 1 行"],
  "数码管": [1000, "模拟相邻数字笔画差单调，40 行"],
  "舞蹈面试": [1500, "滑动窗口 + 二分答案，44 行（标签）"],
  "ab串": [1000, "线性 DP，19 行"],
  "最长公共前后缀长度": [1300, "KMP / 回文处理，25 行（标签：KMP、DP）"],
  "蹦蹦菇": [1300, "多元 BFS，31 行（标签：多元BFS）"],
});

function luoguDifficultyIndex() {
  const index = new Map();
  if (!fs.existsSync(LUOGU_META)) return index;
  try {
    const meta = JSON.parse(fs.readFileSync(LUOGU_META, "utf8"));
    for (const problem of meta.problems || []) {
      if (problem?.number && problem.difficulty) index.set(String(problem.number).toUpperCase(), problem.difficulty);
    }
  } catch { /* 元数据缺失时退化为只用手工表 */ }
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

// 返回 { rating, source }
function resolveRating(problem, luogu) {
  const platform = String(problem.platform || "");
  const number = String(problem.problemNumber || "").toUpperCase();
  const label = String(problem.difficulty || "");
  const title = String(problem.name || "");

  if (platform === "Codeforces") {
    if (number in CF_OFFICIAL_RATING) {
      const rating = CF_OFFICIAL_RATING[number];
      return { rating, source: `CF 官方 rating ${rating}` };
    }
    if (number in MANUAL_RATING) {
      const [rating, why] = MANUAL_RATING[number];
      return { rating, source: `推断：${why}` };
    }
  }

  if (platform === "洛谷" && luogu.has(number)) {
    const official = luogu.get(number);
    const rating = LUOGU_LABEL_TO_RATING[official];
    if (rating) return { rating, source: `洛谷官方难度「${official}」` };
  }

  // 已有的数值 Rating（Codeforces / AtCoder 官方值，或之前换算过的结果）
  if (Number(problem.difficultyRating) > 0) {
    return { rating: Number(problem.difficultyRating), source: "沿用已有 Rating" };
  }

  // 兜底：按难度标签/档位换算，覆盖任意平台（洛谷、AtCoder、校内自建平台等）
  if (label in LUOGU_LABEL_TO_RATING) {
    return { rating: LUOGU_LABEL_TO_RATING[label], source: `按难度标签「${label}」换算` };
  }
  if (label in BAND_TO_RATING) {
    return { rating: BAND_TO_RATING[label], source: `按档位「${label}」换算` };
  }
  if (title in MANUAL_RATING) {
    const [rating, why] = MANUAL_RATING[title];
    return { rating, source: `推断：${why}` };
  }
  return { rating: null, source: "" };
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
      const { rating, source } = resolveRating(problem, luogu);
      if (rating == null) {
        unresolved.push({ file: relative, platform: problem.platform, number: problem.problemNumber, name: problem.name });
        return;
      }
      if (Number(problem.difficultyRating) === rating) return; // 已换算过
      applied.push({ file: relative, name: problem.name, from: problem.difficulty, to: rating, source });
      if (WRITE) {
        if (problem.difficultyLegacy === undefined) problem.difficultyLegacy = problem.difficulty;
        problem.difficultyRating = rating;
        problem.difficultyRatingSource = source;
        dirty = true;
      }
    });

    if (WRITE && dirty) fs.writeFileSync(file, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  }

  console.log(`扫描 ${scanned} 个 meta.json，共 ${problems} 条记录。`);
  console.log("");
  const byPlatform = {};
  for (const item of applied) byPlatform[item.source.split(/[： ]/)[0]] = (byPlatform[item.source.split(/[： ]/)[0]] || 0) + 1;
  console.log(`待换算：${applied.length} 条`);
  for (const item of applied.slice(0, 12)) {
    console.log(`  ${item.file.padEnd(30)} 「${String(item.name).slice(0, 18)}」 ${String(item.from).padEnd(14)} -> ${item.to}`);
  }
  if (applied.length > 12) console.log(`  … 其余 ${applied.length - 12} 条同理`);
  console.log("");
  console.log(`无法换算：${unresolved.length} 条`);
  for (const item of unresolved) console.log(`  ${item.file.padEnd(30)} ${item.platform} ${item.number || "-"} 「${item.name}」`);
  console.log("");
  console.log(WRITE ? `已写入 ${applied.length} 条（原值存 difficultyLegacy，来源存 difficultyRatingSource）。` : "dry-run：未修改任何文件，确认后加 --write。");
}

main();
