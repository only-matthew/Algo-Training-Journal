import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDifficultyRating, DIFFICULTY_LABEL_RATING } from "../lib/rating.mjs";
import { requestLuoguPage, readLimitedBody } from "../workers/services/luogu-page.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LUOGU_LABELS = ["", "入门", "普及-", "普及", "普及+/提高-", "提高", "提高+/省选-", "省选/NOI-", "NOI/NOI+/CTS"];

function metaFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? metaFiles(file) : entry.name === "meta.json" ? [file] : [];
  });
}

// Only unresolved difficulties are eligible; never replace a user's existing choice.
export async function syncMissingDifficulty({ root = ROOT, fetchImpl = fetch, write = false, report = console.log } = {}) {
  const documents = metaFiles(path.join(root, "logs")).map((file) => ({ file, meta: JSON.parse(fs.readFileSync(file, "utf8")), changed: false }));
  const wanted = new Map();
  for (const doc of documents) for (const problem of doc.meta.problems || []) {
    if (resolveDifficultyRating(problem)) continue;
    const platform = String(problem.platform || "").toLowerCase();
    const number = String(problem.problemNumber || "").trim().toUpperCase();
    const kind = platform === "codeforces" || platform === "cf" ? "cf" : platform === "洛谷" || platform === "luogu" ? "luogu" : "";
    if (!kind || !(kind === "cf" ? /^\d+[A-Z]\d*$/ : /^[A-Z][A-Z0-9_]*$/).test(number)) continue;
    const key = `${kind}:${number}`;
    if (!wanted.has(key)) wanted.set(key, { kind, number, targets: [] });
    wanted.get(key).targets.push({ doc, problem });
  }
  const found = new Map();
  if ([...wanted.values()].some((item) => item.kind === "cf")) {
    try {
      const response = await fetchImpl("https://codeforces.com/api/problemset.problems", { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.status !== "OK" || !Array.isArray(data.result?.problems)) throw new Error("invalid catalog");
      for (const p of data.result.problems) {
        if (Number.isInteger(p.rating) && p.rating > 0) found.set(`cf:${p.contestId}${String(p.index).toUpperCase()}`, { rating: p.rating, source: `CF 官方 rating ${p.rating}` });
      }
    } catch (error) { report(`CF 查询失败，保留未标注：${error.message}`); }
  }
  for (const [key, item] of wanted) {
    if (item.kind !== "luogu") continue;
    try {
      const controller = { signal: AbortSignal.timeout(15000) };
      const { response, error, blocked } = await requestLuoguPage(`https://www.luogu.com.cn/problem/${encodeURIComponent(item.number)}`, {
        fetchImpl, controller, headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "zh-CN,zh;q=0.9" },
      });
      if (error || blocked || !response?.ok) throw error || new Error(`HTTP ${response?.status || "blocked"}`);
      const html = await readLimitedBody(response, controller.signal);
      const match = html.match(/<script[^>]*id=["']lentille-context["'][^>]*>([\s\S]*?)<\/script>/i);
      if (!match) throw new Error("missing problem metadata");
      const difficulty = JSON.parse(match[1])?.data?.problem?.difficulty;
      const label = LUOGU_LABELS[difficulty];
      if (label) found.set(key, { rating: DIFFICULTY_LABEL_RATING[label], source: `洛谷官方难度「${label}」换算` });
    } catch (error) { report(`洛谷 ${item.number} 查询失败，保留未标注：${error.message}`); }
  }
  let updated = 0;
  for (const [key, item] of wanted) {
    const value = found.get(key);
    if (!value) continue;
    for (const { doc, problem } of item.targets) {
      problem.difficulty = `★ ${value.rating}`;
      problem.difficultyRating = value.rating;
      problem.difficultyRatingSource = value.source;
      doc.changed = true;
      updated++;
    }
    report(`${key} → ★ ${value.rating}（${item.targets.length} 条记录）`);
  }
  // Do not change training dates or updatedAt when only adding official metadata.
  if (write) for (const doc of documents) if (doc.changed) fs.writeFileSync(doc.file, `${JSON.stringify(doc.meta, null, 2)}\n`);
  const pending = [...wanted.keys()].filter((key) => !found.has(key)).length;
  report(`难度补全：${wanted.size} 道待查题，${updated} 条记录${write ? "已更新" : "可更新"}，${pending} 道下次构建重试。`);
  return { updated, pending };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await syncMissingDifficulty({ write: process.argv.includes("--write") });
}
