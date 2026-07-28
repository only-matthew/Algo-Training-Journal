const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const LOGS_DIR = path.join(ROOT, "logs");
const OUTPUT_DIR = path.join(ROOT, "site");
const LEGACY_LOG_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_PATTERN = /^\d{4}$/;
const MONTH_PATTERN = /^(0[1-9]|1[0-2])$/;
const DAY_PATTERN = /^(0[1-9]|[12]\d|3[01])$/;
let normalizeMeta;

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readMeta(dateDir, member, date) {
  const metaPath = path.join(dateDir, "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  return normalizeMeta(JSON.parse(fs.readFileSync(metaPath, "utf8")), {
    legacyIdPrefix: `${member}-${date}`,
  });
}

function readProblemFile(dir, filename) {
  const p = path.join(dir, filename);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8").trim();
}

function appendDateLogs(logs, member, date, dateDir) {
  const meta = readMeta(dateDir, member, date);
  if (!meta || !meta.problems || !meta.problems.length) return;

  for (let i = 0; i < meta.problems.length; i++) {
    const p = meta.problems[i];
    logs.push({
      member,
      date,
      problemIndex: i,
      problemId: p.id,
      problem: p.name || "未填写",
      platform: p.platform || "未填写",
      problemNumber: p.problemNumber || "",
      description: readProblemFile(dateDir, `${i}-desc.md`),
      takeaway: readProblemFile(dateDir, `${i}-takeaway.md`) || "未填写",
      difficulty: p.difficulty || "未标注",
      tags: p.tags || [],
      reviewStatus: p.reviewStatus || "none",
      code: readProblemFile(dateDir, `${i}-solution.cpp`),
    });
  }
}

function listMembers() {
  if (!fs.existsSync(LOGS_DIR)) return [];
  return fs
    .readdirSync(LOGS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function readLogs() {
  const members = listMembers();
  const logs = [];

  for (const member of members) {
    const memberDir = path.join(LOGS_DIR, member);
    const entries = fs.readdirSync(memberDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // 兼容迁移期间的旧目录：logs/姓名/YYYY-MM-DD/
      if (LEGACY_LOG_DIR_PATTERN.test(entry.name)) {
        appendDateLogs(logs, member, entry.name, path.join(memberDir, entry.name));
        continue;
      }

      if (!YEAR_PATTERN.test(entry.name)) continue;
      const yearDir = path.join(memberDir, entry.name);
      for (const monthEntry of fs.readdirSync(yearDir, { withFileTypes: true })) {
        if (!monthEntry.isDirectory() || !MONTH_PATTERN.test(monthEntry.name)) continue;
        const monthDir = path.join(yearDir, monthEntry.name);
        for (const dayEntry of fs.readdirSync(monthDir, { withFileTypes: true })) {
          if (!dayEntry.isDirectory() || !DAY_PATTERN.test(dayEntry.name)) continue;
          const date = `${entry.name}-${monthEntry.name}-${dayEntry.name}`;
          appendDateLogs(logs, member, date, path.join(monthDir, dayEntry.name));
        }
      }
    }
  }

  logs.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.member.localeCompare(b.member, "zh-CN") ||
      a.problem.localeCompare(b.problem, "zh-CN"),
  );

  return { members, logs };
}

function buildHeatmapCounts(logs) {
  const all = {};
  const byMember = {};

  for (const log of logs) {
    all[log.date] = (all[log.date] || 0) + 1;
    byMember[log.member] ??= {};
    byMember[log.member][log.date] = (byMember[log.member][log.date] || 0) + 1;
  }

  return { all, byMember };
}

function buildRecentStats(logs, members) {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 29);
  const start = toDateString(startDate);
  const end = toDateString(endDate);

  const withinRange = logs.filter((log) => log.date >= start && log.date <= end);

  function summarize(items) {
    const activeDays = new Set(items.map((item) => item.date)).size;
    const byPlatform = {};
    const byDifficulty = {};
    for (const item of items) {
      byPlatform[item.platform] = (byPlatform[item.platform] || 0) + 1;
      byDifficulty[item.difficulty] = (byDifficulty[item.difficulty] || 0) + 1;
    }

    return {
      totalLogs: items.length,
      activeDays,
      avgPerWeek: Number(((items.length * 7) / 30).toFixed(1)),
      byPlatform,
      byDifficulty,
    };
  }

  const byMember = { all: summarize(withinRange) };
  for (const member of members) {
    byMember[member] = summarize(withinRange.filter((item) => item.member === member));
  }

  return { start, end, byMember };
}

