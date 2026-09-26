// scripts/fetch-luogu-training.mjs
// 抓取洛谷三个书系题单的题目清单，写入 curriculum/luogu-training-problems.json。
//
// 抓取链路（全部只读公开页面，不做任何绕过）：
//   1) 题单目录页  /training/list?type=<book.*>             → 题单 id / 名称 / 题数（匿名可读）
//   2) 题单详情页  /training/<id>                           → 正文里的 <ol><li><a href="/problem/xxx">题号 - 名称</a>
//      ⚠ 详情页对匿名请求返回 401「请先登录」，必须带自己的洛谷登录 Cookie；
//        页面正文由服务端渲染，所以带 Cookie 拿到 HTML 后不需要再驱动浏览器。
//   3) 题目页      /problem/<pid>                           → lentille-context 里的 name / difficulty / tags(数字 id)
//   4) 标签字典    /_lfe/tags                               → 数字 id → 中文标签名（匿名可读）
//
// 凭证只从环境变量读，不落盘、不进仓库：
//   LUOGU_COOKIE  —— 浏览器里复制的整行 Cookie（至少含 __client_id，通常还有 _uid）
// 用法：
//   $env:LUOGU_COOKIE="__client_id=...; _uid=..."; node scripts/fetch-luogu-training.mjs
//   可选：--type book.jinjiezhinan,book.luogujingxi（默认抓全部三个书系）
//         --concurrency 2 --delay 900（洛谷对匿名抓取有风控，慢一点更稳）
//         --skip-existing（跳过已抓到的题目；重抓失败项时用）
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeLuoguTagNames } from "../lib/luogu-tag-map.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(ROOT, "curriculum", "luogu-training-problems.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const LENTILLE_CONTEXT = /<script[^>]*id=["']lentille-context["'][^>]*>([\s\S]*?)<\/script>/i;

// 书系 key → 书籍全名（与洛谷 /training/list 的 categories 一致；这里写全名便于辨认）。
// 注意：题目上的 `source` 短名（《实战笔记》等）只由 lib/curriculum-book-problems.mjs 的
// BOOK_SERIES_LABELS 决定，那份清单同时被 convert-curriculum 使用，这里不重复声明短名，
// 避免同一件事有两个来源。
const BOOK_SERIES = {
  "book.jinjiezhinan": "《算法竞赛进阶指南》（李煜东）",
  "book.luogujingxi": "罗勇军《算法竞赛试炼场：洛谷 300 题精析》",
  "book.shizhanbiji": "《算法竞赛实战笔记》",
};

// 与书籍章节对应的题单顺序：进阶指南按「章-例题/习题」，实战笔记按章号。
// 这里只做展示顺序，不参与知识点归属。
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

const ARGS = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = ARGS.indexOf(name);
  return index >= 0 ? ARGS[index + 1] : fallback;
};
const CONCURRENCY = Math.max(1, Number(argValue("--concurrency", 2)));
const REQUEST_DELAY = Math.max(0, Number(argValue("--delay", 700)));
const MAX_RETRY = 3;
const SKIP_EXISTING = ARGS.includes("--skip-existing");
const COOKIE = String(process.env.LUOGU_COOKIE || "").trim();

// 书系列表在 main() 里解析：本模块被测试 import 时不应该因为缺少凭证而退出。
function selectedTypes() {
  return String(argValue("--type", Object.keys(BOOK_SERIES).join(",")))
    .split(",")
    .map((value) => value.trim())
    .filter((value) => BOOK_SERIES[value]);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── HTTP：保留 Cookie 罐（C3VK 挑战 cookie 会被追加）─────────────────────────
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function absorbCookies(response) {
  const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const raw = list.length ? list : [response.headers.get("set-cookie")].filter(Boolean);
  for (const value of raw) {
    for (const part of String(value).split(/,(?=[^;,=]+=)/)) {
      const [name, ...rest] = part.split(";")[0].split("=");
      if (name && rest.length) jar.set(name.trim(), rest.join("=").trim());
    }
  }
}

async function fetchPage(url, { referer } = {}) {
  const headers = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "zh-CN,zh;q=0.9",
    ...(referer ? { Referer: referer } : {}),
    ...(jar.size ? { Cookie: cookieHeader() } : {}),
  };
  let response = await fetch(url, { headers, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    absorbCookies(response);
    response = await fetch(url, { headers: { ...headers, Cookie: cookieHeader() }, redirect: "manual" });
  }
  if (response.status >= 300 && response.status < 400) return { status: response.status, text: "" };
  absorbCookies(response);
  return { status: response.status, text: await response.text() };
}

function parseContext(text) {
  const match = text.match(LENTILLE_CONTEXT);
  if (!match) return null;
  try {
    return JSON.parse(match[1])?.data || null;
  } catch {
    return null;
  }
}

// ── 步骤 1：书系目录 ────────────────────────────────────────────────────────
async function fetchSeries(type) {
  const url = `https://www.luogu.com.cn/training/list?type=${encodeURIComponent(type)}`;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const { status, text } = await fetchPage(url);
      const data = parseContext(text);
      const list = data?.trainings?.result;
      if (status === 200 && Array.isArray(list)) {
        return list.map((t) => ({ id: Number(t.id), name: String(t.name || ""), problemCount: Number(t.problemCount) || 0 }));
      }
      if (attempt < MAX_RETRY) await sleep(500 * attempt);
    } catch (error) {
      if (attempt === MAX_RETRY) throw new Error(`目录页请求失败 ${type}: ${error.message}`);
      await sleep(500 * attempt);
    }
  }
  throw new Error(`目录页拿不到题单列表：${type}`);
}

