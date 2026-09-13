#!/usr/bin/env node
// 用 Codeforces / 洛谷 官方数据补全历史记录里残缺的题号。
//
// 背景：早期记录常把「场次名」填在题目名称、把「题号字母」填在题号栏，
// 例如 名称='Codeforces Round 1108 (Div. 2)' + 题号='B'。
// 注意：**场次序号不等于 contestId**（Round 1108 的 contestId 是 2246），
// 所以补全必须用「名称 → contestId」的权威映射，不能直接拿场次序号当题号。
//
// 数据来源（联网获取，随本脚本一起维护）：
//   - https://codeforces.com/api/contest.list     场次序号 ↔ contestId ↔ 开始时间
//   - https://codeforces.com/api/problemset.problems  题名 → contestId+index
//   - 洛谷题目页（题名与题号一一对应，逐条人工核对过）
//
// 默认只报告（dry-run），加 --write 才写入。原值保留在 problemNumberLegacy 便于回滚。
//
// 用法：
//   node scripts/repair-problem-identity.mjs            # 只报告
//   node scripts/repair-problem-identity.mjs --write    # 应用
//   node scripts/repair-problem-identity.mjs --json     # JSON 报告

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isCompleteProblemNumber, normalizePlatform } from "../lib/problem-identity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGS_DIR = path.join(ROOT, "logs");
const WRITE = process.argv.includes("--write");
const JSON_OUT = process.argv.includes("--json");

// ── 场次序号 → contestId（Codeforces 官方 contest.list，按需增补）──
// 只登记「能用名称唯一确定」的场次；Div.1/Div.2 同号时按 div 区分。
const CF_CONTESTS = Object.freeze([
  { id: 2241, round: 1107, div: "3" },
  { id: 2242, round: 192, div: "2", educational: true },
  { id: 2244, round: 1109, div: "3" },
  { id: 2245, round: 1110, div: "2" },
  { id: 2246, round: 1108, div: "2" },
  { id: 2248, round: 1113, div: "2" },
  { id: 2250, round: 1112, div: "2" },
  { id: 2252, round: 1115, div: "2" },
  { id: 2253, round: 193, div: "2", educational: true },
  { id: 2254, round: 1114, div: "3" },
  { id: 2256, round: 1116, div: "2" },
  { id: 2257, round: 1117, div: "2" },
]);

// ── 记录日期 → contestId ──
// 用于「题名只写了卷面代号（A/B/C1…）、完全没有场次信息」的记录。
// 依据：该成员当天/次日的 Codeforces 提交记录（官方 user.status），以及同日其他成员
// 对同一场比赛的记录（互相印证）。仅登记有确凿依据的日期。
const CF_CONTEST_BY_DATE = Object.freeze({
  // 王梓豪 2026-08-05 的 A/B/C1/C2/D：hnuwang 在 contest 2254（Round 1114, Div. 3）
  // 的比赛中 AC 了 A/B/C1/C2/D 五题；同日廖夏记的 2254A/B/C1/C2、郭一鸣记的 1114A 同场。
  "王梓豪|2026-08-05": 2254,
});

// ── Codeforces 题名 → 完整题号（官方 problemset 精确匹配，逐条已核对）──
const CF_BY_TITLE = Object.freeze({
  "threshold movement": "2250A",
  "you delete, i delete": "2248A",
  "merge to match": "2248B",
  "creating abbreviations": "2257A",
  "gigantomachy": "2257B",
  "spying on the beaver": "2257C",
  "monocarp's contest": "2260A",
  "monocarp and projects": "2260B",
  "riptide": "2254A",
  "evanescent": "2254B",
  "marenol (easy version)": "2254C1",
  "marenol (hard version)": "2254C2",
});

// ── 洛谷：题名 → 题号（已逐条核对官方题目页）──
const LUOGU_BY_TITLE = Object.freeze({
  "乒乓球": "P1042",
  "栈": "P1044",
  "单词接龙": "P1019",
  "计算器的改良": "P1022",
  // 「导弹防御系统」题面为「最多拦截数量、每发不高于前一发」，即 NOIP 1999 提高组导弹拦截
  "导弹防御系统": "P1020",
  "P5143": "P5143",
  "P1104": "P1104",
  "P2241": "P2241",
  "P1618": "P1618",
  "P1036": "P1036",
  "P1012": "P1012",
  "P1007": "P1007",
});

