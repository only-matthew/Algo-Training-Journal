// 一次性迁移脚本：将旧格式 logs/{member}/{date}.md → 新格式 logs/{member}/{date}/
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOGS_DIR = path.join(ROOT, "logs");
const LOG_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.md$/;

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
    problem: sections["题目"] || "",
    platform: sections["平台"] || "未填写",
    difficulty: sections["难度"] || "未标注",
    description: sections["题目描述"] || "",
    takeaway: sections["收获"] || "",
    code: sections["代码"] || "",
  };
}

function parseProblems(markdown) {
  // Remove the leading # YYYY-MM-DD title
  const cleaned = markdown.replace(/^#[^\n]*\r?\n/, "").trimStart();
  // Split by ## 题目 headings (not ---, which can appear inside content)
  const blocks = cleaned.split(/\r?\n(?=## 题目\s*\r?\n)/);
  return blocks.map((block) => parseOneProblem(block)).filter((p) => p.problem.trim());
}

function migrateOneFile(memberDir, filename) {
  const member = path.basename(memberDir);
  const match = filename.match(LOG_FILE_PATTERN);
  if (!match) return null;
  const date = match[1];

  const srcPath = path.join(memberDir, filename);
  const markdown = fs.readFileSync(srcPath, "utf8");
  const problems = parseProblems(markdown);

  if (!problems.length) {
    console.log(`  SKIP ${member}/${date}: no problems parsed`);
    return null;
  }

  const targetDir = path.join(memberDir, date);
  fs.mkdirSync(targetDir, { recursive: true });

  // Write meta.json
  const meta = {
    problems: problems.map((p) => ({
      name: p.problem,
      platform: p.platform,
      difficulty: p.difficulty,
    })),
  };
  fs.writeFileSync(path.join(targetDir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");

  // Write per-problem files
  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    if (p.description) {
      fs.writeFileSync(path.join(targetDir, `${i}-desc.md`), p.description, "utf8");
    }
    fs.writeFileSync(path.join(targetDir, `${i}-takeaway.md`), p.takeaway || "未填写", "utf8");
    if (p.code) {
      fs.writeFileSync(path.join(targetDir, `${i}-solution.cpp`), p.code, "utf8");
    }
  }

  console.log(`  MIGRATED ${member}/${date} (${problems.length} problem(s))`);
  return { member, date, count: problems.length };
}

// Main
if (!fs.existsSync(LOGS_DIR)) {
  console.log("No logs directory found.");
  process.exit(0);
}

const members = fs
  .readdirSync(LOGS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

let total = 0;
for (const member of members) {
  const memberDir = path.join(LOGS_DIR, member);
  const files = fs.readdirSync(memberDir);
  for (const file of files) {
    const result = migrateOneFile(memberDir, file);
    if (result) total++;
  }
}

console.log(`\nDone. Migrated ${total} log entries.`);