// Controlled asset-host comparison using one captured, currently published page.
// HTML and logged-out session are held constant; all public assets/data use real networks.
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { load } from 'cheerio';

const origin = 'https://train.xialiao.org';
const cdn = 'https://cdn.mirstar.net';
const trials = Number(process.env.CDN_TRIALS || 5);
const original = await (await fetch(origin)).text();
function pageHtml(host) {
  const $ = load(original);
  $('meta[http-equiv="Content-Security-Policy"]').each((_, el) => {
    const item = $(el);
    item.attr('content', item.attr('content').replace(/(script-src|style-src|connect-src|img-src) 'self'/g, `$1 'self' ${cdn}`) + ` font-src 'self' ${cdn};`);
  });
  $('script[src],link[href]').each((_, el) => {
    const item = $(el);
    const attr = el.name === 'script' ? 'src' : 'href';
    const url = new URL(item.attr(attr), origin);
    if (url.origin === origin && (/^\/assets\//.test(url.pathname) || url.pathname === '/style.css' || /^\/vendor\//.test(url.pathname))) {
      item.attr(attr, host + url.pathname + url.search);
    }
  });
  if (host === cdn) $('<link>').attr({ rel: 'preconnect', href: cdn, crossorigin: 'anonymous' }).appendTo('head');
  return $.html();
}
const samples = [];
for (let round = 0; round < trials; round++) {
  for (const host of round % 2 ? [cdn, origin] : [origin, cdn]) {
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      page.on('pageerror', error => errors.push(error.message));
      await page.route(origin + '/', route => route.fulfill({ body: pageHtml(host), contentType: 'text/html' }));
      await page.route('https://algo-oauth.xialiao.org/api/session', route => route.fulfill({ json: null }));
      await page.addInitScript(() => {
        globalThis.cdnLcp = 0;
        new PerformanceObserver(list => { globalThis.cdnLcp = list.getEntries().at(-1).startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      });
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => typeof globalThis.journalRouteRenderer === 'function', { timeout: 60000 });
      const ready = await page.evaluate(() => performance.now());
      await page.waitForLoadState('networkidle', { timeout: 60000 });
      const result = await page.evaluate(() => ({
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
        lcp: globalThis.cdnLcp,
        assets: performance.getEntriesByType('resource').filter(e => /\/assets\/|\/style.css|\/vendor\//.test(e.name)).map(e => ({ url: e.name, duration: e.duration, end: e.responseEnd, bytes: e.encodedBodySize })),
      }));
      samples.push({ round: round + 1, host, ready, ...result, errors });
      console.log(JSON.stringify({ round: round + 1, host, ready, fcp: result.fcp, lcp: result.lcp, errors }));
    } finally { await browser.close(); }
  }
}
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = [origin, cdn].map(host => {
  const rows = samples.filter(row => row.host === host);
  return { host, runs: rows.length, fcp: median(rows.map(r => r.fcp)), lcp: median(rows.map(r => r.lcp)), ready: median(rows.map(r => r.ready)), errors: rows.flatMap(r => r.errors) };
});
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/cdn-comparison.json', JSON.stringify({ measuredAt: new Date().toISOString(), methodology: 'Same published HTML; real asset/data network; HTML/session held constant; cold browser per trial; alternating order; no throttling; mainland current machine; CDN edge may be warm', summary, samples }, null, 2));
console.log(JSON.stringify(summary, null, 2));
