// Worker / Pages 发布门禁。
//
// 真正保护队员的不变量是**兼容性**：线上 Worker 必须接受本站当前发送的日志格式。
// 「线上 Worker 是不是本次提交构建的」是另一个问题，而且只在**这次 push 确实改了
// Worker 输入**时才有意义——其余情况下 Worker 本来就应该原地不动，强制重建和等待
// 都是白付的代价。
//
// 发布工作流只有确认 Worker 输入变化时才调用本脚本，并通过
// WORKER_EXPECTED_COMMIT 要求同提交上线。其他发布完全跳过 Worker 检查；
// 本函数仍可用于人工按需的兼容性检查。
import { pathToFileURL } from "node:url";
import { LOG_SCHEMA_VERSION } from "../lib/log-schema.mjs";

const DEFAULT_WORKER_ORIGIN = "https://algo-oauth.xialiao.org";
const MAX_WAIT_MS = 900_000;

export async function checkWorkerCompatibility({ origin = DEFAULT_WORKER_ORIGIN, fetchImpl = fetch, requireCommit } = {}) {
  const base = new URL(origin);
  if (base.protocol !== "https:") throw new Error("Worker URL must use HTTPS");
  if (requireCommit && !/^[a-f0-9]{40}$/i.test(requireCommit)) throw new Error("Required commit must be a full Git SHA");

  const capabilitiesResponse = await fetchImpl(new URL("/api/capabilities", base), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!capabilitiesResponse.ok) throw new Error(`Worker capabilities returned HTTP ${capabilitiesResponse.status}`);
  const capabilities = await capabilitiesResponse.json();
  const { min, max } = capabilities?.logSchema || {};
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    throw new Error("Worker did not publish a valid log schema range");
  }
  if (LOG_SCHEMA_VERSION < min || LOG_SCHEMA_VERSION > max) {
    throw new Error(`Live Worker accepts log schema ${min}–${max}; this site sends ${LOG_SCHEMA_VERSION}. Deploy the compatible Worker first.`);
  }

  const buildCommit = String(capabilities.buildCommit || "").toLowerCase() || null;
  const commitChecked = Boolean(requireCommit);
  if (commitChecked && buildCommit !== requireCommit.toLowerCase()) {
    throw new Error(`This push changed Worker inputs, but the live Worker is ${buildCommit || "an unstamped build"}; waiting for ${requireCommit.toLowerCase()}`);
  }

  const sessionResponse = await fetchImpl(new URL("/api/session", base), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!sessionResponse.ok) throw new Error(`Worker session smoke test returned HTTP ${sessionResponse.status}`);
  return { min, max, buildCommit, commitChecked };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const requireCommit = (process.env.WORKER_EXPECTED_COMMIT || "").trim() || undefined;
  const maxWaitMs = Number(process.env.WORKER_WAIT_MS || 0);
  if (!Number.isSafeInteger(maxWaitMs) || maxWaitMs < 0 || maxWaitMs > MAX_WAIT_MS) {
    throw new Error(`WORKER_WAIT_MS must be between 0 and ${MAX_WAIT_MS}`);
  }
  const deadline = Date.now() + maxWaitMs;
  while (true) {
    try {
      const { min, max, buildCommit, commitChecked } = await checkWorkerCompatibility({
        origin: process.env.WORKER_ORIGIN || DEFAULT_WORKER_ORIGIN,
        requireCommit,
      });
      const stamp = buildCommit?.slice(0, 7) || "unstamped";
      console.log(commitChecked
        ? `Live Worker ${stamp} accepts log schema ${min}–${max} and matches this commit.`
        : `Live Worker ${stamp} accepts log schema ${min}–${max}; site schema ${LOG_SCHEMA_VERSION} is compatible. Build identity was not requested for this check.`);
      break;
    } catch (error) {
      if (Date.now() >= deadline) {
        console.error(`Pages deployment blocked: ${error.message}`);
        process.exitCode = 1;
        break;
      }
      console.log(`Waiting for Worker deployment: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(5000, deadline - Date.now())));
    }
  }
}
