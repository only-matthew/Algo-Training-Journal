import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVitality } from '../lib/vitality-summary.mjs';
import { computeVitalityTimeline, OUTCOME_CREDIT } from '../lib/vitality.mjs';
import { memberVitalityDetailsHtml } from '../lib/member-vitality.mjs';

const record = (extra = {}) => ({ member: '甲', date: '2026-09-01', problemId: 'a', platform: '洛谷', problemNumber: 'P1000', difficultyRating: 1300, tags: ['DP'], ...extra });

test('all platforms and rating aliases enter the same scoring path', () => {
  const samples = [
    { platform: 'Codeforces', problemNumber: '123A', rating: 1300 },
    { platform: 'AtCoder', problemNumber: 'abc001_a', difficultyRating: 1300 },
    { platform: '洛谷', problemNumber: 'P1000', difficulty: '普及' },
    { platform: '其他', problemNumber: '', difficultyRating: 1300 },
    { platform: '校内平台', problemNumber: '42', difficulty: '★ 1300' },
  ];
  const scores = samples.map(sample => computeVitalityTimeline([record({ difficultyRating: undefined, ...sample })])[0].vitality);
  assert.ok(scores[0] > 0.1, '新知识点有合理起始值，不再四舍五入成零');
  scores.forEach(score => assert.equal(score, scores[0]));
});

test('same titles and incomplete numbers do not merge; complete identities deduplicate within a member', () => {
  const logs = [
    record(), record({ date: '2026-09-02', problemId: 'b' }),
    record({ member: '乙' }),
    ...['c', 'd'].map(problemId => record({ problemId, platform: '其他', problemNumber: '', problem: '同名题' })),
    ...['e', 'f'].map(problemId => record({ problemId, platform: 'Codeforces', problemNumber: 'B', problem: '同名场次' })),
  ];
  const result = buildVitality(logs);
  assert.equal(result.byMember.甲.problems, 5);
  assert.equal(result.byMember.乙.problems, 1);
  assert.equal(result.byRecord.get('甲|2026-09-02|b').vitalityStatus, 'duplicate');
  assert.equal(result.byMember.甲.daily.length, 2, '只有重复记录的日子仍属于训练日');
});

test('unknown historical results do not imply independence or depend on mastery labels', () => {
  const unknown = computeVitalityTimeline([record()])[0];
  const mastered = computeVitalityTimeline([record({ reviewStatus: 'mastered' })])[0];
  const independent = computeVitalityTimeline([record({ outcome: 'independent' })])[0];
  assert.equal(unknown.outcome, 'unknown');
  assert.equal(mastered.vitality, unknown.vitality);
  assert.ok(Math.abs(unknown.vitality / independent.vitality - OUTCOME_CREDIT.unknown) < 1e-9);
});

test('unfinished work does not raise ability; completion adds only the remaining credit', () => {
  const first = record({ outcome: 'unfinished' });
  const after = record({ date: '2026-09-02', problemId: 'b', outcome: 'independent' });
  const timeline = computeVitalityTimeline([first, after, { ...after, date: '2026-09-03', problemId: 'c' }]);
  const done = computeVitalityTimeline([record({ outcome: 'independent' })])[0].vitality;
  assert.ok(Math.abs(timeline[0].vitality / done - 0.15) < 1e-9);
  assert.ok(Math.abs(timeline.reduce((sum, item) => sum + item.vitality, 0) - done) < 1e-9);
  assert.equal(timeline[1].vitalityStatus, 'completed_delta');
  assert.equal(timeline[2].vitality, 0);
  const fresh = record({ date: '2026-09-02', problemId: 'd', problemNumber: 'P1001' });
  assert.equal(computeVitalityTimeline([first, fresh])[1].theta, computeVitalityTimeline([fresh])[0].theta);
});

test('missing rating does not swallow a later rated record, and reviews cannot mint credit', () => {
  const timeline = computeVitalityTimeline([
    record({ difficultyRating: 0 }),
    record({ date: '2026-09-02', problemId: 'b' }),
    record({ date: '2026-09-03', problemId: 'c', entryKind: 'review' }),
  ]);
  assert.equal(timeline[0].vitalityStatus, 'missing_rating');
  assert.ok(timeline[1].vitality > 0);
  assert.equal(timeline[2].vitality, 0);
});

test('input order, duplicate tags and future additions do not rewrite historical scoring', () => {
  const a = record(), b = record({ problemId: 'b', problemNumber: 'P1001', difficultyRating: 1700 });
  assert.deepEqual(computeVitalityTimeline([a, b]), computeVitalityTimeline([b, a]));
  assert.equal(computeVitalityTimeline([{ ...a, tags: ['DP', 'DP'] }])[0].vitality, computeVitalityTimeline([a])[0].vitality);
  const future = { ...b, date: '2026-09-02', problemId: 'c', problemNumber: 'P1002' };
  assert.deepEqual(computeVitalityTimeline([a, b, future]).slice(0, 2), computeVitalityTimeline([a, b]));
});

test('platform, day, record and member totals agree, with safe explanatory HTML', () => {
  const result = buildVitality([record(), record({ member: '乙', platform: '<img onerror=x>', problemNumber: '' })]);
  const sum = values => Number(values.reduce((a, b) => a + b, 0).toFixed(3));
  assert.equal(sum([...result.perLog.values()]), result.total);
  assert.equal(sum(Object.values(result.byMember).map(item => item.total)), result.total);
  assert.equal(result.allDaily.at(-1).cumulative, result.total);
  const scope = result.byMember.乙;
  assert.equal(sum(scope.byPlatform.map(item => item.value)), scope.total);
  assert.equal(scope.daily.at(-1).cumulative, scope.total);
  assert.match(memberVitalityDetailsHtml(scope), /&lt;img onerror=x&gt;/);
  assert.match(memberVitalityDetailsHtml(scope), /1 条历史记录缺少完成质量/);
  assert.match(memberVitalityDetailsHtml(undefined), /记录带有 Rating/);
});

// 区间记录的活力必须和热力图用同一口径：按覆盖天数等额分摊到每日曲线，
// 并且各日之和精确等于该题额度（否则日曲线累计会与 total 漂移）。
test('区间记录的单题活力按覆盖天数分摊到每日曲线且总额守恒', () => {
  const result = buildVitality([
    record({ date: '2026-09-03', problemId: 'a', startedOn: '2026-09-01', solvedOn: '2026-09-03' }),
    record({ date: '2026-09-05', problemId: 'b', problemNumber: 'P1001' }),
  ]);
  const scope = result.byMember.甲;
  assert.deepEqual(scope.daily.map(day => day.date), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-05']);

  const intervalValue = result.byRecord.get('甲|2026-09-03|a').vitality;
  const spread = scope.daily.filter(day => day.date <= '2026-09-03');
  assert.equal(spread.length, 3);
  assert.equal(Number(spread.reduce((sum, day) => sum + day.value, 0).toFixed(3)), Number(intervalValue.toFixed(3)));
  assert.ok(Math.max(...spread.map(day => day.value)) - Math.min(...spread.map(day => day.value)) <= 0.001, '分摊应尽量均匀');

  // 单日记录仍只占自己那一天，分摊不得改动总额。
  assert.equal(scope.daily.at(-1).date, '2026-09-05');
  assert.equal(scope.daily.at(-1).cumulative, scope.total);
  assert.equal(result.allDaily.at(-1).cumulative, result.total);
});
