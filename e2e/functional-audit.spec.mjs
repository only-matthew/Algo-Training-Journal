import { test, expect } from '@playwright/test';
const WORKER = 'https://algo-oauth.xialiao.org';
const TODAY = new Date(Date.now() + 8 * 3600000).toISOString().slice(0,10);
async function mock(page, custom = () => false) {
  await page.route(`${WORKER}/**`, async route => {
    if (await custom(route)) return;
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: { login:'only-matthew', member:'廖夏', memberId:'only-matthew', csrfToken:'audit', avatar_url:'' } });
    if (path === '/api/logs/date') return route.fulfill({ json:{ revision:null, problems:[] } });
    return route.fulfill({ status:404, json:{ error:'Blocked by local audit' } });
  });
}
test('F1 redo URL is consumed once and not replayed on reload', async ({page}) => {
  await mock(page);
  const redo = JSON.stringify({name:'审计重做', platform:'洛谷', problemNumber:'P1001'});
  await page.goto(`/submit/?date=${TODAY}&redo=${encodeURIComponent(redo)}`);
  await expect(page.locator('.problem-name')).toHaveValue('审计重做');
  await expect.poll(() => page.evaluate(date => JSON.parse(localStorage.getItem(`journal-drafts-v2:only-matthew:${date}`)||'null')?.problems?.length,TODAY)).toBe(1);
  await page.reload();
  await expect(page.locator('.problem-name')).toHaveCount(1);
  await expect(page.locator('.problem-name')).toHaveValue('审计重做');
  expect(new URL(page.url()).searchParams.has('redo')).toBe(false);
});
test('F2 personal-list conflict recovers after the site refresh button', async ({page}) => {
  let reads = 0;
  await mock(page, async route => {
    if(new URL(route.request().url()).pathname !== '/api/my-list') return false;
    if(route.request().method() === 'PUT') {
      if(reads === 1) await route.fulfill({status:409,json:{error:'conflict'}});
      else {
        const body = route.request().postDataJSON();
        expect(body.expectedRevision).toBe('r2');
        await route.fulfill({json:{revision:'r3',items:body.items}});
      }
    } else { reads++; await route.fulfill({json:{revision:`r${reads}`,items:[]}}); }
    return true;
  });
  await page.goto('/analysis/');
  await expect(page.locator('#my-list-progress')).toHaveText('0 / 0');
  await page.locator('#my-list-platform').selectOption({label:'洛谷'});
  await page.locator('#my-list-number').fill('P1001');
  await page.locator('#my-list-form button[type=submit]').click();
  await expect(page.locator('#my-list-status')).toContainText('请刷新后重试');
  await page.locator('.account-menu > summary').click();
  await page.locator('#btn-refresh').click();
  await expect(page.locator('#btn-refresh')).toBeEnabled();
  await expect.poll(() => reads).toBe(2);
  await expect(page.locator('#my-list-status')).toHaveText('');
  await expect(page.locator('#my-list-number')).toHaveValue('P1001');
  await page.locator('#my-list-form button[type=submit]').click();
  await expect(page.locator('#my-list-progress')).toHaveText('0 / 1');
});
test('F3 delayed AI summary preserves newer text and offers the result as a preview', async ({page}) => {
  let pending;
  await mock(page, async route => {
    if(new URL(route.request().url()).pathname !== '/api/summarize') return false;
    pending = route;
    return true;
  });
  await page.goto(`/submit/?date=${TODAY}`);
  await expect(page.locator('#btn-save')).toBeEnabled();
  await page.locator('.problem-description').fill('这是原始题目描述，长度超过二十字，供异步概括审计使用。');
  await page.locator('.btn-summarize').click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await page.locator('.problem-description').fill('这是用户在请求期间新写的正文，应当保留。');
  await pending.fulfill({json:{summary:'旧请求概括'}});
  await expect(page.locator('.summarize-status')).toContainText('概括未自动覆盖');
  await expect(page.locator('.problem-description')).toHaveValue('这是用户在请求期间新写的正文，应当保留。');
});
