// Run after CDN_ORIGIN=https://cdn.mirstar.net npm run build and starting npm run preview.
// Map the new CDN URLs to this build's mirrors until the new hashes are published.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const root = path.resolve('site');
assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /name="journal-asset-origin" content="https:\/\/cdn.mirstar.net"/);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const errors = [], assets = [];
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  });
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
  await context.route('https://cdn.mirstar.net/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/style.css') return route.abort();
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    assert.ok(file.startsWith(root + path.sep));
    assets.push(url.href);
    await route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file)] || 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await context.route('https://algo-oauth.xialiao.org/api/session', route => route.fulfill({ json: null }));
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForFunction(() => typeof globalThis.journalRouteRenderer === 'function');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.mountain-logo')).width), '58px');
  assert.ok(await page.locator('link[rel="stylesheet"]').first().getAttribute('href').then(href => href.startsWith('/style.css')));
  await page.goto('http://127.0.0.1:4173/tags/');
  await expect(page.locator('#tag-content')).not.toBeEmpty();
  await page.goto('http://127.0.0.1:4173/problem/%E5%BB%96%E5%A4%8F/2026-09-24/6267d57d-3af1-42e2-8ea3-db860b9d491b/');
  await expect(page.locator('#problem-description .katex').first()).toBeVisible();
  const exportModules = fs.readdirSync(path.join(root, 'assets/js/chunks'))
    .filter(name => /^(export-actions|render-safety)-/.test(name))
    .map(name => `https://cdn.mirstar.net/assets/js/chunks/${name}`);
  await page.evaluate(urls => Promise.all(urls.map(url => import(url))), exportModules);
  // Chromium about:blank/document.write popups cannot use request interception reliably.
  // Export modules are loaded above; vendor assets now use the real, configured CDN.
  await context.unrouteAll({ behavior: 'wait' });
  await page.locator('#export-bar summary').click();
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#btn-export-pdf').click();
  const popup = await popupPromise;
  await expect(popup.locator('.katex').first()).toBeVisible({ timeout: 10000 }).catch(async error => {
    console.error(errors, await popup.evaluate(() => [...document.querySelectorAll('script,link')].map(el => el.src || el.href)));
    throw error;
  });
  await expect(popup.locator('code .token.keyword').first()).toBeVisible();
  await popup.evaluate(() => document.fonts.ready);
  assert.deepEqual(errors, []);
  assert.ok(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('/vendor/katex/fonts/') && new URL(entry.name).origin === location.origin)));
  console.log(`CDN build passed: homepage, lazy catalog, standalone math, PDF and fonts; ${assets.length} CDN requests.`);
} finally { await browser.close(); }
