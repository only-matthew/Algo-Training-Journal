import { expect, test } from "@playwright/test";

const WORKER = "https://algo-oauth.xialiao.org";
const TODAY = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

test("public journal renders while the session service is still pending", async ({ page }) => {
  await page.route(`${WORKER}/api/session`, () => new Promise(() => {}));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#records .record").first()).toBeVisible({ timeout: 2500 });
  await expect(page.locator("#metric-total")).not.toHaveText("—");
  await expect(page.locator("#site-version")).toHaveText(/^v2\.0\.1 · \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\+8 · [a-f0-9]{7}$/);
});

test("personal list adds and removes a goal with published progress", async ({ page }) => {
  let items = [];
  let revision = null;
  await page.route(`${WORKER}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/session") return route.fulfill({ json: { login: "only-matthew", member: "廖夏", csrfToken: "test-csrf" } });
    if (pathname === "/api/my-list") {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        if (route.request().headers()["x-csrf-token"] !== "test-csrf" || body.expectedRevision !== revision) {
          return route.fulfill({ status: 409, json: { error: "CONFLICT" } });
        }
        items = body.items;
        revision = String(Number(revision || 0) + 1);
      }
      return route.fulfill({ json: { items, revision } });
    }
    return route.continue();
  });
  await page.goto("/analysis/");
  const panel = page.locator("#my-list-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator("#my-list-progress")).toHaveText("0 / 0");
  await panel.locator("#my-list-platform").selectOption({ label: "Codeforces" });
  await panel.locator("#my-list-number").fill("123A");
  await panel.getByRole("button", { name: "加入清单" }).click();
  await expect(panel.locator("#my-list-items li")).toHaveCount(1);
  await expect(panel.locator("#my-list-progress")).toHaveText("0 / 1");
  await panel.getByRole("button", { name: "移除" }).click();
  await expect(panel.locator("#my-list-items li")).toHaveCount(0);
  await expect(panel.locator("#my-list-progress")).toHaveText("0 / 0");
});

test("标签可直接访问，也可从独立索引进入", async ({ page }) => {
  await page.route(`${WORKER}/api/session`, (route) => route.fulfill({ json: null }));
  await page.goto("/tags/%E9%98%9F%E5%88%97/");
  await expect(page.locator("#tag-page-title")).toHaveText("队列");
  await expect(page.locator("#tag-content")).toContainText("训练记录");

  await page.locator('.desktop-nav [data-route="/tags/"]').click();
  await expect(page.locator("#tag-content .tag-index-card").first()).toBeVisible();
  await page.locator('#tag-content .tag-index-card[data-tag-name="队列"]').click();
  await expect(page.locator("#tag-page-title")).toHaveText("队列");
  await expect(page.locator("#tag-content")).not.toContainText("加载失败");

  await page.goto("/tags/~412a/");
  await expect(page.locator("#tag-page-title")).toHaveText("A*");
});

test("problem detail prominently shows its per-record vitality", async ({ page }) => {
  await page.goto("/problem/%E5%BB%96%E5%A4%8F/2026-09-24/6267d57d-3af1-42e2-8ea3-db860b9d491b/");
  await expect(page.locator(".problem-vitality")).toBeVisible();
  await expect(page.locator(".problem-vitality")).toContainText("本题活力");
});

test("problem review actions match the schedule and send a record-scoped update", async ({ page }) => {
  let patchBody;
  await page.route("**/data/problems/**", async (route) => {
    const response = await route.fetch();
    const record = await response.json();
    const planned = route.request().url().includes("/2026-09-25/");
    await route.fulfill({ response, json: {
      ...record,
      reviewStatus: planned ? "todo" : "none",
      reviewDue: planned ? "2026-09-28" : undefined,
    } });
  });
  await page.route(`${WORKER}/**`, (route) => {
    if (new URL(route.request().url()).pathname === "/api/session") {
      return route.fulfill({ json: { login: "only-matthew", member: "廖夏", csrfToken: "test-csrf" } });
    }
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON();
      return route.fulfill({ json: { record: { reviewStatus: "archived" } } });
    }
    return route.continue();
  });
  await page.goto("/problem/%E5%BB%96%E5%A4%8F/2026-09-28/9df1da8b-6091-4741-8f48-c0efe0938468/");
  await expect(page.locator("[data-problem-edit]")).toBeVisible();
  await expect(page.locator("[data-problem-review]")).toBeHidden();

  await page.goto("/problem/%E5%BB%96%E5%A4%8F/2026-09-25/9e3a2136-27ab-4e4e-b9c1-338068bbff1b/");
  const actions = page.locator("[data-problem-review]");
  await expect(actions.getByRole("button", { name: "结束复习" })).toBeVisible();
  await actions.getByRole("button", { name: "结束复习" }).click();
  await expect.poll(() => patchBody).toEqual({ reviewStatus: "archived" });
  await expect(actions.getByRole("button", { name: "结束复习" })).toHaveCount(0);
  await expect(actions.getByRole("button", { name: "重新安排 +3" })).toBeVisible();
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

test("an old one-problem draft cannot replace another problem already saved for the date", async ({ page }) => {
  const original = { id: "saved-p1443", name: "马的遍历", platform: "洛谷", problemNumber: "P1443", difficulty: "★ 1000", difficultyRating: 1000, tags: ["BFS"], outcome: "hinted", description: "原有题面", takeaway: "原有总结", code: "int main() {}" };
  const draftProblem = { id: "draft-p1135", problem: "奇怪的电梯", platform: "洛谷", problemNumber: "P1135", difficulty: "★ 1000", difficultyRating: 1000, tags: ["BFS"], outcome: "independent", description: "新题面", takeaway: "新总结", code: "int main() {}" };
  let saved;
  let getCount = 0;
  await page.addInitScript(({ date, problem }) => {
    localStorage.setItem(`journal-drafts-v2:only-matthew:${date}`, JSON.stringify({
      draftVersion: 2, memberId: "only-matthew", date, baseRevision: null,
      problems: [problem], exists: false, savedAt: new Date().toISOString(),
      interval: { startedOn: date, solvedOn: date },
    }));
  }, { date: TODAY, problem: draftProblem });
  await page.route(`${WORKER}/**`, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body) => route.fulfill({ json: body });
    if (url.pathname === "/api/session") return json({ login: "only-matthew", member: "廖夏", csrfToken: "test-csrf", avatar_url: "" });
    if (url.pathname === "/api/logs/date" && request.method() === "GET") {
      getCount += 1;
      return json({ revision: "sha256:existing", problems: [original] });
    }
    if (url.pathname === "/api/logs/date" && request.method() === "PUT") {
      saved = request.postDataJSON();
      return json({ revision: "sha256:merged" });
    }
    return route.fulfill({ status: 404, json: { error: "unexpected request" } });
  });

  await page.goto(`/submit/?date=${TODAY}`);
  await expect(page.locator(".problem-block")).toHaveCount(2);
  expect(await page.locator(".problem-block input.problem-number").evaluateAll((inputs) => inputs.map((input) => input.value))).toEqual(["P1135", "P1443"]);
  await expect(page.locator("#submit-msg")).toContainText("合并");
  expect(getCount).toBe(1);
  await page.locator("#btn-save").click();
  await expect(page.locator("#submit-msg")).toContainText("更新已写入");
  expect(saved.problems.map((problem) => problem.problemNumber)).toEqual(["P1135", "P1443"]);
});

test("removing an existing problem can be undone and requires confirmation before saving", async ({ page }) => {
  let putCount = 0;
  await page.route(`${WORKER}/**`, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/session") return route.fulfill({ json: { login: "only-matthew", member: "廖夏", csrfToken: "test-csrf", avatar_url: "" } });
    if (url.pathname === "/api/logs/date" && request.method() === "GET") return route.fulfill({ json: {
      revision: "sha256:existing", problems: [
        { id: "first", name: "马的遍历", platform: "洛谷", problemNumber: "P1443", difficulty: "★ 1000", difficultyRating: 1000, tags: ["BFS"], outcome: "hinted", description: "原题面", takeaway: "原总结", code: "int main() {}" },
        { id: "second", name: "奇怪的电梯", platform: "洛谷", problemNumber: "P1135", difficulty: "★ 1000", difficultyRating: 1000, tags: ["BFS"], outcome: "independent", description: "另一题面", takeaway: "另一总结", code: "int main() {}" },
      ],
    } });
    if (url.pathname === "/api/logs/date" && request.method() === "PUT") putCount += 1;
    return route.fulfill({ status: 404, json: { error: "unexpected request" } });
  });

  await page.goto(`/submit/?date=${TODAY}`);
  await expect(page.locator("#submission-save-preview")).toContainText("将保存 2 道题；服务器已有 2 道");
  await page.locator(".submission-interval summary").click();
  await expect(page.locator(".submission-date-help")).toContainText("跨过午夜也不会自动改变记录日期");
  await page.locator(".problem-block").first().locator(".btn-remove").click();
  await expect(page.locator("#submission-save-preview")).toContainText("1 道将被移除");
  await page.locator("#btn-undo-remove").click();
  await expect(page.locator(".problem-block")).toHaveCount(2);
  await expect(page.locator("#submission-save-preview")).not.toContainText("将被移除");
  await page.locator(".problem-block").first().locator(".btn-remove").click();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("P1443");
    return dialog.dismiss();
  });
  await page.locator("#btn-save").click();
  await expect(page.locator("#submit-msg")).toContainText("已取消保存");
  expect(putCount).toBe(0);
});

test("a stale draft for the same problem requires confirmation before overwriting", async ({ page }) => {
  let putCount = 0;
  await page.addInitScript((date) => {
    localStorage.setItem(`journal-drafts-v2:only-matthew:${date}`, JSON.stringify({
      draftVersion: 2, memberId: "only-matthew", date, baseRevision: "sha256:old",
      problems: [{ id: "same-problem", problem: "马的遍历", platform: "洛谷", problemNumber: "P1443", difficulty: "★ 1000", difficultyRating: 1000, tags: ["BFS"], outcome: "hinted", description: "题面", takeaway: "本地草稿", code: "int main() {}" }],
      exists: true, savedAt: new Date().toISOString(),
    }));
  }, TODAY);
  await page.route(`${WORKER}/**`, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/session") return route.fulfill({ json: { login: "only-matthew", member: "廖夏", csrfToken: "test-csrf", avatar_url: "" } });
    if (url.pathname === "/api/logs/date" && request.method() === "GET") return route.fulfill({ json: {
      revision: "sha256:new", problems: [{ id: "same-problem", name: "马的遍历", platform: "洛谷", problemNumber: "P1443", difficulty: "★ 1000", difficultyRating: 1000, tags: ["BFS"], outcome: "hinted", description: "题面", takeaway: "服务器更新", code: "int main() {}" }],
    } });
    if (url.pathname === "/api/logs/date" && request.method() === "PUT") putCount += 1;
    return route.fulfill({ status: 404, json: { error: "unexpected request" } });
  });

  await page.goto(`/submit/?date=${TODAY}`);
  await expect(page.locator("#submit-msg")).toContainText("保存前会要求确认");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#btn-save").click();
  await expect(page.locator("#submit-msg")).toContainText("已取消覆盖");
  expect(putCount).toBe(0);
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

test("Gym 题号在表单抓题面时归一为比赛号加题目字母", async ({ page }) => {
  let requestedNumber = "";
  await page.route(`${WORKER}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/session") return json({ login: "only-matthew", member: "廖夏", csrfToken: "test-csrf", avatar_url: "" });
    if (url.pathname === "/api/logs/date") return json({ revision: null, problems: [] });
    if (url.pathname === "/api/problem-statement") {
      requestedNumber = JSON.parse(request.postData()).problemNumber;
      return json({ status: "ok", description: "# I. Gym problem", images: [], warnings: [] });
    }
    return json({ error: "unexpected test request" });
  });

  await page.goto(`/submit/?date=${TODAY}`);
  await page.locator("#btn-add-problem").click();
  const row = page.locator("#problem-list .problem-block").first();
  await row.locator(".problem-platform").selectOption("Codeforces");
  await row.locator(".problem-number").fill("Gym718163I");
  await row.locator(".btn-fetch-statement").click();
  await expect(row.locator(".problem-description")).toHaveValue("# I. Gym problem");
  expect(requestedNumber).toBe("718163I");
});

test("超纲 self-assessment preserves review dates through drafts and saving", async ({ page }) => {
  let saved;
  await page.route(`${WORKER}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/session") return json({ login: "only-matthew", member: "廖夏", csrfToken: "test-csrf", avatar_url: "" });
    if (url.pathname === "/api/logs/date" && request.method() === "GET") return json({ revision: saved ? "sha256:saved" : null, problems: saved?.problems || [] });
    if (url.pathname === "/api/logs/date" && request.method() === "PUT") {
      saved = request.postDataJSON();
      return json({ revision: "sha256:saved" });
    }
    return json({ error: "unexpected test request" });
  });

  await page.goto(`/submit/?date=${TODAY}`);
  await page.locator("#btn-add-problem").click();
  const row = page.locator("#problem-list .problem-block").first();
  const review = row.locator(".problem-review-status");
  const due = row.locator(".problem-review-due");
  const expectedDue = new Date(`${TODAY}T00:00:00Z`);
  expectedDue.setUTCDate(expectedDue.getUTCDate() + 3);

  await expect(review).toHaveValue("none");
  await row.locator('.problem-outcome[value="unfinished"]').check();
  await expect(review).toHaveValue("todo");
  await expect(due).toHaveValue(expectedDue.toISOString().slice(0, 10));
  await expect(review.locator('option[value="deferred"]')).toHaveCount(0);

  await row.locator(".review-settings > summary").click();
  const mastery = row.locator(".problem-mastery-status");
  await mastery.selectOption("beyond_scope");
  await expect(review).toHaveValue("todo");
  await expect(due).toBeVisible();
  await due.fill("2026-12-20");
  await review.selectOption("none");
  await expect(mastery).toHaveValue("beyond_scope");
  await review.selectOption("todo");
  await expect(due).toHaveValue("2026-12-20");
  await row.locator(".problem-name").fill("超纲测试题");
  await expect.poll(() => page.evaluate((date) => JSON.parse(localStorage.getItem(`journal-drafts-v2:only-matthew:${date}`) || "null")?.problems?.[0]?.masteryStatus, TODAY)).toBe("beyond_scope");
  await page.reload();
  const restored = page.locator("#problem-list .problem-block").first();
  await expect(restored.locator(".problem-mastery-status")).toHaveValue("beyond_scope");
  await expect(restored.locator(".problem-review-status")).toHaveValue("todo");
  await expect(restored.locator(".problem-review-due")).toHaveValue("2026-12-20");
  await page.locator("#btn-save").click();
  await expect.poll(() => saved?.problems?.[0]?.masteryStatus).toBe("beyond_scope");
  expect(saved.problems[0].reviewStatus).toBe("todo");
  expect(saved.problems[0].reviewDue).toBe("2026-12-20");
  await page.reload();
  await expect(page.locator(".problem-mastery-status").first()).toHaveValue("beyond_scope");
  await expect(page.locator(".problem-review-due").first()).toHaveValue("2026-12-20");
});

test("code editor shows one heading and keeps an accessible label", async ({ page }) => {
  await page.route(`${WORKER}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/session") return json({ login: "only-matthew", member: "廖夏", csrfToken: "test-csrf", avatar_url: "" });
    if (url.pathname === "/api/logs/date" && request.method() === "GET") return json({ revision: null, problems: [] });
    return json({ error: "unexpected test request" });
  });

  await page.goto(`/submit/?date=${TODAY}`);
  const codeSection = page.locator(".journal-code-tools").first();
  await expect(codeSection.getByText("代码", { exact: true })).toHaveCount(1);
  await expect(codeSection.getByRole("textbox", { name: "代码", exact: true })).toBeVisible();
});

test("超纲 records remain discoverable after moving to self-assessment", async ({ page }) => {
  await page.route(`${WORKER}/api/session`, (route) => route.fulfill({ json: null }));
  await page.goto("/review/");
  await page.locator('[data-review-status="deferred"]').click();
  await expect(page.locator("#review-deferred-count")).not.toHaveText("0");
  await expect(page.locator("#review-records")).toContainText("吃奶酪");
  const card = page.locator("#review-records .record", { hasText: "吃奶酪" });
  // v8: 「超纲」是掌握自评（masteryStatus），不再隐含「未安排复习」。
  await expect(card).toContainText("超纲待做");
  // 复习徽标只由 reviewStatus/reviewDue 决定，文案随当天日期漂移
  // （待安排 / 今日到期 / 已到期 / N 天后到期），所以断言"已排期"而不是某一句文案。
  await expect(card.locator(".due-status")).toHaveText(/(待复习|待安排|今日到期|已到期|天后到期)/);
});
