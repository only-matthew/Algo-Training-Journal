// 浏览器冒烟：题面导入的四种情形都要真的「填进描述」。
//
// 这个脚本用真实 Chromium 打开构建产物，拦截 Worker 请求，验证单元测试看不到的交互：
// 描述为空时直接填入；描述已有内容时给出「用这份题面替换描述」按钮且点了真的替换；
// 描述里误粘了整页源码时直接替换；重复解析同一份题面不会重复写入。
//
// 用法：先 npm run build，再 node scripts/preview-ui.mjs（另开一个终端），
// 然后运行本脚本。失败时以非零码退出。
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";


const ORIGIN = "http://127.0.0.1:4173";
const WORKER = "https://algo-oauth.xialiao.org";
// 必须用「今天」（UTC+8），应用与服务端都会拒绝未来日期。
const DATE = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const DESCRIPTION = "# 001 - Yokan Party（★4）\n\n时间限制：2 sec\n\n### 問題文\n\n左右の長さが $L$ [cm] のようかんがあります。";
const PAGE_SOURCE = `<!DOCTYPE html><html><head><title>001 - Yokan Party</title><meta property="og:url" content="https://atcoder.jp/contests/typical90/tasks/typical90_a"></head><body><div id="task-statement"><span class="lang-ja"><h3>問題文</h3><p>本文</p></span></div></body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

const statementCalls = [];
await page.route(`${WORKER}/**`, async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (url.pathname === "/api/session") return json({ login: "only-matthew", member: "廖夏", csrfToken: "csrf-statement-smoke", avatar_url: "" });
  if (url.pathname === "/api/logs/date" && request.method() === "GET") return json({ problems: [], revision: null });
  if (url.pathname === "/api/problem-statement" && request.method() === "POST") {
    const body = JSON.parse(request.postData() || "{}");
    statementCalls.push(body);
    return json({
      status: "ok",
      problemNumber: body.problemNumber,
      description: DESCRIPTION,
      images: [],
      tags: ["二分答案"],
      source: { kind: "atcoder-html", url: "https://atcoder.jp/contests/typical90/tasks/typical90_a", fetchedAt: new Date().toISOString(), parserVersion: "atcoder-html-v1" },
      warnings: ["client-html", "ja-statement"],
    });
  }
  return json({ error: "unexpected smoke call", path: url.pathname }, 404);
});

const checks = [];
const check = (name, condition, detail = "") => { assert.ok(condition, `${name}${detail ? ` — ${detail}` : ""}`); checks.push(name); };
const modal = "#submission-page .problem-block";
const state = () => page.evaluate((selector) => {
  const block = document.querySelector(selector);
  return {
    description: block.querySelector(".problem-description").value,
    tags: block.querySelector(".problem-tags").value,
    status: block.querySelector(".summarize-status").textContent,
    previewHidden: block.querySelector(".analysis-preview").hidden,
    previewText: block.querySelector(".analysis-preview").textContent,
    applyHidden: block.querySelector(".btn-apply-statement").hidden,
  };
}, modal);
const fillDescription = (value) => page.fill(`${modal} .problem-description`, value);
const clickParse = async () => {
  await page.click(`${modal} .btn-parse-statement-html`);
  await page.waitForFunction((selector) => !document.querySelector(`${selector} .summarize-status`).textContent.includes("解析页面源码中"), modal, { timeout: 10000 });
};

try {
  await page.goto(`${ORIGIN}/submit/?date=${DATE}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#submission-workspace", { state: "visible", timeout: 10000 });
  await page.evaluate((date) => {
    const input = document.getElementById("submit-date");
    input.value = date;
    input.dispatchEvent(new Event("change"));
  }, DATE);
  await page.waitForSelector(".problem-block", { timeout: 10000 });
  await page.waitForFunction(() => !document.getElementById("btn-save")?.disabled, null, { timeout: 10000 });

  await page.selectOption(`${modal} .problem-platform`, "AtCoder");
  await page.fill(`${modal} .problem-number`, "typical90_a");
  await page.click(`${modal} > .journal-statement-tools > summary`);
  await page.click(`${modal} .statement-import summary`);
  await page.fill(`${modal} .statement-html`, PAGE_SOURCE);

  // 1. 描述为空：粘贴源码解析后必须直接填入。
  await clickParse();
  let current = await state();
  check("描述为空时原样填入", current.description === DESCRIPTION, JSON.stringify(current.description.slice(0, 40)));
  check("来源与日文提示都写进状态", current.status.includes("浏览器抓回") && current.status.includes("日文原题"), current.status);
  check("标签并入标签框", current.tags.includes("二分答案"), current.tags);
  check("填入后隐藏「替换描述」按钮", current.applyHidden === true);
  check("客户端路径把源码交给服务端", typeof statementCalls.at(-1).html === "string" && statementCalls.at(-1).html.includes("task-statement"));

  // 2. 描述已有内容：不覆盖，但要给出可用的「替换描述」入口，且点了真的替换。
  await fillDescription("我自己写的题意");
  await clickParse();
  current = await state();
  check("已有内容时不自动覆盖", current.description === "我自己写的题意", current.description);
  check("给出「替换描述」按钮", current.applyHidden === false);
  check("状态里指向该按钮", current.status.includes("用这份题面替换描述"), current.status);
  check("预览里能看到抓到的题面", current.previewHidden === false && current.previewText.includes("001 - Yokan Party"));
  await page.click(`${modal} .btn-apply-statement`);
  await page.waitForFunction((selector) => document.querySelector(`${selector} .problem-description`).value.startsWith("# 001"), modal, { timeout: 10000 });
  current = await state();
  check("点「替换描述」后真的替换", current.description === DESCRIPTION);
  check("替换后收起按钮与过期预览", current.applyHidden === true && current.previewHidden === true);

  // 3. 描述里误粘了整页源码：直接替换，不该让用户对着源码做选择。
  await fillDescription(PAGE_SOURCE);
  await clickParse();
  current = await state();
  check("描述里是页面源码时直接替换", current.description === DESCRIPTION);
  check("并说明替换原因", current.status.includes("页面源码"), current.status);

  // 4. 重复解析同一份题面：不重复写入，也不报错。
  await clickParse();
  current = await state();
  check("重复解析不重复写入", current.description === DESCRIPTION && current.status.includes("已经是这份题面"), current.status);

  check("没有页面错误", pageErrors.length === 0, pageErrors.join(" | "));
  console.log(`✅ 题面导入冒烟通过（${checks.length} 项）`);
  for (const name of checks) console.log(`   ✔ ${name}`);
} finally {
  await browser.close();
}