function copyFile(name) {
  fs.copyFileSync(path.join(ROOT, name), path.join(OUTPUT_DIR, name));
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(path.join(ROOT, src), { withFileTypes: true })) {
    const srcPath = path.join(ROOT, src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(path.join(src, entry.name), destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function assetVersion(name) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(ROOT, name)))
    .digest("hex")
    .slice(0, 12);
}

function logSummary({ description, takeaway, code, ...summary }) {
  return summary;
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateString(date);
}

function appVersion() {
  return crypto
    .createHash("sha256")
    .update(["app.js", "lib/log-schema.mjs", "lib/journal-api.js", "lib/render-safety.mjs"].map((name) => fs.readFileSync(path.join(ROOT, name))).join(""))
    .digest("hex")
    .slice(0, 12);
}

function writeVersionedIndex(dataVersion) {
  const html = fs
    .readFileSync(path.join(ROOT, "index.html"), "utf8")
    .replace(/__DATA_VERSION__/g, dataVersion)
    .replace(/style\.css(?:\?v=[^"']*)?/g, `style.css?v=${assetVersion("style.css")}`)
    .replace(/app\.js(?:\?v=[^"']*)?/g, `app.js?v=${appVersion()}`);
  fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), html, "utf8");
  return html;
}

function writeVersionedApp() {
  const source = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const html = source
    .replace("./lib/log-schema.mjs", `./lib/log-schema.mjs?v=${assetVersion("lib/log-schema.mjs")}`)
    .replace("./lib/journal-api.js", `./lib/journal-api.js?v=${assetVersion("lib/journal-api.js")}`)
    .replace("./lib/render-safety.mjs", `./lib/render-safety.mjs?v=${assetVersion("lib/render-safety.mjs")}`);
  fs.writeFileSync(path.join(OUTPUT_DIR, "app.js"), html, "utf8");
}

function writeRouteIndex(html, segments) {
  const routeDir = path.join(OUTPUT_DIR, ...segments);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, "index.html"), html, "utf8");
}

function writeRouteIndexes(html, members, logs) {
  for (const route of ["analysis", "review"]) writeRouteIndex(html, [route]);
  for (const member of members) writeRouteIndex(html, ["member", member]);
  for (const log of logs) {
    writeRouteIndex(html, ["problem", log.member, log.date, String(log.problemId || log.problemIndex || 0)]);
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, "404.html"), html, "utf8");
}

function writeJson(relativePath, value) {
  const outputPath = path.join(OUTPUT_DIR, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(value), "utf8");
}

function writeProblemDetails(logs, generatedAt) {
  for (const log of logs) {
    writeJson(path.join("data", "problems", log.member, log.date, `${log.problemId || log.problemIndex || 0}.json`), {
      schemaVersion: 3,
      generatedAt,
      ...log,
    });
  }
}

async function main() {
  ({ normalizeMeta } = await import("../lib/log-schema.mjs"));
  const { members, logs } = readLogs();
  const heatmap = buildHeatmapCounts(logs);
  const recent30 = buildRecentStats(logs, members);
  const generatedAt = new Date().toISOString();
  const summaryLogs = logs.map(logSummary);
  const fullData = { schemaVersion: 3, generatedAt, members, logs: summaryLogs, heatmap, recent30 };
  const overviewData = {
    schemaVersion: 3,
    generatedAt,
    members,
    logs: summaryLogs.filter((log) => log.date >= daysAgo(29)),
    heatmap,
    recent30,
  };
  const dataVersion = crypto.createHash("sha256").update(JSON.stringify(fullData)).digest("hex").slice(0, 12);

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(OUTPUT_DIR, "lib"), { recursive: true });
  copyDirRecursive("vendor", path.join(OUTPUT_DIR, "vendor"));
  copyFile("style.css");
  writeVersionedApp();
  fs.copyFileSync(path.join(ROOT, "lib", "log-schema.mjs"), path.join(OUTPUT_DIR, "lib", "log-schema.mjs"));
  fs.copyFileSync(path.join(ROOT, "lib", "journal-api.js"), path.join(OUTPUT_DIR, "lib", "journal-api.js"));
  fs.copyFileSync(path.join(ROOT, "lib", "render-safety.mjs"), path.join(OUTPUT_DIR, "lib", "render-safety.mjs"));
  const html = writeVersionedIndex(dataVersion);
  writeRouteIndexes(html, members, logs);
  if (fs.existsSync(path.join(ROOT, "CNAME"))) copyFile("CNAME");
  fs.writeFileSync(path.join(OUTPUT_DIR, ".nojekyll"), "", "utf8");
  writeJson(path.join("data", "overview.json"), overviewData);
  writeJson(path.join("data", "all.json"), fullData);
  writeProblemDetails(logs, generatedAt);
  console.log(`Generated ${logs.length} logs for ${members.length} members.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
