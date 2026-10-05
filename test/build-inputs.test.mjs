import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { ESLint } from "eslint";

const require = createRequire(import.meta.url);
const { discoverDateDirs, preparePage } = require("../scripts/generate-data.js");

test("parsed page templates isolate route content and metadata and refresh when the shell changes", () => {
  const html = '<!DOCTYPE html><html><head><title>Home</title><meta name="description" content="Home"><link rel="canonical" href="/"></head><body><section id="overview-page" class="active">Home</section><section id="tag-page" hidden><div id="tag-content"></div></section></body></html>';
  const metadata = (title) => ({ title, description: title, canonical: `https://example.com/${title}/`, jsonLd: { name: title, text: "</script>" } });
  const first = preparePage(html, "tag-page", metadata("BFS"));
  first("#tag-content").html("<p>First tag</p>");
  const second = preparePage(html, "tag-page", metadata("DFS"));
  assert.equal(first("title").text(), "BFS");
  assert.equal(second("title").text(), "DFS");
  assert.equal(second("#tag-content").html(), "");
  assert.equal(second('link[rel="canonical"]').attr("href"), "https://example.com/DFS/");
  assert.equal(second('script[type="application/ld+json"]').length, 1);
  assert.match(second('script[type="application/ld+json"]').text(), /\\u003c\/script>/);
  assert.equal(second("#tag-page").hasClass("active"), true);
  assert.equal(second("#tag-page").attr("hidden"), undefined);
  assert.equal(second("#overview-page[hidden]").length, 1);
  assert.match(second.html(), /^<!DOCTYPE html>/i);
  const changed = preparePage(html.replace("<body>", '<body><p id="new-shell">New shell</p>'), "tag-page", metadata("DP"));
  assert.equal(changed("#new-shell").text(), "New shell");
});

test("generator rejects legacy and nested directories for the same member and date", (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "journal-logs-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const legacy = path.join(root, "member", "2026-09-29");
  const nested = path.join(root, "member", "2026", "09", "29");
  mkdirSync(legacy, { recursive: true });
  mkdirSync(nested, { recursive: true });

  assert.throws(() => discoverDateDirs(root), (error) => {
    assert.match(error.message, /同一成员同一天存在两种日志目录/);
    assert.ok(error.message.includes(legacy));
    assert.ok(error.message.includes(nested));
    return true;
  });
});

test("ESLint ignores generated directories while still checking source files", async () => {
  const eslint = new ESLint();
  for (const file of ["workers/.build-cache/worker-dryrun/oauth.js", "site/app.js", "build/app.js"]) {
    assert.equal(await eslint.isPathIgnored(file), true, `${file} must be ignored`);
  }
  assert.equal(await eslint.isPathIgnored("workers/oauth.mjs"), false);
});
