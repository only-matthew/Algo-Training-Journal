import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Execute the actual emitted template, without rebuilding or sharing site/ across test processes.
const generator = fs.readFileSync(new URL('../scripts/generate-data.js', import.meta.url), 'utf8');
const template = generator.match(/const sw = `([\s\S]*?)`;\s*fs.writeFileSync/)[1];
const source = template.replace('${JSON.stringify(version)}', '"test-build"')
  .replace('${JSON.stringify(CDN_ORIGIN)}', '"https://cdn.mirstar.net"')
  .replace('${JSON.stringify(reusableAssets)}', '["/assets/js/app-CURRENT.js", "/style.css?v=current"]');

function harness(overrides = {}) {
  const handlers = {};
  const writes = [];
  const deleted = [];
  const caches = {
    open: async () => ({ put: async (...args) => { writes.push(args); }, add: async () => {} }),
    match: async () => undefined,
    keys: async () => ['atj-old', 'atj-test-build', 'another-app'],
    delete: async key => { deleted.push(key); },
    ...overrides.caches,
  };
  vm.runInNewContext(source, {
    URL, Response,
    self: { location: { origin: 'https://journal.test' }, addEventListener: (name, fn) => { handlers[name] = fn; }, clients: { claim: async () => {} } },
    caches,
    fetch: overrides.fetch || (async () => new Response('online')),
  });
  function dispatch(name, request) {
    const pending = [];
    let response;
    handlers[name]({ request, waitUntil: promise => pending.push(promise), respondWith: promise => { response = promise; } });
    return { pending, get response() { return response; } };
  }
  return { dispatch, writes, deleted };
}

test('CDN static assets are cached and available offline, other remote requests are excluded', async () => {
  const url = 'https://cdn.mirstar.net/assets/js/app-CURRENT.js';
  const app = harness();
  const event = app.dispatch('fetch', { url, method: 'GET', mode: 'cors' });
  assert.equal(await (await event.response).text(), 'online');
  await Promise.all(event.pending);
  assert.equal(app.writes.length, 1);
  const offline = harness({ fetch: async () => { throw new Error('offline'); }, caches: { match: async () => new Response('cached script') } });
  assert.equal(await (await offline.dispatch('fetch', { url, method: 'GET', mode: 'cors' }).response).text(), 'cached script');
  for (const remote of ['https://cdn.mirstar.net/data.json', 'https://example.com/assets/js/app.js']) {
    assert.equal(app.dispatch('fetch', { url: remote, method: 'GET', mode: 'cors' }).response, undefined);
  }
});

test('service worker activation only deletes its own obsolete caches', async () => {
  const app = harness();
  await Promise.all(app.dispatch('activate').pending);
  assert.deepEqual(app.deleted, ['atj-old']);
});

test('activation preserves current hashed assets before deleting old caches, without keeping old pages or data', async () => {
  const lookedUp = [];
  const app = harness({ caches: { match: async (url) => {
    lookedUp.push(url);
    return new Response('unchanged asset');
  } } });
  await Promise.all(app.dispatch('activate').pending);
  assert.deepEqual(lookedUp, ['https://journal.test/assets/js/app-CURRENT.js', 'https://journal.test/style.css?v=current']);
  assert.equal(app.writes.length, 2);
  assert.deepEqual(app.deleted, ['atj-old']);
  assert.equal(await app.writes[0][1].text(), 'unchanged asset');
});

test('activation still clears obsolete caches when asset migration storage is unavailable', async () => {
  const app = harness({ caches: { open: async () => { throw new Error('QuotaExceededError'); } } });
  await Promise.all(app.dispatch('activate').pending);
  assert.deepEqual(app.deleted, ['atj-old']);
});

for (const mode of ['navigate', 'cors']) {
  test(`service worker retains ${mode} cache writes for the event lifetime`, async () => {
    const app = harness();
    const event = app.dispatch('fetch', { url: 'https://journal.test/page/', method: 'GET', mode });
    assert.equal(await (await event.response).text(), 'online');
    assert.equal(event.pending.length, 1);
    await Promise.all(event.pending);
    assert.equal(app.writes.length, 1);
  });
}

test('cache quota errors do not break a successful network response', async () => {
  const app = harness({ caches: { open: async () => { throw new Error('QuotaExceededError'); } } });
  const event = app.dispatch('fetch', { url: 'https://journal.test/', method: 'GET', mode: 'navigate' });
  assert.equal(await (await event.response).text(), 'online');
  await Promise.all(event.pending);
});

test('uncached offline navigation returns a readable response instead of undefined', async () => {
  const app = harness({ fetch: async () => { throw new Error('offline'); } });
  const event = app.dispatch('fetch', { url: 'https://journal.test/new/', method: 'GET', mode: 'navigate' });
  const response = await event.response;
  assert.equal(response.status, 503);
  assert.match(await response.text(), /离线/);
});

test('offline navigation prefers the requested cached page', async () => {
  const app = harness({ fetch: async () => { throw new Error('offline'); }, caches: { match: async request => new Response(typeof request === 'string' ? 'home' : 'requested page') } });
  const event = app.dispatch('fetch', { url: 'https://journal.test/page/', method: 'GET', mode: 'navigate' });
  assert.equal(await (await event.response).text(), 'requested page');
});
