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
const { replaceProblemArticle, resolveStatsEnd } = require("../scripts/generate-data.js");

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

test("recent stats include the newest log when the UTC build date is still yesterday", async () => {
  const { toDateString } = await import("../lib/constants.mjs");
  assert.equal(
    resolveStatsEnd([{ date: "2026-08-05" }], new Date("2026-08-04T17:00:00Z"), toDateString),
    "2026-08-05",
  );
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

  const overview = JSON.parse(fs.readFileSync(path.join(siteDir, "data", "overview.json"), "utf8"));
  assert.ok(Array.isArray(overview.reviewQueue), "overview.json must expose the review queue");
  for (const item of overview.reviewQueue) {
    assert.ok(item.problemId && item.member && item.reviewDue, "review queue entries must carry id/member/due");
  }

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
  const generatedApplication = fs.readFileSync(path.join(siteDir, "lib", "application.mjs"), "utf8");

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
  assert.match(generatedApp, /\.\/lib\/application\.mjs\?v=[a-f0-9]+/);
  assert.match(generatedApplication, /\.\/data\.mjs\?v=[a-f0-9]+/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(siteDir, "lib", "data.mjs"), "utf8"),
    /renderer\.mjs/,
    "the data store must not depend on browser rendering",
  );

  const urlCount = (sitemap.match(/<url>/g) || []).length;
  let roadmapEntryCount = 0;
  try {
    const roadmap = JSON.parse(fs.readFileSync(path.join(siteDir, "data", "roadmap.json"), "utf8"));
    roadmapEntryCount = 1 + roadmap.phases.reduce((sum, phase) => sum + 1 + phase.nodes.length, 0);
  } catch {
    // curriculum/ 缺失时不生成 roadmap，跳过其 sitemap 计数
  }
  let tagEntryCount = 0;
  let tagIndex = null;
  try {
    tagIndex = JSON.parse(fs.readFileSync(path.join(siteDir, "data", "tag-index.json"), "utf8"));
    tagEntryCount = 1 + tagIndex.tags.length;
  } catch {
    // curriculum/ 缺失时不生成标签索引，跳过其 sitemap 计数
  }
  assert.equal(urlCount, 1 + journal.members.length + journal.logs.length + roadmapEntryCount + tagEntryCount);
  assert.ok(sitemap.includes(`https://train.xialiao.org${problemRoute}`));
  assert.match(robots, /Sitemap: https:\/\/train\.xialiao\.org\/sitemap\.xml/);

  // 标签页与题目页同等可爬取：预渲染静态页 + canonical + JSON-LD（有 curriculum 时校验）
  if (tagIndex && tagIndex.tags.length > 0) {
    const first = tagIndex.tags[0];
    const tagRoute = routePath(["tags", first.tag]);
    const tagPage = fs.readFileSync(path.join(siteDir, "tags", first.tag, "index.html"), "utf8");
    assert.ok(
      tagPage.includes(`<link rel="canonical" href="https://train.xialiao.org${tagRoute}" />`),
      `tag page must carry canonical ${tagRoute}`,
    );
    assert.ok(tagPage.includes('"@type":"CollectionPage"'), "tag page must embed CollectionPage JSON-LD");
    assert.ok(tagPage.includes(`data-tag="${first.tag}"`), "tag page must mark its prerendered tag");
    assert.ok(tagPage.includes("条训练记录"), "tag page must be fully server-rendered");
  }
});

test("roadmap node trainingEvidence carries mastery state without coverage", () => {
  const nodesDir = path.join(siteDir, "data", "roadmap", "nodes");
  if (!fs.existsSync(nodesDir)) return; // curriculum/ 缺失时不生成 roadmap，跳过
  const files = fs.readdirSync(nodesDir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0, "site/data/roadmap/nodes/ must contain node JSON");
  const states = ["未接触", "已接触", "有基础", "较熟练", "建议复习"];
  let checked = 0;
  for (const file of files.slice(0, 3)) {
    const nodeData = JSON.parse(fs.readFileSync(path.join(nodesDir, file), "utf8"));
    const ev = nodeData && nodeData.node && nodeData.node.trainingEvidence;
    if (!ev) continue;
    assert.ok(states.includes(ev.state), `${file} trainingEvidence.state 应为合法状态，实际 ${ev.state}`);
    assert.equal(typeof ev.confidence, "string", `${file} missing confidence`);
    assert.equal(typeof ev.reason, "string", `${file} missing reason`);
    assert.equal(typeof ev.action, "string", `${file} missing action`);
    assert.ok(!("coverage" in ev), `${file} must not carry coverage`);
    assert.ok(!("todoDueDates" in ev), `${file} must not expose raw todoDueDates`);
    assert.ok(Array.isArray(ev.byMember), `${file} byMember must be an array`);
    for (const entry of ev.byMember) {
      assert.ok(states.includes(entry.state), `${file} byMember entry missing valid state`);
      assert.ok(!("coverage" in entry), `${file} byMember entry must not carry coverage`);
      assert.ok(!("todoDueDates" in entry), `${file} byMember entry must not expose raw todoDueDates`);
    }
    checked += 1;
  }
  assert.ok(checked > 0, "no node JSON exposed trainingEvidence");
});
