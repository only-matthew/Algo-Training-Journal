import { readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const sourceRoots = ["app.js", "lib", "scripts", "workers", "bot", "test-latex.mjs"];
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
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status === 0) continue;
  failed = true;
  process.stderr.write(`Syntax check failed: ${file}\n${result.stderr || result.stdout}`);
}

if (failed) process.exitCode = 1;
else console.log(`Syntax check passed for ${files.length} source files.`);