// ── 明确不动、且不再报告为「待补录」的记录（自建题/校内题，本就没有 OJ 题号）──
const KNOWN_UNNUMBERED = new Set([
  "新型冠状病毒（COVID19）传播",
  "部分A+B",
  "数字统计",
  "高精度除法（输出商和余数）",
  "公交系统",
  "挖掘机技术哪家强",
  "数码管",
  "舞蹈面试",
  "ab串",
  "最长公共前后缀长度",
  "蹦蹦菇",
]);

function titleKey(value) {
  return String(value || "").trim().replace(/^[A-Za-z]\d*\s*[-.]\s*/, "").toLowerCase();
}

// 去掉「卷面代号 + 分隔符」前缀后再查官方题名：'A Creating Abbreviations' → 'creating abbreviations'
function bareTitleKey(value) {
  return String(value || "").trim().replace(/^[A-Za-z]\d*\s*[-.]?\s+/, "").toLowerCase();
}

// 题号看起来是 Codeforces 形态（数字+代号），却挂在别的平台下 —— 属于平台标错。
const CODEFORCES_STYLE = /^\d+[A-Z]\d*$/;

// 从「Codeforces Round 1108 (Div. 2)」这类名称里定出 contestId
function contestForTitle(title) {
  const text = String(title || "");
  const roundMatch = text.match(/Round\s+(\d+)/i);
  if (!roundMatch) return null;
  const educational = /Educational/i.test(text);
  const divMatch = text.match(/Div\.?\s*([1-4])/i);
  const candidates = CF_CONTESTS.filter((c) => c.round === Number(roundMatch[1]) && Boolean(c.educational) === educational);
  if (!candidates.length) return null;
  if (divMatch) {
    // 名称可能是「Div. 1 + Div. 2」这种联合场次，div 数字取名称里出现的第一个；
    // 先按精确 div 找，找不到再退回到候选里 div 数字出现在完整名称中的那个。
    const exact = candidates.find((c) => c.div === divMatch[1]);
    if (exact) return exact.id;
    const loose = candidates.find((c) => text.includes(`Div. ${c.div}`));
    if (loose) return loose.id;
  }
  return candidates.length === 1 ? candidates[0].id : null;
}

