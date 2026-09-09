import { createRequire } from "node:module";
import fs from "node:fs";
import assert from "node:assert/strict";
const require = createRequire("C:/Users/onlym/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json");
const { chromium } = require("playwright");
const browser = await chromium.launch({headless:true,channel:"msedge"});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.route("https://algo-oauth.xialiao.org/**", route => route.fulfill({status:401,contentType:"application/json",body:'{"error":"Unauthorized"}'}));
const output = process.env.UI_OUTPUT || "artifacts/details";
fs.mkdirSync(output,{recursive:true});
const all = JSON.parse(fs.readFileSync("site/data/all.json","utf8"));
const log = all.logs.find(log => log.problemNumber === "P2678") || all.logs[0];
const problemPath = `/problem/${encodeURIComponent(log.member)}/${log.date}/${log.problemId}/`;
const nodePath = "/roadmap/phase-0/algo-binary-search/";
const visit = async path => { await page.goto(`http://127.0.0.1:4173${path}`); await page.waitForLoadState("networkidle"); };
const checks = [];
try {
  for (const width of (process.argv.includes("--smoke-only") ? [] : [1440,900,390])) {
    await page.setViewportSize({width,height:1000});
    for (const [name,path] of [["home","/"],["knowledge","/roadmap/"],["node",nodePath],["tag","/tags/二分/"],["problem",problemPath]]) {
      await visit(path);
      if (name === "knowledge") {
        const total = await page.locator(".knowledge-topic-card:visible").count();
        await page.locator('[data-knowledge-category="binary"]').click();
        assert.equal(new URL(page.url()).pathname,"/roadmap/");
        const selected = await page.locator(".knowledge-topic-card:visible").count();
        assert.ok(selected > 0 && selected < total);
        await page.locator("#knowledge-search").fill("does-not-exist-8391");
        assert.equal(await page.locator(".knowledge-topic-card:visible").count(),0);
        assert.ok(await page.locator("#knowledge-empty").isVisible());
        await page.locator("#knowledge-search").fill("");
        await page.locator('[data-knowledge-category="all"]').click();
        await page.locator("#knowledge-sort").selectOption("count");
        const counts = await page.locator(".knowledge-topic-card").evaluateAll(cards=>cards.map(card=>Number(card.dataset.count)));
        assert.deepEqual(counts,[...counts].sort((a,b)=>b-a));
        await page.locator("#knowledge-sort").selectOption("name");
      }
      if (name === "node") {
        await page.locator("#node-search").fill("P2678");
        assert.ok(await page.locator(".roadmap-problem-card:visible").count() >= 1);
        await page.locator("#node-search").fill("does-not-exist-8391");
        assert.ok(await page.locator("#node-empty").isVisible());
        await page.locator("#node-search").fill("");
        await page.locator("#node-sort").selectOption("records");
        const counts = await page.locator(".roadmap-problem-card").evaluateAll(cards=>cards.map(card=>Number(card.dataset.recordCount)));
        assert.deepEqual(counts,[...counts].sort((a,b)=>b-a));
        await page.locator("#node-sort").selectOption("default");
      }
      if (name === "tag") {
        await page.locator('[data-tag-section="topics"]').click();
        assert.ok(await page.locator("#tag-topics").isVisible());
        assert.equal(await page.locator("#tag-records").isVisible(),false);
        await page.locator('[data-tag-section="all"]').click();
        assert.ok(await page.locator("#tag-records").isVisible());
      }
      if (name === "problem") {
        assert.ok(await page.locator("#problem-thoughts").isVisible());
        assert.ok(await page.locator("#problem-code").isVisible());
        assert.ok(await page.locator("#export-bar").isVisible());
        await page.locator('.detail-tabs a[href="#problem-code"]').click();
        assert.equal(new URL(page.url()).pathname,problemPath);
        assert.equal(new URL(page.url()).hash,"#problem-code");
      }
      await page.evaluate(()=>window.scrollTo(0,0));
      const overflow = await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth);
      checks.push({name,width,overflow});
      assert.equal(overflow,false,`${name} overflows at ${width}`);
      await page.screenshot({path:`${output}/${name}-${width}.png`});
      if (name === "home") {
        await page.locator("#overview-page > .more-tools > summary").click({force:true}).catch(()=>{});
        await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
        await page.screenshot({path:`${output}/home-bottom-${width}.png`});
      }
    }
  }
  // Exercise SPA navigation as well as prerendered direct visits.
  await page.setViewportSize({width:1440,height:1000});
  await visit("/roadmap/");
  await page.locator('[data-knowledge-category="binary"]').click();
  await page.locator('.knowledge-topic-card:visible h2 a').first().click();
  await page.waitForSelector("#node-problems");
  await page.locator('#roadmap-page .detail-intro .tag-chip').first().click();
  await page.waitForSelector(".tag-detail");
  await page.locator('#tag-page .detail-record-preview').first().click();
  await page.waitForSelector("#problem-thoughts");
  await page.waitForFunction(()=>typeof document.getElementById("btn-export-pdf").onclick === "function");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#btn-export-md").click();
  const download = await downloadPromise;
  assert.ok(download.suggestedFilename().endsWith(".md"));
  await page.locator('.desktop-nav [data-route="/roadmap/"]').click();
  await page.waitForSelector("#knowledge-search");
  assert.equal(await page.locator("#node-problems").count(),0);
  await page.locator('.desktop-nav [data-route="/tags/"]').click();
  await page.waitForSelector(".tag-index-grid");
  assert.equal(await page.locator(".tag-detail").count(),0);
  await visit(problemPath + "#problem-code");
  assert.equal(new URL(page.url()).pathname,problemPath);
  assert.ok(await page.locator("#problem-code").isVisible());
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({checks,spa:true,markdownExport:true,errors},null,2));
} finally {
  await browser.close();
}
