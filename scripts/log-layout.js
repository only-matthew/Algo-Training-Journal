const fs = require("fs");
const path = require("path");

const LEGACY_LOG_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_PATTERN = /^\d{4}$/;
const MONTH_PATTERN = /^(0[1-9]|1[0-2])$/;
const DAY_PATTERN = /^(0[1-9]|[12]\d|3[01])$/;

function discoverDateDirs(logsDir) {
  if (!fs.existsSync(logsDir)) return { members: [], dateDirs: [] };
  const members = fs.readdirSync(logsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
  const dateDirs = [];
  for (const member of members) {
    const memberDir = path.join(logsDir, member);
    for (const entry of fs.readdirSync(memberDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (LEGACY_LOG_DIR_PATTERN.test(entry.name)) {
        dateDirs.push({ member, date: entry.name, dir: path.join(memberDir, entry.name) });
        continue;
      }
      if (!YEAR_PATTERN.test(entry.name)) continue;
      const yearDir = path.join(memberDir, entry.name);
      for (const monthEntry of fs.readdirSync(yearDir, { withFileTypes: true })) {
        if (!monthEntry.isDirectory() || !MONTH_PATTERN.test(monthEntry.name)) continue;
        const monthDir = path.join(yearDir, monthEntry.name);
        for (const dayEntry of fs.readdirSync(monthDir, { withFileTypes: true })) {
          if (!dayEntry.isDirectory() || !DAY_PATTERN.test(dayEntry.name)) continue;
          dateDirs.push({ member, date: `${entry.name}-${monthEntry.name}-${dayEntry.name}`, dir: path.join(monthDir, dayEntry.name) });
        }
      }
    }
  }
  const seen = new Map();
  for (const entry of dateDirs) {
    const key = `${entry.member}|${entry.date}`;
    const previous = seen.get(key);
    if (previous) throw new Error(`同一成员同一天存在两种日志目录：${previous.dir} 和 ${entry.dir}`);
    seen.set(key, entry);
  }
  return { members, dateDirs };
}

module.exports = { discoverDateDirs };
