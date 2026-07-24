const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOGS_DIR = path.join(ROOT, "logs");
const OUTPUT_DIR = path.join(ROOT, "site");
const LOG_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readMeta(memberDir, dateDir) {
  const metaPath = path.join(memberDir, dateDir, "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, "utf8"));
}

function readProblemFile(dir, filename) {
  const p = path.join(dir, filename);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8").trim();
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
      if (!entry.isDirectory() || !LOG_DIR_PATTERN.test(entry.name)) continue;
      const date = entry.name;
      const dateDir = path.join(memberDir, date);
      const meta = readMeta(memberDir, date);
      if (!meta || !meta.problems || !meta.problems.length) continue;

      for (let i = 0; i < meta.problems.length; i++) {
        const p = meta.problems[i];
        logs.push({
          member,
          date,
          problem: p.name || "未填写",
          platform: p.platform || "未填写",
          description: readProblemFile(dateDir, `${i}-desc.md`),
          takeaway: readProblemFile(dateDir, `${i}-takeaway.md`) || "未填写",
          difficulty: p.difficulty || "未标注",
          code: readProblemFile(dateDir, `${i}-solution.cpp`),
        });
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

const { members, logs } = readLogs();
const heatmap = buildHeatmapCounts(logs);
const recent30 = buildRecentStats(logs, members);
const data = {
  generatedAt: new Date().toISOString(),
  members,
  logs,
  heatmap,
  recent30,
};

fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

copyFile("index.html");
copyFile("style.css");
copyFile("app.js");
if (fs.existsSync(path.join(ROOT, "CNAME"))) {
  copyFile("CNAME");
}
fs.writeFileSync(path.join(OUTPUT_DIR, ".nojekyll"), "", "utf8");
fs.writeFileSync(path.join(OUTPUT_DIR, "data.json"), JSON.stringify(data, null, 2), "utf8");

console.log(`Generated ${logs.length} logs for ${members.length} members.`);