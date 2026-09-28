import { pathToFileURL } from "node:url";
import { LOG_SCHEMA_VERSION } from "../lib/log-schema.mjs";

const DEFAULT_WORKER_ORIGIN = "https://algo-oauth.xialiao.org";

export async function checkWorkerCompatibility({ origin = DEFAULT_WORKER_ORIGIN, fetchImpl = fetch } = {}) {
  const base = new URL(origin);
  if (base.protocol !== "https:") throw new Error("Worker URL must use HTTPS");
  const capabilitiesResponse = await fetchImpl(new URL("/api/capabilities", base), { headers: { Accept: "application/json" } });
  if (!capabilitiesResponse.ok) throw new Error(`Worker capabilities returned HTTP ${capabilitiesResponse.status}`);
  const capabilities = await capabilitiesResponse.json();
  const { min, max } = capabilities?.logSchema || {};
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    throw new Error("Worker did not publish a valid log schema range");
  }
  if (LOG_SCHEMA_VERSION < min || LOG_SCHEMA_VERSION > max) {
    throw new Error(`Live Worker accepts log schema ${min}–${max}; this site sends ${LOG_SCHEMA_VERSION}. Deploy the compatible Worker first.`);
  }
  const sessionResponse = await fetchImpl(new URL("/api/session", base), { headers: { Accept: "application/json" } });
  if (!sessionResponse.ok) throw new Error(`Worker session smoke test returned HTTP ${sessionResponse.status}`);
  return { min, max };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { min, max } = await checkWorkerCompatibility({ origin: process.env.WORKER_ORIGIN || DEFAULT_WORKER_ORIGIN });
    console.log(`Live Worker accepts log schema ${min}–${max}; site schema ${LOG_SCHEMA_VERSION} is compatible.`);
  } catch (error) {
    console.error(`Pages deployment blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
