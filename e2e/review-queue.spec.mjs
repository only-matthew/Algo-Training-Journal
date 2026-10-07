import { test, expect } from "@playwright/test";

const WORKER = "https://algo-oauth.xialiao.org";

test("超纲题可以安排复习，并在返回首页后进入到期队列", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-07T12:00:00+08:00") });
  let patchBody;
  await page.route(`${WORKER}/**`, (route) => {
    if (new URL(route.request().url()).pathname === "/api/session") return route.fulfill({ json: { login: "only-matthew", member: "廖夏", csrfToken: "test-csrf" } });
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON();
      return route.fulfill({ json: { record: patchBody } });
    }
    return route.fulfill({ json: null });
  });
  await page.route("**/data/problems/**", async (route) => {
    const response = await route.fetch();
    const record = await response.json();
    await route.fulfill({ response, json: { ...record, masteryStatus: "beyond_scope", reviewStatus: "none", reviewDue: undefined } });
  });
  // 旧题不在首页最近 30 天的 logs 中，原队列也没有它。
  await page.route("**/data/overview.json?*", async (route) => {
    const response = await route.fetch();
    const overview = await response.json();
    await route.fulfill({ response, json: { ...overview, logs: [], reviewQueue: [], reviewQueueTotalDue: 0 } });
  });
  await page.goto("/problem/%E5%BB%96%E5%A4%8F/2026-09-25/9e3a2136-27ab-4e4e-b9c1-338068bbff1b/");
  await page.locator("[data-problem-review]").getByRole("button", { name: "安排 +3", exact: true }).click();
  await expect.poll(() => patchBody).toEqual({ reviewStatus: "todo", reviewDue: "2026-10-10" });
  await page.clock.setSystemTime(new Date("2026-10-10T12:00:00+08:00"));
  await page.goto("/");
  await expect(page.locator("#review-queue .review-queue-item")).toHaveCount(1);
  await expect(page.locator("#home-review-count")).toHaveText("（1）");
});

test("复习页统一迁移历史状态，到期筛选排除已经结束的安排", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-07T12:00:00+08:00") });
  await page.route(`${WORKER}/api/session`, (route) => route.fulfill({ json: null }));
  await page.route("**/data/review.json?*", (route) => route.fulfill({ json: { logs: [
    { member: "廖夏", date: "2026-10-01", problemId: "legacy", problem: "历史超纲题", platform: "洛谷", tags: [], reviewStatus: "deferred", reviewDue: "2026-10-06" },
    { member: "廖夏", date: "2026-10-01", problemId: "ended", problem: "已结束的题", platform: "洛谷", tags: [], reviewStatus: "archived", reviewDue: "2026-10-06" },
  ] } }));
  await page.goto("/review/");
  await expect(page.locator("#review-todo-count")).toHaveText("1");
  await page.locator("#review-due").selectOption("due");
  await expect(page.locator("#review-records")).toContainText("历史超纲题");
  await expect(page.locator("#review-records")).not.toContainText("已结束的题");
  await expect(page.locator("#review-summary")).toContainText("1 条已逾期");
});

test("首页复习队列在跨日后显示新到期题，并更新数量", async ({ page }) => {
  // 使用实际构建产物，覆盖生成、加载时状态过滤和首页渲染的完整链路。
  await page.clock.install({ time: new Date("2026-10-06T23:59:00+08:00") });
  await page.goto("/");
  const queue = page.locator("#review-queue");
  await expect(queue.locator(".review-queue-item").first()).toBeVisible();
  await expect(queue).not.toContainText("P1019");
  const previousCount = await queue.locator(".review-queue-item").count();

  await page.clock.setSystemTime(new Date("2026-10-07T00:01:00+08:00"));
  await page.reload();
  await expect(queue).toContainText("P1019");
  await expect(queue.locator(".review-queue-item")).toHaveCount(previousCount + 1);
  await expect(page.locator("#home-review-count")).toHaveText(`（${previousCount + 1}）`);
});
