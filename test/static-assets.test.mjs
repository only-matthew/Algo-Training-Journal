import test from 'node:test';
import assert from 'node:assert/strict';
import { staticAssetUrl } from '../lib/static-assets.mjs';

test('static asset URLs select the build host, including nested-page and print use', () => {
  assert.equal(staticAssetUrl('vendor/katex/katex.min.js', { querySelector: () => null }), '/vendor/katex/katex.min.js');
  const doc = { querySelector: () => ({ content: 'https://cdn.mirstar.net' }) };
  assert.equal(staticAssetUrl('/vendor/katex/katex.min.css', doc), '/vendor/katex/katex.min.css');
  assert.equal(staticAssetUrl('assets/js/app.js', doc), 'https://cdn.mirstar.net/assets/js/app.js');
});
