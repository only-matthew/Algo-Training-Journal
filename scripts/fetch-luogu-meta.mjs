// scripts/fetch-luogu-meta.mjs
// 批量抓取洛谷题目元数据（官方题名 + 官方难度），写入 curriculum/luogu-problem-meta.json。
//
// 复用 workers/oauth.mjs 的洛谷抓取思路：
//   1) 洛谷对匿名请求先下发 C3VK 挑战 cookie（302 回跳同 URL），带 cookie 再请求即可拿到页面；
//   2) 页面内嵌 <script id="lentille-context" type="application/json"> 的 data.problem 字段，
//      含官方题名 name 与难度编号 difficulty。
//
// 难度编号遵循洛谷官方帮助中心《题目难度体系》当前 8 级（2025 临时体系，题面数据已按此编号）：
//   0 暂无评定 | 1 入门 | 2 普及- | 3 普及 | 4 普及+/提高- | 5 提高 | 6 提高+/省选- | 7 省选/NOI- | 8 NOI/NOI+/CTS
//
// 采集范围：curriculum/nodes/*.json 中
//   - source === "洛谷深入浅出"（洛谷官方《深入浅出》题单全部题目，含其中 CF/UVA/AtCoder 转载题）
//   - platform === "洛谷"（其余来源里的洛谷题目，如罗勇军/刘汝佳/新增模板题）
// 用法：node scripts/fetch-luogu-meta.mjs [--limit N] [--skip-existing]
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NODES_DIR = path.join(ROOT, "curriculum", "nodes");
const OUT_FILE = path.join(ROOT, "curriculum", "luogu-problem-meta.json");

const LUOGU_DIFFICULTY = {
  0: "暂无评定",
  1: "入门",
  2: "普及-",
  3: "普及",
  4: "普及+/提高-",
  5: "提高",
  6: "提高+/省选-",
  7: "省选/NOI-",
  8: "NOI/NOI+/CTS",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAX_RETRY = 3;

const ARGS = process.argv.slice(2);
const LIMIT = (() => {
  const i = ARGS.indexOf("--limit");
  return i >= 0 ? Number(ARGS[i + 1]) : Infinity;
})();
const SKIP_EXISTING = ARGS.includes("--skip-existing");
// 洛谷对匿名抓取有风控（约 300 次/窗口），批量抓取建议 --concurrency 2 --delay 1200；
// 重抓失败项时可再放慢。
const CONCURRENCY = (() => {
  const i = ARGS.indexOf("--concurrency");
  return i >= 0 ? Number(ARGS[i + 1]) : 4;
})();
const REQUEST_DELAY = (() => {
  const i = ARGS.indexOf("--delay");
  return i >= 0 ? Number(ARGS[i + 1]) : 0;
})();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 站点平台 -> 洛谷题目页 ID。洛谷仅镜像 UVA/Codeforces/AtCoder 等少量转载题，
// HDU/POJ/OpenJ_Bailian/SPOJ 等无稳定映射，返回 null 跳过。
function luoguProblemId(platform, number) {
  switch (platform) {
    case "洛谷":
      return number;
    case "Codeforces":
      return "CF" + number;
    case "AtCoder":
      return "AT_" + number;
    case "UVA":
      return "UVA" + number;
    default:
      return null;
  }
}

function collectProblems() {
  const seen = new Map();
  for (const file of fs.readdirSync(NODES_DIR)) {
    if (!file.endsWith(".json")) continue;
    const node = JSON.parse(fs.readFileSync(path.join(NODES_DIR, file), "utf8"));
    for (const p of node.problems || []) {
      if (p.source !== "洛谷深入浅出" && p.platform !== "洛谷") continue;
      const key = `${p.platform}|${p.number}`;
      if (!seen.has(key)) seen.set(key, { platform: p.platform, number: p.number });
    }
  }
  return [...seen.values()].sort((a, b) =>
    (a.platform + "|" + a.number).localeCompare(b.platform + "|" + b.number, "zh-CN")
  );
}

// 共享挑战 cookie：首次请求拿到 C3VK 后复用，遇到 302 再刷新。
let sharedCookie = "";

// 抓取一个页面，返回 { status, text }；内部处理挑战重定向与 cookie 刷新。
async function fetchPage(url) {
  const headers = { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" };
  if (sharedCookie) headers.Cookie = sharedCookie;
  let res = await fetch(url, { redirect: "manual", headers });
  if (res.status >= 300 && res.status < 400) {
    // 挑战：取新 cookie 后重试一次
    const challenge = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA } });
    const cookies = (challenge.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]);
    if (cookies.length) sharedCookie = cookies.join("; ");
    res = await fetch(url, { redirect: "manual", headers: { ...headers, Cookie: sharedCookie } });
  }
  if (res.status >= 300 && res.status < 400) return { status: res.status, text: "" };
  return { status: res.status, text: await res.text() };
}

