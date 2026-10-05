// Rebuild the checked-in icon sizes and social card using the site's existing artwork.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'src/assets/branding');
const svg = fs.readFileSync(path.join(out, 'favicon.svg'), 'utf8');
const mountains = fs.readFileSync(path.join(root, 'src/assets/ink-mountains.webp')).toString('base64');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const sizes = [];
  for (const size of [16, 32, 48, 180]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>${svg}`);
    const png = await page.screenshot({ path: path.join(out, size === 180 ? 'apple-touch-icon.png' : `favicon-${size}.png`) });
    if (size < 180) sizes.push({ size, png });
  }
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach(({ size, png }, index) => {
    const pos = 6 + index * 16;
    header[pos] = header[pos + 1] = size;
    header.writeUInt16LE(1, pos + 4);
    header.writeUInt16LE(32, pos + 6);
    header.writeUInt32LE(png.length, pos + 8);
    header.writeUInt32LE(offset, pos + 12);
    offset += png.length;
  });
  fs.writeFileSync(path.join(root, 'src/favicon.ico'), Buffer.concat([header, ...sizes.map(item => item.png)]));
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#f3f8f5;color:#092e25;font-family:"Microsoft YaHei","PingFang SC",sans-serif;overflow:hidden}
    .art{position:absolute;right:-130px;top:65px;width:940px;opacity:.64;mask-image:linear-gradient(#000 60%,transparent 100%)}.wash{position:absolute;inset:0;background:linear-gradient(90deg,#f3f8f5 12%,rgba(243,248,245,.93) 34%,transparent 75%)}
    main{position:relative;padding:57px 66px;height:100%;border-top:9px solid #0d5d47}.brand{display:flex;align-items:center;gap:18px;font-size:23px;font-weight:700;letter-spacing:2px}.brand svg{width:50px;height:50px}
    h1{font-size:68px;letter-spacing:-2px;line-height:1.28;margin:63px 0 19px;font-weight:700}.accent{color:#0d5d47}p{font-size:24px;line-height:1.7;margin:0;color:#47685d}.footer{position:absolute;bottom:44px;left:66px;right:66px;display:flex;justify-content:space-between;align-items:center;color:#507365;font-size:19px}.line{height:1px;background:#bacec2;position:absolute;bottom:89px;left:66px;right:66px}
    </style><img class="art" src="data:image/webp;base64,${mountains}"><div class="wash"></div><main><div class="brand">${svg}<span>ICPC 算法训练日志</span></div><h1>用算法，<br><span class="accent">记录我们的成长</span></h1><p>刷题记录 · 原创题解 · 训练复盘<br>算法如山，行则将至。</p><div class="line"></div><div class="footer"><span>记录 · 思考 · 成长</span><span>train.xialiao.org</span></div></main></html>`);
  await page.evaluate(async () => { await globalThis.document.fonts.ready; await Promise.all([...globalThis.document.images].map(img => img.decode())); });
  await page.screenshot({ path: path.join(out, 'og-image.png') });
} finally { await browser.close(); }
