import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = readdirSync("test")
  .filter((file) => file.endsWith(".mjs"))
  .sort()
  .map((file) => `test/${file}`);
// 两轮只是为了把 Worker/oauth 套件在 CI 日志里分到一组，并不是隔离所必需：
// `node --test` 每个测试文件都跑在自己的子进程里，进程级 global fetch mock
// 不会跨文件泄漏。两轮都执行完，第一轮的失败不能挡住第二轮的用例。
const workerFiles = files.filter((file) => /^test\/oauth-[^/]*\.test\.mjs$/.test(file));
const regularFiles = files.filter((file) => !workerFiles.includes(file));
const nodeArgs = ["--test", "--test-concurrency=1"];

let failed = false;
for (const batch of [regularFiles, workerFiles]) {
  if (!batch.length) continue;
  const result = spawnSync(process.execPath, [...nodeArgs, ...batch], { stdio: "inherit" });
  if (result.error) {
    failed = true;
    process.stderr.write(`Unable to run ${batch.length} test file(s): ${result.error.code || "SPAWN_ERROR"} ${result.error.message}\n`);
    continue;
  }
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`Test pass failed with exit ${result.status ?? "unknown"} — ${batch.length} test file(s) in this pass, see the summary above.\n`);
  }
}

if (failed) process.exitCode = 1;
