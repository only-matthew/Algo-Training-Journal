import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logsRoot = path.join(root, "logs");
const backupPath = path.join(root, "docs", "archive", "2026-09-29-takeaway-placeholders.json");
const write = process.argv.includes("--write");
const restore = process.argv.includes("--restore");
if (restore) {
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  if (backup.schemaVersion !== 1 || backup.count !== backup.entries?.length) throw new Error("备份格式无效");
  for (const entry of backup.entries) {
    if (!/^logs\/[^/]+\/(?:\d{4}-\d{2}-\d{2}|\d{4}\/\d{2}\/\d{2})\/\d+-takeaway\.md$/.test(entry.path)) throw new Error(`备份路径无效：${entry.path}`);
    const target = path.join(root, entry.path);
    if (fs.existsSync(target)) throw new Error(`目标已存在，拒绝覆盖：${entry.path}`);
    const bytes = Buffer.from(entry.base64, "base64");
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error(`备份校验失败：${entry.path}`);
  }
  for (const entry of backup.entries) fs.writeFileSync(path.join(root, entry.path), Buffer.from(entry.base64, "base64"));
  console.log(`已恢复 ${backup.entries.length} 个原始占位文件。`);
  process.exit(0);
}
const matches = [];

function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { scan(full); continue; }
    if (!entry.isFile() || !/^\d+-takeaway\.md$/.test(entry.name)) continue;
    const bytes = fs.readFileSync(full);
    const content = bytes.toString("utf8");
    if (!["未填写", "未填写\n", "未填写\r\n"].includes(content)) continue;
    matches.push({
      path: path.relative(root, full).split(path.sep).join("/"),
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      base64: bytes.toString("base64"),
    });
  }
}

scan(logsRoot);
matches.sort((a, b) => a.path.localeCompare(b.path));
if (write && matches.length) {
  if (fs.existsSync(backupPath)) throw new Error(`备份已存在，拒绝覆盖：${backupPath}`);
  fs.writeFileSync(backupPath, `${JSON.stringify({ schemaVersion: 1, count: matches.length, entries: matches }, null, 2)}\n`);
  for (const entry of matches) {
    const full = path.join(root, entry.path);
    const actual = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    if (actual !== entry.sha256) throw new Error(`清理前内容已变化：${entry.path}`);
    fs.unlinkSync(full);
  }
}
console.log(`${matches.length} 个纯占位心得${write && matches.length ? `已备份至 ${path.relative(root, backupPath)} 并清理` : "待清理"}。`);