async function fetchProblem(platform, number) {
  const id = luoguProblemId(platform, number);
  if (!id) return null;
  const url = `https://www.luogu.com.cn/problem/${encodeURIComponent(id)}`;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const { status, text } = await fetchPage(url);
      if (status !== 200) {
        if (attempt < MAX_RETRY) await sleep(400 * attempt);
        continue;
      }
      const m = text.match(/<script id="lentille-context" type="application\/json">([\s\S]*?)<\/script>/i);
      const problem = m ? JSON.parse(m[1])?.data?.problem : null;
      if (problem && problem.name) {
        const difficulty =
          typeof problem.difficulty === "number" ? LUOGU_DIFFICULTY[problem.difficulty] || "" : "";
        return { platform, number, name: problem.name, difficulty };
      }
      return { platform, number, name: "", difficulty: "", error: "no-context" };
    } catch (e) {
      if (attempt < MAX_RETRY) await sleep(500 * attempt);
      else return { platform, number, name: "", difficulty: "", error: e.message };
    }
  }
  return { platform, number, name: "", difficulty: "", error: "retry-exhausted" };
}

async function main() {
  let problems = collectProblems();
  console.log(`待抓取 ${problems.length} 个唯一题目`);

  if (SKIP_EXISTING && fs.existsSync(OUT_FILE)) {
    const prev = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
    const have = new Set((prev.problems || []).map((p) => `${p.platform}|${p.number}`));
    problems = problems.filter((p) => !have.has(`${p.platform}|${p.number}`));
    console.log(`--skip-existing 过滤后剩 ${problems.length} 个`);
  }
  if (LIMIT !== Infinity) {
    problems = problems.slice(0, LIMIT);
    console.log(`--limit 截断为 ${problems.length} 个`);
  }

  const results = new Map();
  const failures = [];
  let next = 0;

  async function worker() {
    while (next < problems.length) {
      const idx = next++;
      const item = problems[idx];
      const result = await fetchProblem(item.platform, item.number);
      if (result && result.name) {
        results.set(`${item.platform}|${item.number}`, result);
      } else {
        failures.push({ platform: item.platform, number: item.number, reason: result?.error || "unknown" });
      }
      // 礼貌抖动，避免触发风控（REQUEST_DELAY 为固定间隔，随机部分为 ±50%）
      const base = REQUEST_DELAY > 0 ? REQUEST_DELAY : Math.floor(Math.random() * 100);
      await sleep(Math.max(0, Math.floor(base * (0.5 + Math.random()))));
      if ((idx + 1) % 120 === 0) {
        console.log(`进度 ${idx + 1}/${problems.length}，失败 ${failures.length}`);
        await sleep(800);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, problems.length) }, worker));

  // 合并上一版 meta 的成功项（断点续抓时保留历史成果，避免覆盖丢失）
  if (fs.existsSync(OUT_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
      for (const p of prev.problems || []) {
        const key = `${p.platform}|${p.number}`;
        if (p && p.name && !results.has(key)) results.set(key, p);
      }
    } catch {
      // 旧文件损坏时忽略，以本次结果为准
    }
  }

  const sorted = [...results.values()].sort((a, b) =>
    (a.platform + "|" + a.number).localeCompare(b.platform + "|" + b.number, "zh-CN")
  );
  const meta = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    note: "洛谷官方题名与难度。难度为官方《题目难度体系》当前 8 级：0 暂无评定 / 1 入门 / 2 普及- / 3 普及 / 4 普及+/提高- / 5 提高 / 6 提高+/省选- / 7 省选/NOI- / 8 NOI/NOI+/CTS",
    problems: sorted,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(meta, null, 2).replace(/\n/g, "\r\n") + "\r\n", "utf8");
  console.log(`完成：成功 ${sorted.length}，失败 ${failures.length}`);
  if (failures.length) {
    console.log("失败清单：");
    for (const f of failures) console.log(`  ${f.platform}|${f.number}  ${f.reason}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
