import { expect, test } from "@playwright/test";

const WORKER = "https://algo-oauth.xialiao.org";
const paths = ["/roadmap/", "/problem/%E5%BB%96%E5%A4%8F/2026-10-03/3a171cd3-4488-43ca-84bb-be255ae4b592/"];

for (const path of paths) {
  test(`account menu has one auth action without JavaScript at ${path}`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:4173${path}`);
      await page.locator(".account-menu > summary").click();
      await expect(page.locator("#btn-login")).toBeVisible();
      await expect(page.locator("#btn-logout")).toBeHidden();
    } finally { await context.close(); }
  });

  test(`account menu stays exclusive through delayed session and logout at ${path}`, async ({ page }) => {
    let sessionRoute;
    await page.route(`${WORKER}/api/session`, (route) => { sessionRoute = route; });
    await page.route(`${WORKER}/api/logout`, (route) => route.fulfill({ json: { ok: true } }));
    await page.goto(path);
    await page.locator(".account-menu > summary").click();
    await expect.poll(() => Boolean(sessionRoute)).toBe(true);
    await expect(page.locator("#btn-login")).toBeVisible();
    await expect(page.locator("#btn-logout")).toBeHidden();
    await sessionRoute.fulfill({ json: { login: "only-matthew", member: "廖夏", memberId: "only-matthew", csrfToken: "test", avatar_url: "/assets/branding/favicon-32.png" } });
    await expect(page.locator("#account-label")).toHaveText("廖夏");
    await expect(page.locator("#btn-login")).toBeHidden();
    await expect(page.locator("#btn-logout")).toBeVisible();
    await page.locator("#btn-logout").click();
    await expect(page.locator("#account-label")).toHaveText("公开浏览");
    await expect(page.locator("#btn-login")).toBeVisible();
    await expect(page.locator("#btn-logout")).toBeHidden();
  });

  test(`account menu stays anonymous after session failure at ${path}`, async ({ page }) => {
    await page.route(`${WORKER}/api/session`, (route) => route.fulfill({ status: 503, json: { error: "unavailable" } }));
    await page.goto(path);
    await page.locator(".account-menu > summary").click();
    await expect(page.locator("#btn-login")).toBeVisible();
    await expect(page.locator("#btn-logout")).toBeHidden();
  });
}
