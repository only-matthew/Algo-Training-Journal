import { test, expect } from '@playwright/test';
const WORKER = 'https://algo-oauth.xialiao.org';
const FIRST = '2026-10-06';
const SECOND = '2026-10-07';

async function delayedSave(page, attachment = false) {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let saving = false;
  let deletedDate;
  const writes = [];
  await page.route(`${WORKER}/**`, async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/session') return route.fulfill({ json: { login: 'only-matthew', member: '廖夏', csrfToken: 'test' } });
    if (request.method() === 'GET') return route.fulfill({ json: { revision: null, problems: [] } });
    if (request.method() === 'DELETE') deletedDate = new URL(request.url()).searchParams.get('date');
    writes.push({ date: new URL(request.url()).searchParams.get('date'), method: request.method(), body: request.postData() });
    saving = true;
    await pending;
    const id = request.postData()?.match(/"id"\s*:\s*"([^"]+)"/)?.[1];
    return route.fulfill({ json: attachment ? { revision: 'sha256:saved', log: { problems: [{ id, statementAttachment: { fileName: 'first.pdf', sha256: 'a'.repeat(64), mimeType: 'application/pdf', bytes: 30 } }] } } : { revision: 'sha256:saved' } });
  });
  await page.goto(`/submit/?date=${FIRST}`);
  await page.locator('#btn-add-problem').click();
  await page.locator('.problem-name').first().fill('保存竞争测试题');
  return { release, saving: () => saving, deletedDate: () => deletedDate, writes };
}

test('SAVE-01: a pending save cannot change the new date delete button', async ({ page }) => {
  const state = await delayedSave(page);
  await page.locator('#btn-save').click();
  await expect.poll(state.saving).toBe(true);
  await page.locator('#submit-date').fill(SECOND);
  await page.locator('#submit-date').dispatchEvent('change');
  await expect(page.locator('#submit-date')).toHaveValue(SECOND);
  await expect(page.locator('.problem-name').first()).toHaveValue('');
  const finished = page.waitForResponse(response => response.request().method() === 'PUT');
  state.release();
  await finished;
  await expect(page.locator('#btn-save')).toBeEnabled();
  await expect(page.locator('#submit-date')).toHaveValue(SECOND);
  await expect(page.locator('#btn-delete')).toBeHidden();
  expect(state.deletedDate()).toBeUndefined();
  await expect(page.locator('.problem-name').first()).toHaveValue('');
  await page.locator('.problem-name').first().fill('新日期的新题');
  await page.locator('#btn-save').click();
  await expect.poll(() => state.writes.length).toBe(2);
  expect(state.writes[1].date).toBe(SECOND);
  expect(JSON.parse(state.writes[1].body).expectedVersion).toBeNull();
});

