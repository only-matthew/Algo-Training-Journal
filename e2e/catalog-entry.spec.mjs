import { test, expect } from '@playwright/test';

for (const entry of [
  { path: '/roadmap/', root: '#roadmap-content .roadmap-overview' },
  { path: '/tags/', root: '#tag-content .tag-index-card' },
]) {
  test(`homepage opens prerendered ${entry.path} when catalog enhancement cannot load`, async ({ page }) => {
    await page.route('https://algo-oauth.xialiao.org/api/session', route => route.fulfill({ json: null }));
    await page.route('**/catalog-renderer-*.js', route => route.abort());
    await page.route('**/data/roadmap.json?*', route => route.abort());
    await page.route('**/data/tag-index.json?*', route => route.abort());
    const documents = [];
    page.on('request', request => { if (request.resourceType() === 'document') documents.push(new URL(request.url()).pathname); });
    await page.goto('/');
    await page.waitForFunction(() => typeof window.journalRouteRenderer === 'function');
    await page.locator(`.desktop-nav [data-route="${entry.path}"]`).click();
    await expect(page).toHaveURL(new RegExp(entry.path + '$'));
    await expect(page.locator(entry.root).first()).toBeVisible();
    expect(documents).toContain(entry.path);
    await page.waitForLoadState('load');
    const other = entry.path === '/roadmap/' ? '/tags/' : '/roadmap/';
    await page.locator(`.desktop-nav [data-route="${other}"]`).click();
    await expect(page).toHaveURL(new RegExp(other + '$'));
    await expect(page.locator(other === '/tags/' ? '#tag-content .tag-index-card' : '#roadmap-content .roadmap-overview').first()).toBeVisible();
  });
}
