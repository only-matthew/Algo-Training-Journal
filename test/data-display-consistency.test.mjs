import assert from 'node:assert/strict';
import test from 'node:test';
import { applyReviewChanges, rememberReviewChange } from '../lib/review-overrides.mjs';

test('nested summaries apply successful review changes consistently', (context) => {
  const entries = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => entries.get(key) || null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key),
  }});
  context.after(() => original ? Object.defineProperty(globalThis, 'sessionStorage', original) : delete globalThis.sessionStorage);
  const record = { member: '甲', date: '2026-10-04', problemId: 'one', reviewStatus: 'todo', reviewDue: '2026-10-07' };
  rememberReviewChange(record, { reviewStatus: 'archived' });
  assert.equal(applyReviewChanges({ logs: [record] }).logs[0].reviewStatus, 'archived');
  assert.equal(applyReviewChanges({ records: [record] }).records[0].reviewStatus, 'archived');
  assert.equal(applyReviewChanges({ related: [record] }).related[0].reviewStatus, 'archived');
  assert.equal(applyReviewChanges({ node: { relatedRecords: [record] } }).node.relatedRecords[0].reviewStatus, 'archived');
  assert.equal(applyReviewChanges({ problems: [{ doneBy: [record] }] }).problems[0].doneBy[0].reviewStatus, 'archived');
});

test('refreshing the overview invalidates full journals and member shards', async (context) => {
  const original = globalThis.document;
  globalThis.document = { querySelector: () => null };
  context.after(() => { globalThis.document = original; });
  let version = 'old';
  context.mock.method(globalThis, 'fetch', async input => {
    if (String(input).startsWith('data/manifest.json')) return Response.json({ months: [{ url: 'data/month.json' }], members: { '甲': { years: [{ url: 'data/member.json' }] } } });
    return Response.json({ logs: [{ member: '甲', date: '2026-10-07', problemId: version }] });
  });
  const data = await import('../lib/data.mjs?audit-refresh');
  await data.ensureFullJournal();
  await data.ensureMemberJournal('甲');
  version = 'new';
  assert.equal((await data.ensureOverviewJournal(true)).logs[0].problemId, 'new');
  assert.equal((await data.ensureFullJournal()).logs[0].problemId, 'new');
  assert.equal((await data.ensureMemberJournal('甲')).logs[0].problemId, 'new');
});

test('a delayed response from before refresh cannot replace the refreshed cache', async (context) => {
  const original = globalThis.document;
  globalThis.document = { querySelector: () => null };
  context.after(() => { globalThis.document = original; });
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let downloads = 0;
  context.mock.method(globalThis, 'fetch', async () => {
    if (++downloads === 1) return pending;
    return Response.json({ logs: [{ problemId: 'new' }] });
  });
  const data = await import('../lib/data.mjs?refresh-race');
  const old = data.ensureOverviewJournal();
  const fresh = await data.ensureOverviewJournal(true);
  assert.equal(fresh.logs[0].problemId, 'new');
  release(Response.json({ logs: [{ problemId: 'old' }] }));
  assert.equal((await old).logs[0].problemId, 'new');
  assert.equal((await data.ensureOverviewJournal()).logs[0].problemId, 'new');
  assert.equal(downloads, 2);
});