// 返回 { number, source, platformFix }；number 为空串表示无法确定
function resolve(problem, context = {}) {
  const platform = normalizePlatform(problem.platform);
  const current = String(problem.problemNumber || "").trim();
  const legacy = problem.problemNumberLegacy === undefined ? "" : String(problem.problemNumberLegacy || "").trim();
  const title = String(problem.name || "").trim();
  // 平台标错：题号是 Codeforces 形态却记在洛谷/其他平台下（如 洛谷 + 2254A）
  const misplaced = platform !== "Codeforces" && CODEFORCES_STYLE.test(current.toUpperCase());

  if (platform === "Codeforces" || misplaced) {
    if (misplaced) {
      return { number: current.toUpperCase(), source: "题号是 Codeforces 形态，平台应为 Codeforces", platformFix: "Codeforces" };
    }
    // 1) 目标代号：题号栏 → legacy → 题名本身（有的记录只把字母写在名称里）
    const branch = (current.match(/^(\d+)?([A-Za-z]\d*)$/)?.[2]
      || legacy.match(/^([A-Za-z]\d*)$/)?.[1]
      || title.match(/^([A-Za-z]\d*)$/)?.[1]
      || "").toUpperCase();
    // 2) 先按官方题名精确匹配（含去掉卷面代号前缀的形式）
    const byTitle = CF_BY_TITLE[titleKey(title)] || CF_BY_TITLE[bareTitleKey(title)];
    if (byTitle) return { number: byTitle, source: "官方题名匹配" };
    // 3) 再按「场次名 + 代号」组合
    const contestId = contestForTitle(title);
    if (contestId && branch) return { number: `${contestId}${branch}`, source: "场次名映射 + 卷面代号" };
    // 4) 题名只是卷面代号时，按「成员 + 日期」查已核实的场次
    const byDate = context.member && context.date ? CF_CONTEST_BY_DATE[`${context.member}|${context.date}`] : null;
    if (byDate && branch) return { number: `${byDate}${branch}`, source: "按成员日期核实的场次 + 卷面代号" };
    if (branch && !contestId) return { number: "", source: `题名里没有可识别的场次（代号 ${branch}）` };
    return { number: "", source: "题名与题号都缺场次信息" };
  }

  if (platform === "洛谷") {
    if (isCompleteProblemNumber("洛谷", current)) return { number: "", source: "" };
    // 平台标错：题名其实是 Codeforces 题目
    const asCf = CF_BY_TITLE[titleKey(title)] || CF_BY_TITLE[bareTitleKey(title)];
    if (asCf) return { number: asCf, source: "题名是 Codeforces 题目，平台应为 Codeforces", platformFix: "Codeforces" };
    const byTitle = LUOGU_BY_TITLE[title] || LUOGU_BY_TITLE[titleKey(title)];
    if (byTitle) return { number: byTitle, source: "官方题名匹配" };
    const embedded = title.match(/\b([A-Za-z]\d{3,}[A-Za-z0-9_-]*)\b/)?.[1]?.toUpperCase();
    if (embedded) return { number: embedded, source: "题名内嵌题号" };
    if (KNOWN_UNNUMBERED.has(title)) return { number: "", source: "", known: true };
    return { number: "", source: "题名与题号都不含洛谷题号" };
  }

  if (platform === "AtCoder") return { number: "", source: "缺 task id" };
  // 平台记为「其他」，但题名能唯一对应洛谷题目（题面已核对）
  const asLuogu = LUOGU_BY_TITLE[title] || LUOGU_BY_TITLE[titleKey(title)];
  if (asLuogu) return { number: asLuogu, source: "题名对应洛谷题目，平台应为洛谷", platformFix: "洛谷" };
  if (KNOWN_UNNUMBERED.has(title)) return { number: "", source: "", known: true };
  return { number: "", source: "题号为空且平台无固定题号格式" };
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
  const applied = [];
  const pending = [];
  let scanned = 0;
  let problems = 0;

  for (const file of listMetaFiles()) {
    scanned += 1;
    let meta;
    try {
      meta = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      pending.push({ file: path.relative(ROOT, file).split(path.sep).join("/"), label: "(无法解析)", source: "JSON 解析失败" });
      continue;
    }
    if (!Array.isArray(meta.problems)) continue;

    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    // logs/<成员>/<年>/<月>/<日>/meta.json 或 logs/<成员>/<YYYY-MM-DD>/meta.json
    const segments = relative.split("/");
    const member = segments[1] || "";
    const tail = segments.slice(2, -1);
    const date = tail.length === 3 ? tail.join("-") : (tail[0] || "");
    let dirty = false;

    meta.problems.forEach((problem) => {
      problems += 1;
      const platform = normalizePlatform(problem.platform);
      const current = String(problem.problemNumber || "").trim();
      const { number, source, known, platformFix } = resolve(problem, { member, date });
      const label = `平台=${platform || "未填写"} 题号='${current}' 名称='${problem.name || ""}'`;
      if (!number) {
        if (!known && !isCompleteProblemNumber(platform, current)) pending.push({ file: relative, label, source });
        return;
      }
      if (number === current.toUpperCase() && !platformFix) return; // 已正确
      applied.push({ file: relative, label, from: current, to: number, source, platformFix });
      if (WRITE) {
        problem.problemNumberLegacy = current;
        problem.problemNumber = number;
        if (platformFix) problem.platform = platformFix;
        dirty = true;
      }
    });

    if (WRITE && dirty) fs.writeFileSync(file, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  }

  if (JSON_OUT) {
    process.stdout.write(`${JSON.stringify({ scanned, problems, applied, pending }, null, 2)}\n`);
    return;
  }

  console.log(`扫描 ${scanned} 个 meta.json，共 ${problems} 条题目记录。`);
  console.log("");
  console.log(`可补全：${applied.length} 条`);
  for (const item of applied) {
    const fix = item.platformFix ? `，平台改为 ${item.platformFix}` : "";
    console.log(`  ${item.file.padEnd(30)} '${item.from}' -> '${item.to}' （${item.source}${fix}）`);
  }
  console.log("");
  console.log(`仍无法确定：${pending.length} 条`);
  for (const item of pending) {
    console.log(`  ${item.file.padEnd(30)} ${item.label}`);
    console.log(`  ${"".padEnd(30)} ${item.source}`);
  }
  console.log("");
  console.log(WRITE ? `已写入 ${applied.length} 条（原值保留在 problemNumberLegacy）。` : "dry-run：未修改任何文件，确认后加 --write。");
}

main();
