import test from 'node:test';
import assert from 'node:assert/strict';
import { expandTrainingInterval, mergeTrainingDates, trainingDatesOf, validateTrainingInterval } from '../lib/training-interval.mjs';

test('legacy records remain one-day intervals and ranges expand inclusively', () => {
  assert.deepEqual(expandTrainingInterval({ date: '2026-09-05' }, '2026-09-05'), ['2026-09-05']);
  assert.deepEqual(expandTrainingInterval({ recordDate: '2026-09-05', startedOn: '2026-09-01', solvedOn: '2026-09-05' }), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);
  assert.deepEqual(expandTrainingInterval({ recordDate: '2026-09-05', startedOn: '2026-09-01' }), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);
  assert.deepEqual(mergeTrainingDates([{ date: '2026-09-01', startedOn: '2026-09-01', solvedOn: '2026-09-03' }, { date: '2026-09-05', startedOn: '2026-09-03', solvedOn: '2026-09-05' }]), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);
});

test('interval validation rejects reversed, future and oversized ranges', () => {
  assert.throws(() => validateTrainingInterval({ recordDate: '2026-09-05', startedOn: '2026-09-06', today: '2026-09-10' }), /不能晚于结束/);
  assert.throws(() => validateTrainingInterval({ recordDate: '2026-09-05', startedOn: '2026-09-05', solvedOn: '2026-09-06', today: '2026-09-05' }), /不能晚于今天/);
  assert.throws(() => validateTrainingInterval({ recordDate: '2026-09-05', startedOn: '2026-01-01', solvedOn: '2026-09-05', today: '2026-09-05' }), /最多 120 天/);
  assert.equal(validateTrainingInterval({ recordDate: '2026-09-05', startedOn: '2026-06-08', solvedOn: '2026-09-05', today: '2026-09-05' }).days, 90);
});

// 历史数据可能带着区间校验上线之前写入的越界区间。统计与读取都不允许被它中断，
// 因此展开必须降级为「只算记录当天」，并能让调用方拿到可诊断的原因。
test('越界或非法的历史区间降级为记录当天而不是抛出异常', () => {
  const oversized = { date: '2026-09-05', startedOn: '2026-01-01', solvedOn: '2026-09-05' };
  assert.deepEqual(trainingDatesOf(oversized), ['2026-09-05']);
  assert.deepEqual(mergeTrainingDates([oversized, { date: '2026-09-07' }]), ['2026-09-05', '2026-09-07']);

  const reasons = [];
  trainingDatesOf(oversized, { onDegrade: (error) => reasons.push(error.message) });
  assert.match(reasons[0], /最多 120 天/);

  // 传入 today 时未来日期同样降级——构建期就是这样拦下未来区间的。
  assert.deepEqual(
    trainingDatesOf({ date: '2026-09-05', startedOn: '2026-09-05', solvedOn: '2026-09-09' }, { today: '2026-09-05' }),
    ['2026-09-05'],
  );

  // 缺少记录日期时不能凭空造出训练日。
  assert.deepEqual(trainingDatesOf({ startedOn: '2026-01-01', solvedOn: '2026-09-05' }), []);
  assert.deepEqual(mergeTrainingDates([{ startedOn: '2026-01-01', solvedOn: '2026-09-05' }]), []);
});