// ── 步骤 2：题单详情页 → 题目清单 ───────────────────────────────────────────
// 正文里的题号清单形如： <ol><li><a href="/problem/P1226">P1226 - 【模板】快速幂</a></li>…
// 题单说明区（Markdown 正文）里也有「P2879 [USACO07JAN] Tallest Cow S」这种纯文本列表，
// 没有 <a>，因此只认带链接的 <li>，避免把说明文字里的历史题号混进来。
const PROBLEM_LINK = /<li>\s*<a[^>]*href=["']\/problem\/([^"'/?#]+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi;

export function parseTrainingProblems(html) {
  const problems = [];
  const seen = new Set();
  for (const match of String(html).matchAll(PROBLEM_LINK)) {
    const pid = decodeHtml(match[1]).trim();
    if (!pid || seen.has(pid)) continue;
    const label = decodeHtml(match[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    // 页面把标题写成「P1226 - 【模板】快速幂」；少数没有分隔符时整段就是标题。
    const dash = label.indexOf(" - ");
    const name = dash >= 0 ? label.slice(dash + 3).trim() : label.replace(new RegExp(`^${pid}\\s*[-—]?\\s*`), "").trim();
    seen.add(pid);
    problems.push({ pid, name });
  }
  return problems;
}

function decodeHtml(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

async function fetchTrainingProblems(training) {
  const url = `https://www.luogu.com.cn/training/${training.id}`;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const { status, text } = await fetchPage(url, { referer: "https://www.luogu.com.cn/training/list" });
      if (status === 401 || /UserUnloginException/.test(text)) throw new Error("登录态失效（401），请更新 LUOGU_COOKIE");
      if (status === 200) {
        const problems = parseTrainingProblems(text);
        if (problems.length) return problems;
        // 题单确实可能为空，但正常书系题单不该为空：留一次重试再接受空结果。
        if (attempt === MAX_RETRY) return problems;
      }
      if (attempt < MAX_RETRY) await sleep(600 * attempt);
    } catch (error) {
      if (/登录态失效/.test(error.message)) throw error;
      if (attempt === MAX_RETRY) throw new Error(`题单 ${training.id} 抓取失败：${error.message}`);
      await sleep(600 * attempt);
    }
  }
  return [];
}

// ── 步骤 3：标签字典（匿名可读）────────────────────────────────────────────
async function fetchTagDictionary() {
  const { status, text } = await fetchPage("https://www.luogu.com.cn/_lfe/tags");
  if (status !== 200) throw new Error(`标签字典不可用（HTTP ${status}）`);
  const body = JSON.parse(text);
  const byId = new Map();
  for (const tag of body?.tags || []) {
    if (Number.isInteger(tag?.id) && typeof tag?.name === "string") byId.set(tag.id, { name: tag.name, type: tag.type });
  }
  if (!byId.size) throw new Error("标签字典为空");
  return byId;
}

// ── 步骤 4：题目元数据（题名 / 难度 / 标签）─────────────────────────────────
async function fetchProblemMeta(pid, dictionary) {
  const url = `https://www.luogu.com.cn/problem/${encodeURIComponent(pid)}`;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const { status, text } = await fetchPage(url, { referer: "https://www.luogu.com.cn/training/list" });
      if (status !== 200) {
        if (attempt < MAX_RETRY) { await sleep(400 * attempt); continue; }
        return { error: `http-${status}` };
      }
      const problem = parseContext(text)?.problem;
      if (!problem) return { error: "no-context" };
      const difficulty =
        typeof problem.difficulty === "number" ? LUOGU_DIFFICULTY[problem.difficulty] || "" : "";
      const tagNames = (problem.tags || [])
        .map((id) => dictionary.get(Number(id)))
        .filter((entry) => entry && entry.type === 2)
        .map((entry) => entry.name);
      return {
        name: String(problem.name || ""),
        difficulty,
        tags: normalizeLuoguTagNames(tagNames, { limit: 6 }),
      };
    } catch (error) {
      if (attempt === MAX_RETRY) return { error: error.message };
      await sleep(400 * attempt);
    }
  }
  return { error: "retry-exhausted" };
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
async function main() {
  if (!COOKIE) {
    console.error("缺少 LUOGU_COOKIE。题单详情页需要登录态，请设置环境变量后重跑：");
    console.error('  $env:LUOGU_COOKIE="__client_id=...; _uid=..."; node scripts/fetch-luogu-training.mjs');
    process.exitCode = 2;
    return;
  }
  for (const pair of COOKIE.split(";")) {
    const [name, ...rest] = pair.split("=");
    if (name && rest.length) jar.set(name.trim(), rest.join("=").trim());
  }
  const TYPES = selectedTypes();
  console.log(`书系：${TYPES.join(", ")}`);
  const dictionary = await fetchTagDictionary();
  console.log(`标签字典 ${dictionary.size} 条`);

  const collections = [];
  for (const type of TYPES) {
    const trainings = await fetchSeries(type);
    console.log(`\n${BOOK_SERIES[type]}：${trainings.length} 个题单`);
    for (const training of trainings) {
      const problems = await fetchTrainingProblems(training);
      collections.push({
        series: type,
        seriesName: BOOK_SERIES[type],
        id: training.id,
        name: training.name,
        problemCount: training.problemCount,
        problems: problems.map((p) => p.pid),
      });
      console.log(`  ${String(training.id).padStart(8)}  ${String(problems.length).padStart(3)}/${String(training.problemCount).padStart(3)}  ${training.name}`);
      await sleep(REQUEST_DELAY * (0.5 + Math.random()));
    }
  }

  // 去重收集题目，并记录每道题出现在哪些题单里
  const wanted = new Map();
  for (const collection of collections) {
    for (const pid of collection.problems) {
      if (!wanted.has(pid)) wanted.set(pid, []);
      wanted.get(pid).push(collection.id);
    }
  }
  let targets = [...wanted.keys()];

  // 增量：保留上一版已抓到的元数据
  let previous = { problems: [] };
  if (fs.existsSync(OUT_FILE)) {
    try {
      previous = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
      if (!Array.isArray(previous.problems)) previous.problems = [];
    } catch { previous = { problems: [] }; }
  }
  const known = new Map(previous.problems.map((p) => [p.pid, p]));
  if (SKIP_EXISTING) {
    // 只跳过「已抓到题名」的题目；上一轮失败（没有 name）的条目会被重新抓取，
    // 这样 --skip-existing 既能断点续抓，也能单独重试失败项。
    targets = targets.filter((pid) => !known.get(pid)?.name);
    console.log(`\n--skip-existing 过滤后待抓 ${targets.length} 道`);
  } else {
    console.log(`\n待抓题目 ${targets.length} 道（唯一）`);
  }

  const results = new Map();
  const failures = [];
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < targets.length) {
      const pid = targets[next++];
      const meta = await fetchProblemMeta(pid, dictionary);
      if (meta.name) results.set(pid, { pid, ...meta });
      else failures.push({ pid, reason: meta.error || "unknown" });
      done += 1;
      if (done % 50 === 0) console.log(`  进度 ${done}/${targets.length}，失败 ${failures.length}`);
      await sleep(REQUEST_DELAY * (0.5 + Math.random()));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, targets.length)) }, worker));

  // 合并：本轮结果优先，其余沿用上一版
  const merged = new Map();
  for (const [pid, entry] of known) if (entry?.name) merged.set(pid, entry);
  for (const [pid, entry] of results) merged.set(pid, entry);

  const problems = [...merged.values()]
    .filter((entry) => wanted.has(entry.pid))
    .map((entry) => ({ ...entry, collections: wanted.get(entry.pid).slice() }))
    .sort((a, b) => a.pid.localeCompare(b.pid, "zh-CN"));

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    note: "洛谷书系题单（《算法竞赛进阶指南》《洛谷精析》《算法竞赛实战笔记》）的题目清单与官方元数据。difficulty 为洛谷官方 8 级；tags 已按 lib/luogu-tag-map.mjs 归一到站内标签。collections 是该题出现的题单 id。",
    series: TYPES.map((type) => ({ key: type, name: BOOK_SERIES[type] })),
    collections,
    problems,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2).replace(/\n/g, "\r\n") + "\r\n", "utf8");

  const covered = problems.length;
  const totalUnique = wanted.size;
  console.log(`\n完成：题单 ${collections.reduce((sum, c) => sum + c.problems.length, 0)} 条题目引用，唯一题号 ${totalUnique}，元数据成功 ${covered}，失败 ${failures.length}`);
  if (failures.length) {
    console.log("失败清单（重跑时会自动重试）：");
    for (const failure of failures.slice(0, 40)) console.log(`  ${failure.pid}  ${failure.reason}`);
  }
  console.log(`写出 ${path.relative(ROOT, OUT_FILE)}`);
}

// 只有直接执行时才跑主流程，便于测试直接 import 解析函数。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
