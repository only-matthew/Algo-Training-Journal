import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "@playwright/test";

const ORIGIN = "http://127.0.0.1:4173";
const WORKER = "https://algo-oauth.xialiao.org";
const DATE = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

fs.mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

await page.route(`${WORKER}/**`, (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (url.pathname === "/api/session") return json({ login: "visual-check", member: "小林", csrfToken: "visual-csrf", avatar_url: "" });
  if (url.pathname === "/api/logs/date" && request.method() === "GET") return json({
    revision: "visual-revision",
    updatedAt: new Date().toISOString(),
    problems: [{
      id: "visual-p2678",
      name: "P2678 跳石头",
      platform: "洛谷",
      problemNumber: "P2678",
      difficultyRating: 1400,
      tags: ["二分答案", "贪心"],
      outcome: "independent",
      masteryStatus: "learning",
      reviewStatus: "todo",
      reviewDue: DATE,
      isMistake: false,
      takeaway: "通过二分枚举最小距离，再用贪心判断需要移走的石头数量。",
      description: "给定河道中的石头位置，在最多移走若干石头后，最大化最短跳跃距离。",
      code: "int check(int distance) { return 0; }",
    }],
  });
  return json({ error: "unexpected smoke call", path: url.pathname }, 404);
});

try {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
  await page.click("#btn-submit");
  await page.waitForURL((url) => url.pathname === "/submit/");
  assert.equal(new URL(page.url()).pathname, "/submit/", "首页提交按钮应进入独立提交页");

  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`${ORIGIN}/submit/?date=${DATE}&problem=visual-p2678`, { waitUntil: "networkidle" });
    await page.waitForSelector("#submission-workspace", { state: "visible" });
    await page.waitForFunction(() => document.getElementById("journal-editor-title")?.textContent === "编辑训练日志", null, { timeout: 10000 }).catch(async (error) => {
      const diagnostic = await page.evaluate(() => ({
        title: document.getElementById("journal-editor-title")?.textContent,
        message: document.getElementById("submit-msg")?.textContent,
        workspaceHidden: document.getElementById("submission-workspace")?.hidden,
      }));
      throw new Error(`提交页未加载已有记录：${JSON.stringify(diagnostic)}；pageErrors=${JSON.stringify(pageErrors)}`, { cause: error });
    });
    await page.waitForFunction(() => !document.getElementById("btn-save")?.disabled);
    await page.waitForFunction(() => !document.querySelector(".problem-block")?.classList.contains("review-highlight"));
    await page.evaluate(() => window.scrollTo(0, 0));
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      title: document.getElementById("journal-editor-title")?.textContent,
      workspaceColumns: getComputedStyle(document.querySelector(".submission-workspace")).gridTemplateColumns,
      notesVisible: getComputedStyle(document.querySelector(".submission-notes")).display !== "none",
      indexPosition: getComputedStyle(document.querySelector(".submission-index")).position,
      checkedOutcome: document.querySelector(".problem-outcome:checked")?.value,
      overflowers: [...document.querySelectorAll("body *")].map((element) => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName, id: element.id, className: String(element.className || ""), left: rect.left, right: rect.right, width: rect.width };
      }).filter((item) => item.left < -1 || item.right > document.documentElement.clientWidth + 1).slice(0, 12),
    }));
    assert.ok(state.overflow <= 1, `${width}px 页面存在 ${state.overflow}px 横向溢出：${JSON.stringify(state.overflowers)}`);
    assert.equal(state.title, "编辑训练日志");
    assert.equal(state.checkedOutcome, "independent");
    if (width === 1440) assert.equal(state.notesVisible, true);
    if (width === 1024) assert.equal(state.notesVisible, false);
    if (width === 390) assert.equal(state.indexPosition, "static");
    await page.screenshot({ path: `artifacts/submission-${width}.png`, fullPage: true });
  }
  assert.deepEqual(pageErrors, [], `页面脚本错误：${pageErrors.join("；")}`);
  console.log("Submission page smoke passed at 1440, 1024 and 390 px.");
} finally {
  await browser.close();
}
