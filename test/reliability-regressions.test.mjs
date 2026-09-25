import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { journalScopeForRoute } from "../lib/journal-scope.mjs";

test("journal data scopes distinguish analysis, review and individual members", () => {
  assert.equal(journalScopeForRoute(""), "overview");
  assert.equal(journalScopeForRoute("analysis"), "analysis");
  assert.equal(journalScopeForRoute("report"), "analysis");
  assert.equal(journalScopeForRoute("review"), "review");
  assert.equal(journalScopeForRoute("member/%E5%BB%96%E5%A4%8F"), "member:廖夏");
  assert.notEqual(journalScopeForRoute("member/%E5%BB%96%E5%A4%8F"), journalScopeForRoute("member/%E7%8E%8B%E6%A2%93%E8%B1%AA"));
});

test("form awaits async write failure messages and requires explicit conflict overwrite", () => {
  const source = fs.readFileSync(new URL("../lib/form.mjs", import.meta.url), "utf8");
  assert.match(source, /await describeWriteFailure\(err, "保存"\)/);
  assert.match(source, /await describeWriteFailure\(err, "删除"\)/);
  assert.match(source, /if \(activeFormConflictRevision !== undefined\)/);
  assert.match(source, /confirm\("服务器上的这一天已被修改/);
});

test("generated service worker caches navigation responses by request URL", () => {
  const source = fs.readFileSync(new URL("../scripts/generate-data.js", import.meta.url), "utf8");
  assert.match(source, /cache\.put\(request, copy\)/);
  assert.match(source, /caches\.match\(request\)\.then\(\(hit\) => hit \|\| caches\.match\("\/"\)\)/);
  assert.doesNotMatch(source, /cache\.put\("\/", copy\)/);
});

test("public journal loading starts without awaiting the session lookup", () => {
  const source = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(source, /const sessionPromise = initSession\(\)/);
  assert.doesNotMatch(source, /await initSession\(\)/);
  assert.match(source, /await sessionPromise;\s*\n\s*if \(currentUser\) navigateTo\("\/submit\/"\)/);
});

test("difficulty enrichment is scheduled separately from deployment", () => {
  const deploy = fs.readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
  const difficulty = fs.readFileSync(new URL("../.github/workflows/difficulty.yml", import.meta.url), "utf8");
  assert.doesNotMatch(deploy, /sync:difficulty/);
  assert.match(difficulty, /cron: "30 19 \* \* \*"/);
  assert.match(difficulty, /npm run sync:difficulty/);
  assert.match(difficulty, /gh workflow run deploy\.yml/);
  assert.match(difficulty, /git diff --cached --quiet/);
});
