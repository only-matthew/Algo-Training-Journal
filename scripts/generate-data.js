const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOGS_DIR = path.join(ROOT, "logs");
const OUTPUT_DIR = path.join(ROOT, "site");
const LOG_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.md$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseOneProblem(markdownBlock) {
  const lines = markdownBlock.split(/\r?\n/);
  const sections = {};
  let currentKey = null;
  let buffer = [];

  const flush = () => {
    if (!currentKey) return;
    sections[currentKey] = buffer.join("\n").trim();
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)\s*$/);
    if (headingMatch) {
      flush();
      currentKey = headingMatch[1].trim();
      buffer = [];
      continue;
    }
    if (currentKey) {
      buffer.push(line);
    }
  }
  flush();

  return {
    problem: sections["题目"] || sections["Problem"] || "",
    platform: sections["平台"] || sections["Platform"] || "",
    takeaway: sections["收获"] || sections["Takeaway"] || "",
    difficulty: sections["难度"] || sections["Difficulty"] || "",
  };
}

function parseProblems(markdown) {
  // 用 --- 分隔线拆分多道题目，兼容单道题目的旧格式
  const blocks = markdown.split(/\r?\n---+\r?\n/);
  return blocks
    .map((block) => parseOneProblem(block))
    .filter((p) => p.problem.trim());
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
    const files = fs.readdirSync(memberDir);
    for (const file of files) {
      const match = file.match(LOG_FILE_PATTERN);
      if (!match) continue;

      const date = match[1];
      const markdown = fs.readFileSync(path.join(memberDir, file), "utf8");
      const problems = parseProblems(markdown);
      for (const parsed of problems) {
        logs.push({
          member,
          date,
          problem: parsed.problem || "未填写",
          platform: parsed.platform || "未填写",
          takeaway: parsed.takeaway || "未填写",
          difficulty: parsed.difficulty || "未标注",
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
