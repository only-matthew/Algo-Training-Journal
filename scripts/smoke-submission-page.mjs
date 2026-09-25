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

  for (const width of [1440, 1024, 800, 390]) {
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
    await page.locator(".review-settings").evaluate((element) => { element.open = true; });
    await page.evaluate(() => window.scrollTo(0, 0));
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      title: document.getElementById("journal-editor-title")?.textContent,
      workspaceColumns: getComputedStyle(document.querySelector(".submission-workspace")).gridTemplateColumns,
      notesVisible: getComputedStyle(document.querySelector(".submission-notes")).display !== "none",
      indexPosition: getComputedStyle(document.querySelector(".submission-index")).position,
      checkedOutcome: document.querySelector(".problem-outcome:checked")?.value,
      reviewFieldTops: [...document.querySelectorAll(".review-settings .learning-state-grid > .form-group")]
        .filter((element) => !element.hidden)
        .map((element) => ({ className: element.className, top: Math.round(element.getBoundingClientRect().top), gridColumn: getComputedStyle(element).gridColumn })),
      overflowers: [...document.querySelectorAll("body *")].map((element) => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName, id: element.id, className: String(element.className || ""), left: rect.left, right: rect.right, width: rect.width };
      }).filter((item) => item.left < -1 || item.right > document.documentElement.clientWidth + 1).slice(0, 12),
    }));
    assert.ok(state.overflow <= 1, `${width}px 页面存在 ${state.overflow}px 横向溢出：${JSON.stringify(state.overflowers)}`);
    assert.equal(state.title, "编辑训练日志");
    assert.equal(state.checkedOutcome, "independent");
    if (width === 1440) {
      assert.equal(state.notesVisible, true);
      const tops = state.reviewFieldTops.map((field) => field.top);
      assert.ok(Math.max(...tops) - Math.min(...tops) <= 2, `宽屏复习设置应保持同一行：${JSON.stringify(state.reviewFieldTops)}`);
    }
    if (width === 1024) {
      assert.equal(state.notesVisible, false);
      const tops = state.reviewFieldTops.map((field) => field.top);
      assert.ok(Math.max(...tops) - Math.min(...tops) <= 2, `中等宽屏复习设置应保持同一行：${JSON.stringify(state.reviewFieldTops)}`);
    }
    if (width === 800) {
      assert.ok(Math.abs(state.reviewFieldTops[2]?.top - state.reviewFieldTops[3]?.top) <= 2, `双列布局的错题与日期应在同一行：${JSON.stringify(state.reviewFieldTops)}`);
    }
    if (width === 390) assert.equal(state.indexPosition, "static");
    await page.screenshot({ path: `artifacts/submission-${width}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await page.goto(`${ORIGIN}/submit/?date=${DATE}&problem=visual-p2678`, { waitUntil: "networkidle" });
  await page.waitForSelector("#submission-workspace", { state: "visible" });
  await page.click("#btn-import-cf");
  const darkTheme = await page.evaluate(() => {
    const luminance = (rgb) => {
      const channels = rgb.match(/[\d.]+/g).slice(0, 3).map((value) => Number(value) / 255)
        .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const contrast = (foreground, background) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const colors = (selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return { color: style.color, background: style.backgroundColor, contrast: contrast(style.color, style.backgroundColor) };
    };
    return {
      theme: document.documentElement.dataset.theme,
      importPanel: colors("#import-panel"),
      input: colors("#import-input"),
      sectionHeading: getComputedStyle(document.querySelector(".submission-notes h2")).color,
      selectedOutcome: colors(".problem-outcome:checked + span"),
      addProblem: colors("#btn-add-problem"),
    };
  });
  assert.equal(darkTheme.theme, "dark");
  assert.ok(darkTheme.importPanel.contrast >= 7, `导入面板文字对比度不足：${JSON.stringify(darkTheme.importPanel)}`);
  assert.ok(darkTheme.input.contrast >= 7, `导入输入框文字对比度不足：${JSON.stringify(darkTheme.input)}`);
  assert.equal(darkTheme.sectionHeading, "rgb(167, 227, 197)");
  assert.ok(darkTheme.selectedOutcome.contrast >= 4.5, `选中状态文字对比度不足：${JSON.stringify(darkTheme.selectedOutcome)}`);
  assert.ok(darkTheme.addProblem.contrast >= 4.5, `添加下一题按钮对比度不足：${JSON.stringify(darkTheme.addProblem)}`);
  assert.notEqual(darkTheme.addProblem.background, "rgb(251, 252, 250)", "暗色模式不应出现浅色添加按钮");
  await page.screenshot({ path: "artifacts/submission-dark-1440.png", fullPage: true });

  // 粘贴 AI JSON 后可以直接应用；“预览 JSON”只是可选检查步骤，不再是隐藏前置条件。
  await page.evaluate(() => {
    window.open = () => null;
    const block = document.querySelector(".problem-block");
    block.querySelector(".problem-description").value = "";
    block.querySelector(".problem-difficulty").value = "未标注";
  });
  await page.click(".problem-block .btn-ai-enrich");
  await page.waitForFunction(() => Boolean(document.querySelector(".problem-block")?.dataset.analysisRequest));
  const applyState = await page.evaluate(() => {
    const block = document.querySelector(".problem-block");
    const request = JSON.parse(block.dataset.analysisRequest);
    const result = {
      schemaVersion: 1,
      requestId: request.requestId,
      inputFingerprint: request.inputFingerprint,
      problem: { platform: request.input.platform, problemNumber: request.input.problemNumber, name: request.input.name },
      summary: "AI 生成的题意摘要",
      tags: ["字符串"],
      difficulty: { scale: "cf-rating", estimate: 1600, low: 1500, high: 1700, confidence: "medium", reason: "综合约束与实现复杂度" },
      analysis: { approach: "分析字符串结构。", timeComplexity: "O(n)", spaceComplexity: "O(1)", pitfalls: [] },
      missingInformation: [],
    };
    const input = block.querySelector(".analysis-json");
    input.value = JSON.stringify(result);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return { applyDisabled: block.querySelector(".btn-apply-analysis").disabled };
  });
  assert.equal(applyState.applyDisabled, false, "粘贴 JSON 后应用按钮应立即可用");
  await page.click(".problem-block .btn-apply-analysis");
  const applied = await page.evaluate(() => {
    const block = document.querySelector(".problem-block");
    return {
      description: block.querySelector(".problem-description").value,
      difficulty: block.querySelector(".problem-difficulty").value,
      tags: block.querySelector(".problem-tags").value,
      status: block.querySelector(".summarize-status").textContent,
    };
  });
  assert.equal(applied.description, "AI 生成的题意摘要");
  assert.equal(applied.difficulty, "★ 1600");
  assert.match(applied.tags, /字符串/);
  assert.match(applied.status, /已应用选择的建议/);
  assert.deepEqual(pageErrors, [], `页面脚本错误：${pageErrors.join("；")}`);
  console.log("Submission page smoke passed at 1440, 1024, 800 and 390 px.");
} finally {
  await browser.close();
}
