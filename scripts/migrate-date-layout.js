const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOGS_DIR = path.join(ROOT, "logs");
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function moveDateDir(memberDir, entry) {
  const match = entry.name.match(DATE_PATTERN);
  if (!match || !entry.isDirectory()) return false;

  const [, year, month, day] = match;
  const targetDir = path.join(memberDir, year, month, day);
  if (fs.existsSync(targetDir)) {
    throw new Error(`目标目录已存在，未覆盖：${path.relative(ROOT, targetDir)}`);
  }

  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.renameSync(path.join(memberDir, entry.name), targetDir);
  console.log(`MOVED ${path.basename(memberDir)}/${entry.name} -> ${year}/${month}/${day}`);
  return true;
}

if (!fs.existsSync(LOGS_DIR)) {
  console.log("No logs directory found.");
  process.exit(0);
}

let total = 0;
for (const memberEntry of fs.readdirSync(LOGS_DIR, { withFileTypes: true })) {
  if (!memberEntry.isDirectory()) continue;
  const memberDir = path.join(LOGS_DIR, memberEntry.name);
  for (const entry of fs.readdirSync(memberDir, { withFileTypes: true })) {
    if (moveDateDir(memberDir, entry)) total++;
  }
}

console.log(`\nDone. Migrated ${total} date director${total === 1 ? "y" : "ies"}.`);