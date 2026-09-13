import test from 'node:test';
import assert from 'node:assert/strict';
import { expandTrainingInterval, mergeTrainingDates, validateTrainingInterval } from '../lib/training-interval.mjs';

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
