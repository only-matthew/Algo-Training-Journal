// 本地按需运行：node scripts/smoke-build-cache.mjs。两次完整构建不进入日常 CI。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const epoch = Date.parse("2026-10-03T04:00:00Z") / 1000;
for (const seconds of [epoch, epoch + 60]) {
  const result = spawnSync(process.execPath, ["scripts/generate-data.js"], {
    cwd: root, encoding: "utf8", env: { ...process.env, SOURCE_DATE_EPOCH: String(seconds) },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  if (seconds !== epoch) assert.match(result.stdout, /\d+ reused, 0 rebuilt/);
  console.log(result.stdout.trim().split("\n").at(-1));
}
const state = JSON.parse(fs.readFileSync(path.join(root, ".build-cache", "site-state.json"), "utf8"));
const pages = Object.values(state.entries).flatMap((entry) => entry.outputs).filter((output) => output.endsWith("index.html"));
assert.ok(pages.length > 300);
for (const output of pages) {
  const html = fs.readFileSync(path.join(root, "site", output), "utf8");
  assert.match(html, /(?:id="site-version"|class="footer-version")[^>]*>[^<]*2026-10-03 12:01 UTC\+8/, output);
}
console.log(`Checked ${pages.length} page footers.`);
