import { pathToFileURL } from "node:url";
import { LOG_SCHEMA_VERSION } from "../lib/log-schema.mjs";

const DEFAULT_WORKER_ORIGIN = "https://algo-oauth.xialiao.org";

export async function checkWorkerCompatibility({ origin = DEFAULT_WORKER_ORIGIN, fetchImpl = fetch, expectedCommit } = {}) {
  const base = new URL(origin);
  if (base.protocol !== "https:") throw new Error("Worker URL must use HTTPS");
  if (expectedCommit && !/^[a-f0-9]{40}$/i.test(expectedCommit)) throw new Error("Expected commit must be a full Git SHA");
  const capabilitiesResponse = await fetchImpl(new URL("/api/capabilities", base), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!capabilitiesResponse.ok) throw new Error(`Worker capabilities returned HTTP ${capabilitiesResponse.status}`);
  const capabilities = await capabilitiesResponse.json();
  const { min, max } = capabilities?.logSchema || {};
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    throw new Error("Worker did not publish a valid log schema range");
  }
  if (LOG_SCHEMA_VERSION < min || LOG_SCHEMA_VERSION > max) {
    throw new Error(`Live Worker accepts log schema ${min}–${max}; this site sends ${LOG_SCHEMA_VERSION}. Deploy the compatible Worker first.`);
  }
  if (expectedCommit && capabilities.buildCommit !== expectedCommit.toLowerCase()) {
    throw new Error(`Live Worker is from ${capabilities.buildCommit || "an unstamped build"}; waiting for ${expectedCommit.toLowerCase()}`);
  }
  const sessionResponse = await fetchImpl(new URL("/api/session", base), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!sessionResponse.ok) throw new Error(`Worker session smoke test returned HTTP ${sessionResponse.status}`);
  return { min, max, buildCommit: capabilities.buildCommit || null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const expectedCommit = process.env.WORKER_EXPECTED_COMMIT || undefined;
  const maxWaitMs = Number(process.env.WORKER_WAIT_MS || 0);
  if (!Number.isSafeInteger(maxWaitMs) || maxWaitMs < 0 || maxWaitMs > 900000) throw new Error("WORKER_WAIT_MS must be between 0 and 900000");
  const deadline = Date.now() + maxWaitMs;
  let lastError;
  while (true) {
    try {
      const { min, max, buildCommit } = await checkWorkerCompatibility({ origin: process.env.WORKER_ORIGIN || DEFAULT_WORKER_ORIGIN, expectedCommit });
      console.log(`Live Worker ${buildCommit?.slice(0, 7) || "unstamped"} accepts log schema ${min}–${max}; site schema ${LOG_SCHEMA_VERSION} is compatible.`);
      break;
    } catch (error) {
      lastError = error;
      if (Date.now() >= deadline) {
        console.error(`Pages deployment blocked: ${lastError.message}`);
        process.exitCode = 1;
        break;
      }
      console.log(`Waiting for Worker deployment: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(15000, deadline - Date.now())));
    }
  }
}
