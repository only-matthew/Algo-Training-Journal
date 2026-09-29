import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { normalizeMeta } from "../lib/log-schema.mjs";
import { buildPeriodReport } from "../lib/period-report.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { discoverDateDirs } = require("./log-layout.js");
const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const from = option("--from");
const to = option("--to");
if (!from || !to) throw new Error("用法：npm run report:period -- --from YYYY-MM-DD --to YYYY-MM-DD [--out 路径]");

const hash = crypto.createHash("sha256");
const records = [];
const personalLists = {};
for (const member of discoverDateDirs(path.join(root, "logs")).members) {
  const listPath = path.join(root, "logs", member, "my-list.json");
  if (!fs.existsSync(listPath)) continue;
  const bytes = fs.readFileSync(listPath);
  hash.update(path.relative(root, listPath)).update(bytes);
  personalLists[member] = JSON.parse(bytes.toString("utf8")).items;
}
for (const { member, date, dir } of discoverDateDirs(path.join(root, "logs")).dateDirs.sort((a, b) => a.dir.localeCompare(b.dir))) {
  const metaPath = path.join(dir, "meta.json");
  if (!fs.existsSync(metaPath)) continue;
  const metaBytes = fs.readFileSync(metaPath);
  const meta = normalizeMeta(JSON.parse(metaBytes.toString("utf8")), { legacyIdPrefix: `${member}-${date}` });
  hash.update(path.relative(root, metaPath)).update(metaBytes);
  for (const [index, problem] of meta.problems.entries()) {
    const slot = Number.isInteger(problem.fileIndex) ? problem.fileIndex : index;
    const takeawayPath = path.join(dir, `${slot}-takeaway.md`);
    const takeawayBytes = fs.existsSync(takeawayPath) ? fs.readFileSync(takeawayPath) : Buffer.alloc(0);
    hash.update(path.relative(root, takeawayPath)).update(takeawayBytes);
    records.push({ member, date, startedOn: meta.startedOn, solvedOn: meta.solvedOn,
      platform: problem.platform, problemNumber: problem.problemNumber, outcome: problem.outcome,
      reviewStatus: problem.reviewStatus, reviewDue: problem.reviewDue, takeaway: takeawayBytes.toString("utf8") });
  }
}
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const report = buildPeriodReport(records, { from, to, sourceCommit, sourceDataHash: hash.digest("hex"), personalLists });
const json = `${JSON.stringify(report, null, 2)}\n`;
const out = args.includes("--out") ? option("--out") : null;
if (out) {
  const target = path.resolve(root, out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, json);
  console.log(`周期报告已写入 ${target}`);
} else process.stdout.write(json);
