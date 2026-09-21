import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";

const require = createRequire("C:/Users/onlym/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json");
const { chromium } = require("playwright");
const ORIGIN = "http://127.0.0.1:4173";
const manifest = JSON.parse(fs.readFileSync("site/data/manifest.json", "utf8"));
const member = Object.keys(manifest.members)[0];
assert.ok(member, "scale smoke requires at least one member");

const browser = await chromium.launch({ headless: true, channel: "msedge" });
const page = await browser.newPage();
const requests = [];
const errors = [];
page.on("request", (request) => requests.push(new URL(request.url()).pathname));
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(`${ORIGIN}/analysis/`, { waitUntil: "networkidle" });
  assert.ok(requests.includes("/data/manifest.json"));
  assert.equal(requests.includes("/data/all.json"), false);
  assert.ok(requests.some((path) => path.startsWith("/data/logs/")), "analysis should request a month shard");
  assert.ok(await page.locator("#analysis-records .analysis-record-wrapper").count() <= 40);

  requests.length = 0;
  await page.goto(`${ORIGIN}/member/${encodeURIComponent(member)}/`, { waitUntil: "networkidle" });
  assert.equal(requests.includes("/data/all.json"), false);
  assert.ok(requests.some((path) => path.startsWith(`/data/members/${encodeURIComponent(member)}/`)));
  assert.ok(await page.locator("#member-records .record").count() <= 40);

  requests.length = 0;
  await page.goto(`${ORIGIN}/review/`, { waitUntil: "networkidle" });
  assert.ok(requests.includes("/data/review.json"));
  assert.equal(requests.includes("/data/all.json"), false);
  assert.ok(await page.locator("#review-records .record").count() <= 40);
  assert.deepEqual(errors, []);
  console.log("Scale smoke passed: route-scoped shards, no all.json, paged DOM.");
} finally {
  await browser.close();
}