test('SAVE-01 deletion completion cannot reset another date or its draft', async ({ page }) => {
  let deleted;
  await page.route(`${WORKER}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/session') return route.fulfill({ json: { login: 'only-matthew', member: '廖夏', csrfToken: 'test' } });
    if (request.method() === 'DELETE') { deleted = route; return; }
    return route.fulfill({ json: { revision: url.searchParams.get('date') === FIRST ? 'sha256:first' : null, problems: url.searchParams.get('date') === FIRST ? [{ id: 'old', name: '旧日记录', platform: '洛谷', tags: [] }] : [] } });
  });
  page.on('dialog', dialog => dialog.accept());
  await page.goto(`/submit/?date=${FIRST}`);
  await page.locator('#btn-delete').click();
  await expect.poll(() => Boolean(deleted)).toBe(true);
  expect(new URL(deleted.request().url()).searchParams.get('date')).toBe(FIRST);
  await page.locator('#submit-date').fill(SECOND);
  await page.locator('#submit-date').dispatchEvent('change');
  await expect(page.locator('#btn-save')).toBeEnabled();
  await page.locator('.problem-name').first().fill('应保留的新草稿');
  await deleted.fulfill({ json: { ok: true } });
  await page.waitForTimeout(100);
  await expect(page.locator('.problem-name').first()).toHaveValue('应保留的新草稿');
  await expect(page.locator('#btn-delete')).toBeHidden();
});

test('SAVE-02 removal selected during uploading remains pending after completion', async ({ page }) => {
  const state = await delayedSave(page, true);
  await page.locator('.statement-file').first().setInputFiles({ name: 'first.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nfirst\n%%EOF') });
  await expect(page.locator('#problem-list')).toContainText('待保存：first.pdf');
  await page.locator('#btn-save').click();
  await expect.poll(state.saving).toBe(true);
  await page.locator('.btn-drop-statement').first().click();
  state.release();
  await expect(page.locator('#btn-save')).toBeEnabled();
  await expect(page.locator('#problem-list')).toContainText('已标记移除');
  await page.locator('#btn-save').click();
  await expect.poll(() => state.writes.length).toBe(2);
  expect(state.writes[1].body).toContain('"action":"remove"');
});

test('SAVE-02: a PDF selected during saving survives the older save completion and reload', async ({ page }) => {
  const state = await delayedSave(page, true);
  const pdf = name => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n' + name + '\n%%EOF') });
  await page.locator('.statement-file').first().setInputFiles(pdf('first.pdf'));
  await page.locator('#btn-save').click();
  await expect.poll(state.saving).toBe(true);
  await page.locator('.statement-file').first().setInputFiles(pdf('second.pdf'));
  await expect(page.locator('#problem-list')).toContainText('second.pdf');
  state.release();
  await expect(page.locator('#btn-save')).toBeEnabled();
  await expect(page.locator('#problem-list')).toContainText('待保存：second.pdf');
  await page.reload();
  await expect(page.locator('#problem-list')).toContainText('待保存：second.pdf');
});

test('SAVE-03: a delayed analysis-range load cannot replace the newer range', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let requested = false;
  await page.route(`${WORKER}/api/session`, route => route.fulfill({ json: null }));
  await page.route('**/data/logs/2026-07.json?*', async route => {
    const response = await route.fetch();
    requested = true;
    await pending;
    return route.fulfill({ response });
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.journalRouteRenderer === 'function');
  await page.evaluate(() => {
    document.getElementById('analysis-start').value = '2026-07-01';
    document.getElementById('analysis-end').value = '2026-07-31';
    history.pushState(null, '', '/analysis/'); dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(() => {
    document.getElementById('analysis-start').value = '2026-08-01';
    document.getElementById('analysis-end').value = '2026-08-31';
    document.getElementById('analysis-end').dispatchEvent(new Event('change'));
  });
  await expect(page.locator('#analysis-records .record').first()).toBeVisible();
  await expect(page.locator('#analysis-summary')).toContainText('2026-08-01 至 2026-08-31');
  const response = page.waitForResponse('**/data/logs/2026-07.json?*');
  release();
  await response;
  await page.waitForTimeout(100);
  await expect(page.locator('#analysis-summary')).toContainText('2026-08-01 至 2026-08-31');
  await expect(page.locator('#analysis-records .record').first()).toBeVisible();
});

test('SAVE-04: form review plans replace older quick-action overrides', async ({ page }) => {
  const id = '9e3a2136-27ab-4e4e-b9c1-338068bbff1b';
  let saved;
  await page.addInitScript(({ id, date }) => {
    if (sessionStorage.getItem('audit-seeded')) return;
    sessionStorage.setItem('audit-seeded', 'yes');
    sessionStorage.setItem(`journal-review-override:廖夏:${date}:${id}`, JSON.stringify({ reviewStatus: 'archived', reviewDue: null }));
  }, { id, date: FIRST });
  await page.route(`${WORKER}/**`, route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: { login: 'only-matthew', member: '廖夏', csrfToken: 'test' } });
    if (request.method() === 'GET') return route.fulfill({ json: { revision: 'sha256:old', problems: [{ id, name: '重新安排测试题', platform: '洛谷', difficultyRating: 800, tags: [], reviewStatus: 'archived' }] } });
    saved = request.postDataJSON();
    return route.fulfill({ json: { revision: 'sha256:new' } });
  });
  await page.route('**/data/review.json?*', route => route.fulfill({ json: { logs: saved.problems.map(problem => ({ ...problem, member: '廖夏', date: FIRST, problemId: problem.id, problem: problem.name, difficulty: '★ 800' })) } }));
  await page.goto(`/submit/?date=${FIRST}`);
  const row = page.locator('.problem-block').first();
  await row.locator('.review-settings > summary').click();
  await row.locator('.problem-review-status').selectOption('todo');
  await row.locator('.problem-review-due').fill('2026-12-20');
  await page.locator('#btn-save').click();
  await expect.poll(() => saved?.problems?.[0]?.reviewStatus).toBe('todo');
  await expect(page.locator('#btn-save')).toBeEnabled();
  // 同一标签页保留缓存；addInitScript 在导航时不重复写入，排除人为重新注入。
  await page.goto('/review/');
  await expect(page.locator('#review-todo-count')).toHaveText('1');
  await page.locator('[data-review-status="all"]').click();
  await expect(page.locator('#review-records')).toContainText('重新安排测试题');
  await expect(page.locator('#review-todo-count')).toHaveText('1');
  await expect(page.locator('#review-records .due-status')).not.toHaveText('已结束安排');
});
