import { expect, test } from '@playwright/test';

const problemPath = '/problem/%E5%BB%96%E5%A4%8F/2026-10-03/3a171cd3-4488-43ca-84bb-be255ae4b592/';

for (const width of [1440, 375]) {
  test(`problem layout remains stable with delayed assets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.route('https://algo-oauth.xialiao.org/api/session', route => route.fulfill({ json: null }));
    await page.route('**/vendor/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 650));
      await route.continue();
    });
    await page.addInitScript(() => {
      window.layoutShifts = [];
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.layoutShifts.push({ value: entry.value, nodes: entry.sources.map(source => source.node?.id || source.node?.nodeName) });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/');
    await expect(page.locator('#vitality-chart svg')).toBeVisible();
    await page.evaluate(() => { window.layoutShifts = []; });
    await page.evaluate(path => {
      history.pushState(null, '', path);
      dispatchEvent(new PopStateEvent('popstate'));
    }, problemPath);
    await expect(page.locator('#problem-code .token.keyword').first()).toBeAttached();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    const shifts = await page.evaluate(() => window.layoutShifts);
    const total = shifts.reduce((total, entry) => total + entry.value, 0);
    console.log(JSON.stringify({ width, shifts, total }));
    expect(total).toBeLessThan(0.02);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/layout-stability/problem-${width}.png` });

    // A delayed refresh must keep the already rendered content and scroll position.
    await page.route('**/data/problems/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 650));
      await route.continue();
    });
    await page.locator('#problem-code').scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => scrollY);
    await page.evaluate(() => {
      window.detailBefore = document.querySelector('#problem-code');
      window.layoutShifts = [];
      window.journalRouteRenderer();
    });
    await expect(page.locator('#problem-detail')).toHaveAttribute('aria-busy', 'true');
    expect(await page.evaluate(() => window.detailBefore === document.querySelector('#problem-code'))).toBe(true);
    await expect(page.locator('#btn-export-pdf')).toBeDisabled();
    await expect(page.locator('#problem-detail')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#btn-export-pdf')).toBeEnabled();
    expect(Math.abs(await page.evaluate(() => scrollY) - scrollBefore)).toBeLessThan(2);
  });
}

test('standalone problem enhances content before a slow session completes', async ({ page }) => {
  let finishSession;
  const sessionGate = new Promise(resolve => { finishSession = resolve; });
  await page.route('https://algo-oauth.xialiao.org/api/session', async route => {
    await sessionGate;
    await route.fulfill({ json: null });
  });
  await page.goto(problemPath, { waitUntil: 'domcontentloaded' });
  try {
    await expect(page.locator('#problem-code .token.keyword').first()).toBeAttached();
    await expect(page.locator('#problem-description .katex').first()).toBeAttached();
  } finally {
    finishSession();
  }
});
