import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.beforeEach(async ({ page }) => {
  await page.route('https://algo-oauth.xialiao.org/api/session', route => route.fulfill({ json: null }));
});

async function refresh(page) {
  await page.locator('.account-menu > summary').click();
  await page.locator('#btn-refresh').click();
  await expect(page.locator('#btn-refresh')).toBeEnabled();
}

test('review filters survive refresh', async ({ page }) => {
  await page.goto('/review/');
  await expect(page.locator('#review-records .record').first()).toBeVisible();
  await page.locator('#review-member').selectOption('廖夏');
  await page.locator('#review-due').selectOption('future');
  await expect(page.locator('#review-member')).toHaveValue('廖夏');
  await refresh(page);
  await expect(page.locator('#review-member')).toHaveValue('廖夏');
  await expect(page.locator('#review-due')).toHaveValue('future');
});

test('an unmatched homepage tag shows an empty state', async ({ page }) => {
  await page.goto('/?tag=没有近期记录的标签');
  await expect(page.locator('#records')).toContainText('近 30 天暂无');
  await expect(page.locator('#records .record')).toHaveCount(0);
  await expect(page.locator('#tag-filter-bar .active')).toContainText('没有近期记录的标签');
});

test('analysis presets use UTC+8 in other browser timezones', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
  const page = await context.newPage();
  try {
    await page.route('https://algo-oauth.xialiao.org/api/session', route => route.fulfill({ json: null }));
    await page.clock.install({ time: new Date('2026-10-08T00:30:00+08:00') });
    await page.goto('http://127.0.0.1:4173/analysis/');
    await expect(page.locator('#analysis-records .record').first()).toBeVisible();
    await page.locator('#analysis-page .more-tools > summary').click();
    await page.locator('.analysis-preset[data-range="today"]').click();
    await expect(page.locator('#analysis-start')).toHaveValue('2026-10-08');
    await expect(page.locator('#analysis-end')).toHaveValue('2026-10-08');
    await page.locator('.analysis-preset[data-range="week"]').click();
    await expect(page.locator('#analysis-start')).toHaveValue('2026-10-05');
    await expect(page.locator('#analysis-end')).toHaveValue('2026-10-11');
    await page.locator('.analysis-preset[data-range="month"]').click();
    await expect(page.locator('#analysis-start')).toHaveValue('2026-10-01');
    await expect(page.locator('#analysis-end')).toHaveValue('2026-10-31');
  } finally { await context.close(); }
});

test('direct tag and related-record pages apply pending review changes to their prerendered content', async ({ page }) => {
  const overview = JSON.parse(readFileSync(new URL('../site/data/overview.json', import.meta.url), 'utf8'));
  const record = overview.logs.find(item => item.problemNumber === 'P1019' && item.member === '廖夏');
  await page.addInitScript(record => {
    sessionStorage.setItem(`journal-review-override:${record.member}:${record.date}:${record.problemId}`, JSON.stringify({ reviewStatus: 'archived', reviewDue: null, record: { ...record, reviewStatus: 'archived', reviewDue: undefined } }));
  }, record);
  await page.goto('/tags/字符串/');
  await expect(page.locator('#tag-records tr', { hasText: 'P1019' }).filter({ hasText: '廖夏' })).toContainText('已结束复习安排');
  const data = JSON.parse(readFileSync(new URL('../site/data/logs/2026-08.json', import.meta.url), 'utf8'));
  const other = data.logs.find(item => item.problemNumber === 'P1019' && item.member === '王梓豪');
  await page.goto(`/problem/${encodeURIComponent(other.member)}/${other.date}/${other.problemId}/`);
  await expect(page.locator('#problem-related')).toContainText('廖夏');
  await expect(page.locator('#problem-related')).not.toContainText('待复习');
});

test('a slow tag request cannot overwrite the newer route', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let requested = false;
  await page.route('**/data/tags/**', async route => {
    if (decodeURIComponent(new URL(route.request().url()).pathname).includes('/二分.json')) {
      const response = await route.fetch();
      requested = true;
      await pending;
      return route.fulfill({ response });
    }
    return route.continue();
  });
  await page.goto('/tags/');
  await page.waitForFunction(() => typeof window.journalRouteRenderer === 'function');
  await page.evaluate(() => { history.pushState(null, '', '/tags/二分/'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(() => { history.pushState(null, '', '/tags/搜索/'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.locator('#tag-page-title')).toHaveText('搜索');
  const finished = page.waitForResponse(response => decodeURIComponent(response.url()).includes('/data/tags/二分.json'));
  release();
  await (await finished).finished();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(page.locator('#tag-page-title')).toHaveText('搜索');
  await expect(page).toHaveURL(/\/tags\/(?:搜索|%E6%90%9C%E7%B4%A2)\/$/);
});

