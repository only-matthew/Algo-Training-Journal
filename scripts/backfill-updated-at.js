// 将缺失 updatedAt 的 meta.json 回填为 git 最后一次提交时间。
// 用途：文件 mtime 在 clone/pull 时会被重置为拉取时刻，不可靠；
// 每次打卡保存都会产生一次 commit，因此 git 提交时间才是准确的最后更新时间。
// 用法：node scripts/backfill-updated-at.js
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOGS_DIR = path.join(ROOT, "logs");
const YEAR_PATTERN = /^\d{4}$/;
const MONTH_PATTERN = /^(0[1-9]|1[0-2])$/;
const DAY_PATTERN = /^(0[1-9]|[12]\d|3[01])$/;

function lastCommitDate(relPath) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", relPath], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

// 规范化为 UTC+8 的 ISO 字符串，如 2026-08-11T01:09:44.000+08:00
function toUtc8(iso) {
  const date = new Date(iso);
  const cn = new Date(date.getTime() + 8 * 3600 * 1000);
  return cn.toISOString().replace("Z", "+08:00");
}

function listDateLogs() {
  const found = [];
  if (!fs.existsSync(LOGS_DIR)) return found;
  for (const member of fs.readdirSync(LOGS_DIR)) {
    const memberDir = path.join(LOGS_DIR, member);
    if (!fs.statSync(memberDir).isDirectory()) continue;
    for (const year of fs.readdirSync(memberDir)) {
      if (!YEAR_PATTERN.test(year)) continue;
      const yearDir = path.join(memberDir, year);
      for (const month of fs.readdirSync(yearDir)) {
        if (!MONTH_PATTERN.test(month)) continue;
        const monthDir = path.join(yearDir, month);
        for (const day of fs.readdirSync(monthDir)) {
          if (!DAY_PATTERN.test(day)) continue;
          const metaPath = path.join(monthDir, day, "meta.json");
          if (!fs.existsSync(metaPath)) continue;
          found.push({ member, date: `${year}-${month}-${day}`, metaPath });
        }
      }
    }
  }
  return found;
}

function main() {
  let updated = 0;
  let skipped = 0;
  for (const { member, date, metaPath } of listDateLogs()) {
    let meta;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch (error) {
      console.error(`跳过无法解析的文件 ${metaPath}: ${error.message}`);
      skipped += 1;
      continue;
    }
    if (typeof meta.updatedAt === "string" && meta.updatedAt) {
      skipped += 1;
      continue;
    }
    const relPath = path.relative(ROOT, metaPath).split(path.sep).join("/");
    const commitDate = lastCommitDate(relPath);
    if (!commitDate) {
      console.warn(`没有 git 提交历史，跳过 ${relPath}`);
      skipped += 1;
      continue;
    }
    const updatedAt = toUtc8(commitDate);
    meta.updatedAt = updatedAt;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
    console.log(`回填 ${member} ${date}: updatedAt = ${updatedAt}`);
    updated += 1;
  }
  console.log(`完成：回填 ${updated} 条，跳过 ${skipped} 条。`);
}

main();
