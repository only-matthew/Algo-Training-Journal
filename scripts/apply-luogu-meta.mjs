// scripts/apply-luogu-meta.mjs
// 把 curriculum/luogu-problem-meta.json 的官方题名/难度批量应用到 curriculum/nodes/*.json。
// 只填空位（已有 name/difficulty 的题目不覆盖），可重复执行。
// 用法：node scripts/apply-luogu-meta.mjs
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const META_FILE = path.join(ROOT, "curriculum", "luogu-problem-meta.json");
const NODES_DIR = path.join(ROOT, "curriculum", "nodes");

function main() {
  if (!fs.existsSync(META_FILE)) {
    console.error("缺少 " + META_FILE + "，请先运行 scripts/fetch-luogu-meta.mjs");
    process.exitCode = 1;
    return;
  }
  const meta = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
  const byKey = new Map();
  for (const p of meta.problems || []) {
    if (p && p.platform && p.number) byKey.set(`${p.platform}|${p.number}`, p);
  }
  console.log(`meta 命中 ${byKey.size} 个唯一题目`);

  let hit = 0;
  let filledName = 0;
  let filledDifficulty = 0;
  let filesChanged = 0;

  for (const file of fs.readdirSync(NODES_DIR)) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(NODES_DIR, file);
    const node = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let changed = false;
    for (const problem of node.problems || []) {
      const entry = byKey.get(`${problem.platform}|${problem.number}`);
      if (!entry) continue;
      hit += 1;
      if (!problem.name && entry.name) {
        problem.name = entry.name;
        filledName += 1;
        changed = true;
      }
      if (problem.difficulty == null && entry.difficulty) {
        problem.difficulty = entry.difficulty;
        filledDifficulty += 1;
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(filePath, JSON.stringify(node, null, 2) + "\n", "utf8");
      filesChanged += 1;
    }
  }
  console.log(`应用完成：命中题目 ${hit}，补题名 ${filledName}，补难度 ${filledDifficulty}，改动文件 ${filesChanged}`);
}

main();
