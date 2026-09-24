import { expect, test } from "@playwright/test";

const WORKER = "https://algo-oauth.xialiao.org";
const TODAY = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

test("public journal renders while the session service is still pending", async ({ page }) => {
  await page.route(`${WORKER}/api/session`, () => new Promise(() => {}));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#records .record").first()).toBeVisible({ timeout: 2500 });
  await expect(page.locator("#metric-total")).not.toHaveText("—");
});

test("SPA member navigation reloads the requested member shard", async ({ page }) => {
  await page.route(`${WORKER}/api/session`, (route) => route.fulfill({ json: null }));
  await page.goto("/member/%E5%BB%96%E5%A4%8F/");
  await expect(page.locator("#member-page-title")).toContainText("廖夏");

  await page.evaluate(() => {
    history.pushState(null, "", "/member/%E7%8E%8B%E6%A2%93%E8%B1%AA/");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.locator("#member-page-title")).toContainText("王梓豪");
  await expect(page.locator("#member-record-count")).toContainText("道题");
});

test("header search opens the archive and finds a problem older than 30 days", async ({ page }) => {
  await page.route(`${WORKER}/api/session`, (route) => route.fulfill({ json: null }));
  await page.goto("/");
  await page.locator("#global-search").fill("P5143");
  await page.locator("#global-search-form").press("Enter");

  await expect(page).toHaveURL(/\/analysis\/\?q=P5143$/);
  await expect(page.locator("#analysis-search")).toHaveValue("P5143");
  await expect(page.locator("#analysis-records").getByRole("link", { name: "P5143", exact: true })).toBeVisible();

  await page.locator("#analysis-search").fill("P1104");
  await expect(page).toHaveURL(/\/analysis\/\?q=P1104$/);
  await expect(page.locator("#analysis-records").getByRole("link", { name: "P1104", exact: true })).toBeVisible();
});

test("archive starts with every date and keeps its filters inside the page", async ({ page }) => {
  await page.route(`${WORKER}/api/session`, (route) => route.fulfill({ json: null }));
  await page.goto("/analysis/");
  const manifest = await (await page.request.get("/data/manifest.json")).json();
  await expect(page.locator("#analysis-summary")).toContainText(`全部日期 · 共 ${manifest.totalLogs} 题`);
  await expect(page.locator("#analysis-start")).toHaveValue("");
  await expect(page.locator("#analysis-end")).toHaveValue("");

  for (const width of [2048, 1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator(".archive-filters").evaluate((bar) => {
      const bounds = bar.getBoundingClientRect();
      const controls = [...bar.querySelectorAll(":scope > *")].map((item) => item.getBoundingClientRect());
      return {
        width: bounds.width,
        scrollWidth: bar.scrollWidth,
        contained: controls.every((item) => item.left >= bounds.left - 1 && item.right <= bounds.right + 1),
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(Math.ceil(layout.width));
    expect(layout.contained).toBe(true);
  }
});

test("version conflicts preserve the draft and require an explicit overwrite", async ({ page }) => {
  let revision = "sha256:initial";
  let putCount = 0;
  await page.route(`${WORKER}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/session") return json({ login: "only-matthew", member: "廖夏", csrfToken: "test-csrf", avatar_url: "" });
    if (url.pathname === "/api/logs/date" && request.method() === "GET") return json({
      revision,
      problems: [{ id: "conflict-p1", name: "冲突测试题", platform: "Codeforces", problemNumber: "1A", tags: ["模拟"], description: "用于验证并发保存冲突不会静默覆盖服务器内容。", takeaway: "保留当前浏览器中的草稿。", code: "int main() {}" }],
    });
    if (url.pathname === "/api/logs/date" && request.method() === "PUT") {
      putCount += 1;
      revision = "sha256:newer";
      return json({ error: { code: "VERSION_CONFLICT", message: "版本已更新", currentRevision: revision } }, 409);
    }
    return json({ error: "unexpected test request" }, 404);
  });

  await page.goto(`/submit/?date=${TODAY}`);
  await expect(page.locator("#journal-editor-title")).toHaveText("编辑训练日志");
  await page.locator(".problem-takeaway").fill("这是尚未提交的本地修改，发生冲突后必须继续保留。");
  await page.locator("#btn-save").click();
  await expect(page.locator("#submit-msg")).toContainText("再次保存时会先询问");
  await expect(page.locator(".problem-takeaway")).toHaveValue("这是尚未提交的本地修改，发生冲突后必须继续保留。");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("是否用当前草稿覆盖最新版本");
    await dialog.dismiss();
  });
  await page.locator("#btn-save").click();
  await expect(page.locator("#submit-msg")).toContainText("已取消覆盖");
  expect(putCount).toBe(1);
});

test("adding a Codeforces AC import automatically fetches its statement", async ({ page }) => {
  let statementRequests = 0;
  await page.route(`${WORKER}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/session") return json({ login: "only-matthew", member: "廖夏", csrfToken: "test-csrf", cfHandle: "tourist", avatar_url: "" });
    if (url.pathname === "/api/logs/date" && request.method() === "GET") return json({ revision: null, problems: [] });
    if (url.pathname === "/api/import") return json({ problems: [{ platform: "Codeforces", problemNumber: "1A", name: "Theatre Square", rating: 800, tags: ["math"] }] });
    if (url.pathname === "/api/problem-statement") {
      statementRequests += 1;
      return json({ status: "ok", description: "给定广场边长和石板边长，计算铺满广场所需的最少石板数量。", source: { kind: "codeforces", url: "https://codeforces.com/problemset/problem/1/A", parserVersion: "cf-html-v4" }, images: [], warnings: [], tags: ["数学"] });
    }
    return json({ error: "unexpected test request" }, 404);
  });

  await page.goto(`/submit/?date=${TODAY}`);
  await page.locator("#btn-import-cf").click();
  await page.locator("#import-input").fill("tourist");
  await page.locator("#btn-import-run").click();
  await expect(page.locator("#import-list .import-item")).toHaveCount(1);
  await page.locator("#btn-import-add").click();

  await expect(page.locator(".problem-description")).toHaveValue("给定广场边长和石板边长，计算铺满广场所需的最少石板数量。");
  await expect(page.locator("#submit-msg")).toContainText("自动抓取 1 道 Codeforces 题面");
  expect(statementRequests).toBe(1);
});
