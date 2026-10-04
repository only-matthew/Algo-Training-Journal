import { expect, test } from '@playwright/test';

for (const width of [1440, 375]) {
  for (const theme of ['light', 'dark']) {
    test(`maze detail ${width}px ${theme}: samples, merged thoughts and page scrolling`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 950 });
      await page.route('https://algo-oauth.xialiao.org/api/session', route => route.fulfill({ json: null }));
      await page.goto('/problem/%E5%BB%96%E5%A4%8F/2026-10-03/3a171cd3-4488-43ca-84bb-be255ae4b592/');
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      await expect(page.locator('#problem-code .token.keyword').first()).toBeAttached();
      await expect(page.locator('#problem-description .katex').first()).toBeAttached();
      const sample = page.locator('#problem-description pre').first();
      await expect(sample).toHaveText('2 2 1\n1 1 2 2\n1 2\n');
      await expect(sample.locator('code')).toHaveCSS('display', 'block');
      expect(await sample.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      await expect(page.locator('#problem-description .detail-prose > p').first()).toHaveCSS('max-width', 'none');
      await expect(page.getByRole('heading', { name: '思考与重做' })).toHaveCount(1);
      await expect(page.locator('.attempt-thoughts')).toHaveCount(1);
      expect((await page.locator('.problem-layout').innerText()).match(/直接dfs即可/g)).toHaveLength(1);
      const pre = page.locator('#problem-code pre');
      expect(await pre.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      const descriptionBox = await page.locator('#problem-description').boundingBox();
      const codeBox = await page.locator('#problem-code').boundingBox();
      const thoughtsBox = await page.locator('#problem-thoughts').boundingBox();
      expect(Math.abs(codeBox.width - descriptionBox.width)).toBeLessThan(1);
      expect(Math.abs(thoughtsBox.width - descriptionBox.width)).toBeLessThan(1);
      if (width < 768) {
        const sidebar = page.locator('.problem-aside');
        const sidebarBox = await sidebar.boundingBox();
        expect(Math.abs(sidebarBox.width - descriptionBox.width)).toBeLessThan(1);
        for (const panel of await sidebar.locator('.detail-panel').all()) {
          expect(Math.abs((await panel.boundingBox()).width - descriptionBox.width)).toBeLessThan(1);
        }
        await sidebar.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `artifacts/release/maze-info-${width}-${theme}.png` });
      }
      await pre.evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 140, behavior: 'instant' }));
      const before = await page.evaluate(() => scrollY);
      await page.mouse.move(width / 2, 400);
      await page.mouse.wheel(0, 500);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 200);
      expect(await pre.evaluate(el => el.scrollTop)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await sample.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `artifacts/release/maze-samples-${width}-${theme}.png` });
      await page.locator('#problem-thoughts').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `artifacts/release/maze-thoughts-${width}-${theme}.png` });
      expect(errors).toEqual([]);
    });
  }
}

test('updated math assets render in problem details and PDF export', async ({ page }) => {
  const failures = [];
  const errors = [];
  page.context().on('page', popup => {
    popup.on('pageerror', error => errors.push(error.message));
    popup.on('requestfailed', request => failures.push(request.url()));
  });
  page.on('requestfailed', request => failures.push(request.url()));
  await page.context().route('https://algo-oauth.xialiao.org/api/session', route => route.fulfill({ json: null }));
  await page.goto('/problem/%E5%BB%96%E5%A4%8F/2026-09-24/6267d57d-3af1-42e2-8ea3-db860b9d491b/');
  // The directly opened detail is prerendered; its JSON is fetched on export.
  await expect(page.locator('#problem-description .katex').first()).toBeVisible();
  expect(await page.evaluate(() => globalThis.katex.version)).toBe('0.18.2');
  await expect(page.locator('#problem-description .katex-error')).toHaveCount(0);
  // Chromium's about:blank print window must load its actual static assets normally.
  await page.context().unrouteAll({ behavior: 'wait' });
  await page.locator('#export-bar summary').click();
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#btn-export-pdf').click();
  const popup = await popupPromise;
  await popup.bringToFront();
  await expect(popup.locator('.katex').first()).toBeVisible();
  await expect(popup.locator('.katex-error')).toHaveCount(0);
  await expect(popup.locator('code .token.keyword').first()).toBeVisible();
  await popup.evaluate(() => document.fonts.ready);
  expect(failures.filter(url => url.includes('/vendor/katex/'))).toEqual([]);
  expect(errors).toEqual([]);
  await popup.close();
});

