import { readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";

const root = resolve(import.meta.dirname, "..");
const sourceRoots = ["src/app.js", "src/problem-page.js", "lib", "scripts", "workers", "bot", "test", "e2e", "eslint.config.mjs", "playwright.config.mjs"];
const extensions = new Set([".js", ".mjs"]);

function collectFiles(entry, files = []) {
  const fullPath = resolve(root, entry);
  const entries = readdirSync(fullPath, { withFileTypes: true });
  for (const child of entries) {
    const childPath = resolve(fullPath, child.name);
    if (child.isDirectory()) {
      collectFiles(relative(root, childPath), files);
    } else if (extensions.has(child.name.slice(child.name.lastIndexOf(".")))) {
      files.push(relative(root, childPath));
    }
  }
  return files;
}

const files = sourceRoots.flatMap((entry) => {
  if (extensions.has(entry.slice(entry.lastIndexOf(".")))) return [entry];
  return collectFiles(entry);
});

let failed = false;
let next = 0;
let startFailed = false;
files.sort();
async function checkFiles() {
  while (next < files.length && !startFailed) {
    const file = files[next++];
    const result = await new Promise((resolveResult) => {
      const child = spawn(process.execPath, ["--check", file], { cwd: root, stdio: "inherit" });
      child.once("error", (error) => resolveResult({ error }));
      child.once("close", (status) => resolveResult({ status }));
    });
    if (result.status === 0) continue;
    failed = true;
    if (result.error) {
      startFailed = true;
      process.stderr.write(`Unable to start syntax check for ${file}: ${result.error.code || "SPAWN_ERROR"} ${result.error.message}\n`);
    } else {
      process.stderr.write(`Syntax check failed: ${file} (exit ${result.status ?? "unknown"})\n`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(2, availableParallelism()) }, checkFiles));

if (failed) process.exitCode = 1;
else console.log(`Syntax check passed for ${files.length} source files.`);
