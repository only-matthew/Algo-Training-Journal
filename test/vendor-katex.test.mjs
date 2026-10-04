import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve('katex'));
const vendor = new URL('../vendor/katex/', import.meta.url);
const katex = require('../vendor/katex/katex.min.js');

test('vendored KaTeX matches the audited dependency, including auto-render and every font', () => {
  assert.equal(katex.version, require('katex').version);
  for (const [local, upstream] of [['katex.min.js', 'katex.min.js'], ['katex.min.css', 'katex.min.css'], ['auto-render.min.js', 'contrib/auto-render.min.js'], ['LICENSE', '../LICENSE']]) {
    assert.equal(fs.readFileSync(new URL(local, vendor), 'utf8').replaceAll('\r\n', '\n'), fs.readFileSync(path.join(dist, upstream), 'utf8').replaceAll('\r\n', '\n'), local);
  }
  const css = fs.readFileSync(new URL('katex.min.css', vendor), 'utf8');
  for (const [, font] of css.matchAll(/url\((fonts\/[^)]+)\)/g)) {
    assert.deepEqual(fs.readFileSync(new URL(font, vendor)), fs.readFileSync(path.join(dist, font)), font);
  }
});

test('vendored KaTeX renders common notation with untrusted links disabled', () => {
  for (const math of [String.raw`\frac{a+b}{2}`, String.raw`\sum_{i=1}^{n} i^2`, String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`]) {
    assert.match(katex.renderToString(math, { trust: false }), /class="katex"/);
  }
  assert.doesNotMatch(katex.renderToString(String.raw`\href{javascript:alert(1)}{x}`, { trust: false, throwOnError: false }), /href="javascript:/);
});

test('recursive Unicode macros obey maxExpand without hanging the renderer', () => {
  const result = spawnSync(process.execPath, ['-e', String.raw`
    const katex = require('./vendor/katex/katex.min.js');
    try { katex.renderToString('\\def\\foo{\\foo⁰}\\foo', { maxExpand: 20 }); process.exit(2); }
    catch (error) { if (!/Too many expansions/.test(error.message)) process.exit(3); }
  `], { cwd: new URL('..', import.meta.url), timeout: 3000, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