for (const width of [1440, 768, 375, 320]) {
  for (const theme of ['light', 'dark']) {
    test(`release dashboard ${width}px ${theme}: complete chart and accessible values`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 950 });
      await page.route('https://algo-oauth.xialiao.org/api/session', route => route.fulfill({ json: null }));
      await page.goto('/');
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      const chart = page.locator('#vitality-chart');
      const plot = chart.locator('.vitality-plot');
      const svg = chart.locator('svg');
      await expect(svg).toBeVisible();
      await expect.poll(() => svg.evaluate(el => Math.abs(el.viewBox.baseVal.width - el.getBoundingClientRect().width))).toBeLessThan(2);
      expect(await plot.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const first = chart.locator('.vitality-point').first();
      const last = chart.locator('.vitality-point').last();
      const firstDate = await first.getAttribute('data-date');
      const lastDate = await last.getAttribute('data-date');
      await expect(chart.locator('.trend-date-label').first()).toHaveText(firstDate.slice(5));
      await expect(chart.locator('.trend-date-label').last()).toHaveText(lastDate.slice(5));
      if ([1440, 375].includes(width)) await page.screenshot({ path: `artifacts/release/home-${width}-${theme}.png` });

      await plot.scrollIntoViewIfNeeded();
      const tooltip = chart.locator('.vitality-tooltip');
      // Choose by x anywhere in the plot; densely packed markers can overlap on phones.
      await plot.hover({ position: { x: 48, y: 100 } });
      await expect(tooltip).toContainText(firstDate);
      await expect(tooltip).toContainText(`每日活力 ${await first.getAttribute('data-daily')}`);
      await plot.click({ position: { x: (await plot.boundingBox()).width - 26, y: 100 } });
      await page.mouse.move(0, 0);
      await expect(tooltip).toContainText(lastDate);
      const contained = await tooltip.evaluate(el => {
        const box = el.getBoundingClientRect();
        const parent = el.parentElement.getBoundingClientRect();
        return box.left >= parent.left - 1 && box.right <= parent.right + 1;
      });
      expect(contained).toBe(true);
      await plot.focus();
      await plot.press('Home');
      await expect(tooltip).toContainText(firstDate);
      await plot.press('ArrowRight');
      await expect(tooltip).toContainText(await chart.locator('.vitality-point').nth(1).getAttribute('data-date'));
      await plot.press('End');
      await expect(tooltip).toContainText(lastDate);
      await plot.press('Escape');
      await expect(tooltip).toBeHidden();
      if ([1440, 375].includes(width)) await chart.screenshot({ path: `artifacts/release/chart-daily-${width}-${theme}.png` });

      await chart.getByRole('combobox').selectOption('cumulative');
      await expect(chart.getByRole('combobox')).toBeFocused();
      await expect(svg).toHaveAttribute('aria-label', /^累计活力/);
      await plot.focus();
      await plot.press('End');
      await expect(tooltip).toContainText(`累计活力 ${await last.getAttribute('data-cumulative')}`);
      if ([1440, 375].includes(width)) await chart.screenshot({ path: `artifacts/release/chart-${width}-${theme}.png` });
      await page.setViewportSize({ width: width === 1440 ? 375 : 1440, height: 950 });
      await expect.poll(() => svg.evaluate(el => Math.abs(el.viewBox.baseVal.width - el.getBoundingClientRect().width))).toBeLessThan(2);
      await expect(chart.getByRole('combobox')).toHaveValue('cumulative');
      expect(errors).toEqual([]);
    });
  }
}

test('mobile touch selects the nearest date across the plot', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.route('https://algo-oauth.xialiao.org/api/session', route => route.fulfill({ json: null }));
    await page.goto('http://127.0.0.1:4173/');
    const plot = page.locator('#vitality-chart .vitality-plot');
    await plot.scrollIntoViewIfNeeded();
    await plot.tap({ position: { x: 50, y: 100 } });
    await expect(plot.locator('.vitality-tooltip')).toBeVisible();
    await expect(plot.locator('.vitality-tooltip')).toContainText('每日活力');
  } finally {
    await context.close();
  }
});
