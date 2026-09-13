import test from 'node:test';
import assert from 'node:assert/strict';
import { vitalityChartHtml } from '../lib/vitality-chart.mjs';

test('daily and cumulative charts each use the selected metric scale', () => {
  const data = [{ date: '2026-09-01', value: 1, cumulative: 10 }, { date: '2026-09-02', value: 2, cumulative: 12 }];
  const daily = vitalityChartHtml(data);
  const cumulative = vitalityChartHtml(data, { metric: 'cumulative' });
  assert.match(daily, /每日活力，2026/);
  assert.match(cumulative, /累计活力，2026/);
  assert.notEqual(daily.match(/class="vitality-line" d="([^"]+)/)[1], cumulative.match(/class="vitality-line" d="([^"]+)/)[1]);
  assert.match(daily, /12.0<\/strong>/);
});

test('calendar gaps have proportional spacing, with no overlapping terminal labels', () => {
  const html = vitalityChartHtml(['01', '02', '11'].map(day => ({ date: `2026-09-${day}`, value: 1, cumulative: 2 })));
  const xs = [...html.matchAll(/class="vitality-point" cx="([^"]+)/g)].map(match => Number(match[1]));
  assert.ok(Math.abs((xs[1] - xs[0]) / (xs[2] - xs[0]) - 0.1) < 1e-6);
  assert.equal((html.match(/class="trend-date-label"/g) || []).length, 2);
});

test('empty, singleton and nonfinite values never emit invalid SVG coordinates', () => {
  assert.match(vitalityChartHtml([]), /还没有足够的数据/);
  for (const value of [0, NaN, Infinity, -1]) {
    const html = vitalityChartHtml([{ date: '2026-09-01', value, cumulative: value }]);
    assert.doesNotMatch(html, /NaN|Infinity/);
    assert.match(html, /cx="511"/);
  }
});
