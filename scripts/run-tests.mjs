import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const files = readdirSync("test")
  .filter((file) => file.endsWith(".mjs"))
  .sort()
  .map((file) => `test/${file}`);
// Worker tests install a global fetch mock, so they run in their own pass
// (serialized) instead of sharing the process with the browser/Node tests.
const workerFiles = files.filter((file) => /^test\/oauth-[^/]*\.test\.mjs$/.test(file));
const regularFiles = files.filter((file) => !workerFiles.includes(file));
const nodeArgs = ["--test", "--test-concurrency=1"];

if (regularFiles.length) execFileSync(process.execPath, [...nodeArgs, ...regularFiles], { stdio: "inherit" });
if (workerFiles.length) execFileSync(process.execPath, [...nodeArgs, ...workerFiles], { stdio: "inherit" });
