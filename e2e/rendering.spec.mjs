import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { load } from 'cheerio';
import { renderMarkdown } from '../lib/render-safety.mjs';

const route = '/problem/%E5%BB%96%E5%A4%8F/2026-10-03/3a171cd3-4488-43ca-84bb-be255ae4b592/';
const source = readFileSync(new URL('../site' + decodeURIComponent(route) + 'index.html', import.meta.url), 'utf8');

for (const slow of ['prism', 'katex']) {
  test(`math and highlighting render independently while ${slow} stalls`, async ({ page }) => {
    const $ = load(source);
    $('#problem-description .detail-prose').html(renderMarkdown(String.raw`行内 \(a_b < c\)，还有 $x^2$。

\[
\begin{aligned}
a &= b \\
c &= d
\end{aligned}
\]

$$y^2$$

代码里的公式保持原样：\`\(literal\)\``.replace(/\\`/g, '`')));
    $('meta[name="journal-asset-origin"]').attr('content', 'https://cdn.mirstar.net');
    await page.route('**' + route, request => request.fulfill({ body: $.html(), contentType: 'text/html' }));
    await page.route('https://cdn.mirstar.net/**', request => request.abort());
    await page.route('https://algo-oauth.xialiao.org/api/session', request => request.fulfill({ json: null }));
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route(`**/vendor/${slow}/${slow}.min.js`, async request => {
      await held;
      await request.continue();
    });
    try {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const ready = slow === 'prism' ? '#problem-description .katex' : '#problem-code .token.keyword';
      await expect(page.locator(ready).first()).toBeVisible();
      release();
      await expect(page.locator('#problem-description .katex')).toHaveCount(4);
      await expect(page.locator('#problem-description .katex-display')).toHaveCount(2);
      await expect(page.locator('#problem-code .token.keyword').first()).toBeVisible();
      await expect(page.locator('#problem-description code')).toHaveText(String.raw`\(literal\)`);
      await expect(page.locator('.katex-error')).toHaveCount(0);
      expect(await page.evaluate(() => [...document.querySelectorAll('script[src*="/vendor/"], link[href*="/vendor/"]')].every(el => new URL(el.src || el.href).origin === location.origin))).toBe(true);
    } finally { release(); }
  });
}
