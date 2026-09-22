// 浏览器冒烟：题面 PDF 附件选择 → 本地恢复 → 条件写入。
//
// 这个脚本用真实 Chromium 打开构建产物，拦截 Worker 请求，验证三件在单元测试里
// 看不到的事：附件区确实渲染出来、选中的 PDF 会落到 IndexedDB 并在刷新后恢复、
// 保存时发出的是带幂等键的 multipart 条件写入。
//
// 用法：先 npm run build，再 node scripts/preview-ui.mjs（另开一个终端），
// 然后运行本脚本。失败时以非零码退出。
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "@playwright/test";


const ORIGIN = "http://127.0.0.1:4173";
const WORKER = "https://algo-oauth.xialiao.org";
// 必须用「今天」（UTC+8），应用与服务端都会拒绝未来日期。
const DATE = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const REVISION = `sha256:${"a".repeat(64)}`;
const PDF_BYTES = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n", "utf8");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

const saved = [];
let revision = REVISION;

await page.route(`${WORKER}/**`, async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  if (url.pathname === "/api/session") {
    return json({ login: "only-matthew", member: "廖夏", csrfToken: "csrf-smoke", avatar_url: "" });
  }
  if (url.pathname === "/api/logs/date" && request.method() === "GET") {
    return json({ problems: [], revision: null, updatedAt: undefined });
  }
  if (url.pathname.startsWith("/api/v2/logs/dates/") && request.method() === "PUT") {
    saved.push({ contentType: request.headers()["content-type"] || "", idempotencyKey: request.headers()["idempotency-key"], postData: request.postDataBuffer() });
    revision = `sha256:${"b".repeat(64)}`;
    return json({
      log: {
        schemaVersion: 4,
        problems: [{ id: "smoke-problem", name: "冒烟题", statementAttachment: { sha256: "c".repeat(64), fileName: "题面.pdf", bytes: PDF_BYTES.byteLength, mimeType: "application/pdf" } }],
      },
      version: revision,
      revision,
    });
  }
  return json({ error: "unexpected smoke call", path: url.pathname }, 404);
});

const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };

try {
  await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });

  // 走真实的入口按钮：附件区是 createProblemRow 生成的，绕过 openModal 就看不到它。
  await page.click("#btn-submit");
  await page.waitForSelector("#submit-modal", { state: "visible", timeout: 10000 });

  // 切到固定日期，让 onDateChange → loadDateLog 走到我们的桩上。
  await page.evaluate((date) => {
    const input = document.getElementById("submit-date");
    input.value = date;
    input.dispatchEvent(new Event("change"));
  }, DATE);
  await page.waitForSelector(".problem-block", { timeout: 10000 });
  await page.waitForFunction(() => !document.getElementById("btn-save")?.disabled, null, { timeout: 10000 });

  // 1. 附件区必须真的渲染出来（构建产物里存在，而不只是源码里有）。
  check("attachment picker renders", await page.locator(".btn-pick-statement").first().isVisible());
  check("empty attachment state is explained", (await page.locator(".statement-status").first().textContent()).includes("尚未归档"));

  // 2. 选择题面 PDF：状态要变成「待保存」，并把文件写进 IndexedDB。
  await page.setInputFiles(".statement-file", { name: "题面.pdf", mimeType: "application/pdf", buffer: PDF_BYTES });
  await page.waitForFunction(() => document.querySelector(".statement-status")?.textContent?.includes("待保存"), null, { timeout: 10000 });
  check("picking a PDF marks it pending", true);

  const storedBefore = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("journal-attachments", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("pending", "readonly");
    const all = await new Promise((resolve, reject) => {
      const request = tx.objectStore("pending").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return all.map((record) => ({ key: record.date, items: Object.keys(record.items || {}) }));
  });
  check("the chosen PDF is persisted locally", storedBefore.length === 1 && storedBefore[0].key === DATE);

  // 2b. 刷新页面后必须能恢复这次选择：否则误关或刷新会让用户白选一次 PDF。
  //     会话是异步加载的，恢复逻辑依赖当前登录账号，必须等它回来再操作。
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForResponse((response) => response.url().endsWith("/api/session"), { timeout: 10000 }).catch(() => {});
  await page.click("#btn-submit");
  await page.waitForSelector("#submit-modal", { state: "visible", timeout: 10000 });
  await page.evaluate((date) => {
    const input = document.getElementById("submit-date");
    input.value = date;
    input.dispatchEvent(new Event("change"));
  }, DATE);
  try {
    await page.waitForFunction(() => document.querySelector(".statement-status")?.textContent?.includes("待保存"), null, { timeout: 10000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      submitMsg: document.getElementById("submit-msg")?.textContent || "",
      status: document.querySelector(".statement-status")?.textContent || "",
      date: document.getElementById("submit-date")?.value || "",
      loginVisible: !document.getElementById("btn-login")?.hidden,
      blocks: document.querySelectorAll(".problem-block").length,
    }));
    throw new Error(`${error.message}\nstate: ${JSON.stringify(diagnostic)}`);
  }
  const restoredText = await page.locator(".statement-status").first().textContent();
  check("a pending PDF survives a page reload", restoredText.includes("题面.pdf"));
  check("the restore is explained to the user", (await page.locator("#submit-msg").textContent()).includes("恢复"));
  await page.waitForFunction(() => !document.getElementById("btn-save")?.disabled, null, { timeout: 10000 });

  // 3. 保存：必须是 multipart + 幂等键 + 版本条件。刷新之后表单已被重建，
  //    这里重新填入必填字段。
  await page.evaluate(() => {
    document.querySelector(".problem-name").value = "冒烟题";
    document.querySelector(".problem-takeaway").value = "冒烟用。";
  });
  await page.click("#btn-save");
  try {
    await page.waitForFunction(() => (document.getElementById("submit-msg")?.textContent || "").includes("成功"), null, { timeout: 15000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => document.getElementById("submit-msg")?.textContent || "");
    throw new Error(`${error.message}\nsubmit-msg: ${diagnostic}\nsaves: ${JSON.stringify(saved.map((entry) => entry.contentType))}`);
  }

  check("a save request was sent", saved.length === 1);
  check("the save is multipart", saved[0].contentType.startsWith("multipart/form-data"));
  check("the save carries an idempotency key", typeof saved[0].idempotencyKey === "string" && saved[0].idempotencyKey.length >= 32);
  const body = saved[0].postData.toString("latin1");
  check("the payload declares schema version 4", body.includes("\"schemaVersion\":4"));
  check("the payload requests an attachment replace", body.includes("\"action\":\"replace\""));
  check("the payload carries the read revision", body.includes("sha256:") || body.includes("expectedVersion"));
  check("the PDF bytes are in the request", body.includes("%PDF-1.7"));
  // v2 要求 replace 时由服务端写引用，客户端回传旧哈希会被判为非法。
  check("the payload omits statementAttachment", !body.includes("statementAttachment"));

  // 4. 保存成功后本地待上传记录应被清掉，并显示为已归档。
  const storedAfter = await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open("journal-attachments", 1);
      request.onsuccess = () => resolve(request.result);
    });
    return await new Promise((resolve) => {
      const request = db.transaction("pending", "readonly").objectStore("pending").getAll();
      request.onsuccess = () => resolve(request.result.length);
    });
  });
  check("the local pending record is cleared after saving", storedAfter === 0);

  check("no uncaught page errors", pageErrors.length === 0);
  console.log(JSON.stringify({ ok: true, checks, pageErrors }, null, 2));
} catch (error) {
  fs.mkdirSync("artifacts/ui", { recursive: true });
  await page.screenshot({ path: "artifacts/ui/attachment-smoke-failure.png", fullPage: true }).catch(() => {});
  console.error(JSON.stringify({ ok: false, message: error.message, checks, pageErrors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
