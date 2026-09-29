import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { ESLint } from "eslint";

const require = createRequire(import.meta.url);
const { discoverDateDirs } = require("../scripts/generate-data.js");

test("generator rejects legacy and nested directories for the same member and date", (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "journal-logs-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const legacy = path.join(root, "member", "2026-09-29");
  const nested = path.join(root, "member", "2026", "09", "29");
  mkdirSync(legacy, { recursive: true });
  mkdirSync(nested, { recursive: true });

  assert.throws(() => discoverDateDirs(root), (error) => {
    assert.match(error.message, /同一成员同一天存在两种日志目录/);
    assert.ok(error.message.includes(legacy));
    assert.ok(error.message.includes(nested));
    return true;
  });
});

test("ESLint ignores generated directories while still checking source files", async () => {
  const eslint = new ESLint();
  for (const file of ["workers/.build-cache/worker-dryrun/oauth.js", "site/app.js", "build/app.js"]) {
    assert.equal(await eslint.isPathIgnored(file), true, `${file} must be ignored`);
  }
  assert.equal(await eslint.isPathIgnored("workers/oauth.mjs"), false);
});
