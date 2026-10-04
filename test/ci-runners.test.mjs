import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function fixture(context) {
  const directory = mkdtempSync(join(tmpdir(), "atj-checks-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return (name, source) => {
    const path = join(directory, name);
    writeFileSync(path, source);
    return path;
  };
}

test("fast syntax checker matches node --check and never runs or resolves source", context => {
  const file = fixture(context);
  const cases = [
    ["module.mjs", 'import "./not-installed.mjs"; await 1; throw new Error("must not execute");'],
    ["common.cjs", 'const fs = require("not-installed"); return;'],
    ["detected.js", 'export const value = await Promise.resolve(1);'],
    ["broken-module.mjs", 'export const value = ;'],
    ["broken-common.cjs", 'function broken( {'],
    ["illegal-return.mjs", 'return;'],
    ["illegal-await.cjs", 'await 1;'],
  ];
  for (const [name, source] of cases) {
    const path = file(name, source);
    const expected = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
    const actual = spawnSync(process.execPath, ["scripts/check-syntax.mjs", path], { encoding: "utf8" });
    assert.equal(actual.status === 0, expected.status === 0, `${name}: ${actual.stderr}`);
    if (actual.status !== 0) assert.ok(actual.stderr.includes(path), "diagnostics name the invalid file");
  }
});

test("test runner retains simulated diagnostics and surfaces genuine failures", context => {
  const file = fixture(context);
  const passing = file("passing.mjs", 'import test from "node:test"; test("expected failure path", () => console.error("SIMULATED_ERROR"));');
  const failing = file("failing.mjs", 'import test from "node:test"; test("real failure", () => { throw new Error("REAL_FAILURE"); });');
  const logFile = file("run.log", "");
  const options = { encoding: "utf8", env: { ...process.env, TEST_LOG_FILE: logFile } };
  const success = spawnSync(process.execPath, ["scripts/run-tests.mjs", passing], options);
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /# pass 1/);
  assert.doesNotMatch(success.stdout, /SIMULATED_ERROR/);
  assert.match(readFileSync(logFile, "utf8"), /SIMULATED_ERROR/);
  const failure = spawnSync(process.execPath, ["scripts/run-tests.mjs", passing, failing], options);
  assert.equal(failure.status, 1);
  assert.match(failure.stdout, /REAL_FAILURE/);
  assert.match(failure.stdout, /# tests 2/);
  assert.match(failure.stdout, /# fail 1/);
  assert.match(readFileSync(logFile, "utf8"), /REAL_FAILURE/);
});
