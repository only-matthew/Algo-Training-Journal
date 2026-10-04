import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative, extname } from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const sourceRoots = ["src/app.js", "src/problem-page.js", "lib", "scripts", "workers", "bot", "test", "e2e", "eslint.config.mjs", "playwright.config.mjs"];
const extensions = new Set([".js", ".mjs", ".cjs"]);

function collectFiles(entry) {
  if (extensions.has(extname(entry))) return [entry];
  return readdirSync(resolve(root, entry), { withFileTypes: true }).flatMap(child => {
    const childPath = relative(root, resolve(root, entry, child.name));
    return child.isDirectory() ? collectFiles(childPath) : extensions.has(extname(childPath)) ? [childPath] : [];
  });
}

// Parse with the same V8 engine as node --check, but start Node only once.
// SourceTextModule is only constructed: imports are never linked and code is never evaluated.
if (!vm.SourceTextModule) {
  const child = spawnSync(process.execPath, ["--experimental-vm-modules", "--disable-warning=ExperimentalWarning", import.meta.filename, ...process.argv.slice(2)], { stdio: "inherit" });
  if (child.error) console.error(`Unable to start syntax checker: ${child.error.message}`);
  process.exitCode = child.status ?? 1;
} else {
  const files = (process.argv.length > 2 ? process.argv.slice(2) : sourceRoots).flatMap(collectFiles).sort();
  let failed = false;
  for (const file of files) {
    try {
      const source = readFileSync(resolve(root, file), "utf8").replace(/^#![^\n]*/, "");
      if (extname(file) === ".mjs") {
        new vm.SourceTextModule(source, { identifier: file });
      } else {
        try {
          vm.compileFunction(source, ["exports", "require", "module", "__filename", "__dirname"], { filename: file });
        } catch (error) {
          if (extname(file) === ".cjs") throw error;
          // Like Node's syntax detection, ambiguous .js may contain ES module syntax.
          new vm.SourceTextModule(source, { identifier: file });
        }
      }
    } catch (error) {
      failed = true;
      console.error(`Syntax check failed: ${file}\n${error.stack}`);
    }
  }
  if (failed) process.exitCode = 1;
  else console.log(`Syntax check passed for ${files.length} source files.`);
}
