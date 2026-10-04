import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrainingHeatmap } from '../lib/training-heatmap.mjs';
import { buildVitality } from '../lib/vitality-summary.mjs';
import { buildCheckinMessage } from '../lib/qq-message.mjs';

const record = (extra = {}) => ({ member: '甲', date: '2026-10-04', problemId: 'a', platform: '洛谷', problemNumber: 'P1013', difficultyRating: 1500, outcome: 'independent', ...extra });

test('补录进入记录日训练统计、活力分摊和机器人打卡；过去区间不冒充打卡', () => {
  const logs = [record({ startedOn: '2026-10-01', solvedOn: '2026-10-03' }), record({ member: '乙', problemNumber: 'P1019' })];
  const vitality = buildVitality(logs);
  const heatmap = buildTrainingHeatmap(logs, vitality, '2026-10-04');
  assert.equal(heatmap.all['2026-10-04'], 2);
  const scope = vitality.byMember.甲;
  assert.deepEqual(scope.daily.map(day => day.date), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.equal(Math.round(scope.daily.reduce((sum, day) => sum + day.value, 0) * 1000), Math.round(scope.total * 1000));
  for (const day of vitality.allDaily) assert.equal(heatmap.valueAll[day.date], day.value);
  for (const day of scope.daily) assert.equal(heatmap.valueByMember.甲[day.date], day.value);
  const overview = { members: ['甲', '乙', '丙'], heatmap };
  const message = buildCheckinMessage(overview, '2026-10-04');
  assert.match(message, /✅ 甲：1 题/);
  assert.match(message, /✅ 乙：1 题/);
  assert.match(message, /❌ 今日未打卡：丙$/);
  assert.doesNotMatch(buildCheckinMessage(overview, '2026-10-02'), /✅ 甲/);
});

test('旧站点数据优先按近期日志判断打卡，并兼容更早格式', () => {
  const heatmap = { byMember: { 甲: { '2026-10-02': 1 } } };
  const overview = { members: ['甲'], logs: [record()], heatmap };
  assert.match(buildCheckinMessage(overview, '2026-10-04'), /✅ 甲：1 题/);
  assert.doesNotMatch(buildCheckinMessage(overview, '2026-10-02'), /✅ 甲/);
  assert.match(buildCheckinMessage({ members: ['甲'], heatmap }, '2026-10-02'), /✅ 甲：1 题/);
});

test('分摊舍入和无效未来区间在热力图、曲线保持一致且总分守恒', () => {
  for (const solvedOn of ['2026-10-03', '2026-10-09']) {
    const logs = [record({ difficultyRating: 1300, startedOn: '2026-10-01', solvedOn })];
    const vitality = buildVitality(logs, { today: '2026-10-04' });
    const heatmap = buildTrainingHeatmap(logs, vitality, '2026-10-04', null);
    assert.deepEqual(Object.keys(heatmap.all).sort(), vitality.allDaily.map(day => day.date));
    assert.deepEqual(heatmap.valueAll, Object.fromEntries(vitality.allDaily.map(day => [day.date, day.value])));
    assert.equal(Math.round(Object.values(heatmap.valueAll).reduce((sum, value) => sum + value, 0) * 1000), Math.round(vitality.total * 1000));
  }
});
