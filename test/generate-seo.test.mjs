import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(root, "site");
const require = createRequire(import.meta.url);
const { replaceProblemArticle } = require("../scripts/generate-data.js");

function routePath(segments) {
  return `/${segments.map((segment) => encodeURIComponent(String(segment))).join("/")}/`;
}

test("problem article injection preserves JavaScript replacement tokens literally", () => {
  const tokens = "$& | $1 | $` | $' | $$";
  const template = '<article id="problem-detail" class="card">loading</article>';
  const output = replaceProblemArticle(template, `<p>${tokens}</p>`);

  assert.equal(output, `<article id="problem-detail" class="card"><p>${tokens}</p></article>`);
  assert.equal((output.match(/<article id="problem-detail"/g) || []).length, 1);
});

test("generator emits crawlable member and problem pages", () => {
  const result = spawnSync(process.execPath, ["scripts/generate-data.js"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const journal = JSON.parse(fs.readFileSync(path.join(siteDir, "data", "all.json"), "utf8"));
  assert.ok(journal.logs.length > 0);
  assert.ok(journal.members.length > 0);

  const log = journal.logs[0];
  const problemId = String(log.problemId || log.problemIndex || 0);
  const problemRoute = routePath(["problem", log.member, log.date, problemId]);
  const problemPage = fs.readFileSync(
    path.join(siteDir, "problem", log.member, log.date, problemId, "index.html"),
    "utf8",
  );
  const memberPage = fs.readFileSync(path.join(siteDir, "member", log.member, "index.html"), "utf8");
  const homePage = fs.readFileSync(path.join(siteDir, "index.html"), "utf8");
  const sitemap = fs.readFileSync(path.join(siteDir, "sitemap.xml"), "utf8");
  const robots = fs.readFileSync(path.join(siteDir, "robots.txt"), "utf8");
  const generatedApp = fs.readFileSync(path.join(siteDir, "app.js"), "utf8");
  const generatedForm = fs.readFileSync(path.join(siteDir, "lib", "form.mjs"), "utf8");

  assert.match(problemPage, new RegExp(`<title>[^<]*${log.member}[^<]*</title>`));
  assert.ok(problemPage.includes(`data-prerendered-path="${problemRoute}"`));
  assert.ok(problemPage.includes('type="application/ld+json"'));
  assert.ok(problemPage.includes('"@type":"Article"'));
  assert.ok(problemPage.includes(`<link rel="canonical" href="https://train.xialiao.org${problemRoute}" />`));
  assert.ok(problemPage.includes("收获 / 题解") || problemPage.includes("题目描述"));

  for (const entry of journal.logs) {
    const entryId = String(entry.problemId || entry.problemIndex || 0);
    const entryPage = fs.readFileSync(
      path.join(siteDir, "problem", entry.member, entry.date, entryId, "index.html"),
      "utf8",
    );
    assert.equal(
      (entryPage.match(/<article id="problem-detail"/g) || []).length,
      1,
      `problem detail wrapper was duplicated for ${entry.member}/${entry.date}/${entryId}`,
    );
    assert.equal(
      (entryPage.match(/data-prerendered-path=/g) || []).length,
      1,
      `prerender marker was duplicated for ${entry.member}/${entry.date}/${entryId}`,
    );
  }

  assert.ok(memberPage.includes(`${log.member} 的训练主页`));
  assert.ok(memberPage.includes(problemRoute));
  assert.ok(homePage.includes("/problem/"));

  const appAuthImport = generatedApp.match(/\.\/lib\/auth\.mjs\?v=([a-f0-9]+)/)?.[1];
  const formAuthImport = generatedForm.match(/\.\/auth\.mjs\?v=([a-f0-9]+)/)?.[1];
  assert.ok(appAuthImport);
  assert.equal(formAuthImport, appAuthImport);

  const urlCount = (sitemap.match(/<url>/g) || []).length;
  assert.equal(urlCount, 1 + journal.members.length + journal.logs.length);
  assert.ok(sitemap.includes(`https://train.xialiao.org${problemRoute}`));
  assert.match(robots, /Sitemap: https:\/\/train\.xialiao\.org\/sitemap\.xml/);
});