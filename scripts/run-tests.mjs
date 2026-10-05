import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { availableParallelism } from "node:os";

// Explicit paths support focused local runs; without arguments every suite runs.
const files = process.argv.length > 2 ? process.argv.slice(2) : readdirSync("test")
  .filter((file) => file.endsWith(".mjs"))
  .sort()
  .map((file) => `test/${file}`);
// Each file has its own process, including OAuth mocks. One scheduler avoids an
// artificial barrier between regular and Worker suites, without increasing CPU contention.
// TEST_CONCURRENCY 覆盖并发上限，供 CI 调优实验（默认仍按 2 核上限）。
const concurrency = Number(process.env.TEST_CONCURRENCY) || Math.min(2, availableParallelism());
const environment = { ...process.env };
// A focused invocation from a regression test must still start an independent runner.
delete environment.NODE_TEST_CONTEXT;
const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", `--test-concurrency=${concurrency}`, ...files], {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: environment,
});
const output = `${result.stdout || ""}${result.stderr || ""}`;
const logFile = resolve(process.env.TEST_LOG_FILE || "artifacts/unit-tests.log");
mkdirSync(dirname(logFile), { recursive: true });
writeFileSync(logFile, output);
if (result.error || result.status !== 0) {
  // Failed tests retain their full diagnostics in the console as well as the artifact.
  process.stdout.write(output);
  console.error(`Test run failed: ${result.error?.message || result.signal || `exit ${result.status}`}`);
  process.exitCode = 1;
} else {
  console.log(output.split(/\r?\n/).filter(line => /^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) /.test(line)).join("\n"));
  console.log(`All ${files.length} test files passed. Full diagnostics (including simulated failures): ${logFile}`);
}
