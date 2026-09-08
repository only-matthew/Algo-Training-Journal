import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/onlym/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium} = require('playwright');
const browser = await chromium.launch({headless:true,channel:"msedge"});
const page = await browser.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('https://algo-oauth.xialiao.org/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{"error":"Unauthorized"}'}));
fs.mkdirSync('artifacts/ui',{recursive:true});
const results=[];
for (const width of [1440,390]) {
  await page.setViewportSize({width,height:1000});
  for (const route of ['','analysis/','review/','roadmap/','tags/','member/廖夏/']) {
    await page.goto('http://127.0.0.1:4173/'+route);
    await page.waitForLoadState('networkidle');
    const name=route.split('/')[0]||'home';
    await page.screenshot({path:`artifacts/ui/${name}-${width}.png`,fullPage:false});
    results.push(await page.evaluate(({route,width})=>({route,width,overflow:document.documentElement.scrollWidth>innerWidth,heading:document.querySelector('.page-view:not([hidden]) h1')?.textContent,cards:document.querySelectorAll('.page-view:not([hidden]) .record').length}),{route,width}));
  }
}
await page.goto('http://127.0.0.1:4173/');
await page.waitForLoadState('networkidle');
const detail=await page.locator('#records .record-detail-link').first().getAttribute('href');
await page.goto('http://127.0.0.1:4173'+detail);
await page.waitForLoadState('networkidle');
await page.screenshot({path:'artifacts/ui/problem-390.png'});
await page.setViewportSize({width:1440,height:1000});
await page.screenshot({path:'artifacts/ui/problem-1440.png'});
await page.goto('http://127.0.0.1:4173/analysis/');
await page.waitForLoadState('networkidle');
await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
await page.screenshot({path:'artifacts/ui/dark-1440.png'});
console.log(JSON.stringify({results,errors},null,2));
await browser.close();
