import { isDateString } from './log-schema.mjs';

export const MAX_TRAINING_DAYS = 120;

export function validateTrainingInterval({ recordDate, startedOn, solvedOn, today } = {}) {
  const date = String(recordDate || '');
  const start = String(startedOn || date);
  const end = String(solvedOn || date);
  const current = String(today || date);
  if (!isDateString(date) || !isDateString(start) || !isDateString(end) || !isDateString(current)) throw new TypeError('训练日期必须是 YYYY-MM-DD');
  if (start > end) throw new RangeError('训练开始日期不能晚于结束日期');
  if (end > current) throw new RangeError('训练日期不能晚于今天');
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  if (days > MAX_TRAINING_DAYS) throw new RangeError(`单次连续训练最多 ${MAX_TRAINING_DAYS} 天`);
  return { startedOn: start, solvedOn: solvedOn ? end : undefined, days };
}

export function expandTrainingInterval(interval, fallbackDate) {
  const recordDate = interval?.recordDate || fallbackDate;
  const endDate = interval?.solvedOn || recordDate;
  const normalized = validateTrainingInterval({ ...interval, recordDate, today: interval?.today || endDate });
  const dates = [];
  for (let time = Date.parse(`${normalized.startedOn}T00:00:00Z`); time <= Date.parse(`${normalized.solvedOn || recordDate}T00:00:00Z`); time += 86400000) dates.push(new Date(time).toISOString().slice(0, 10));
  return dates;
}

export function mergeTrainingDates(records) {
  const dates = new Set();
  for (const record of records || []) for (const date of expandTrainingInterval(record, record?.date)) dates.add(date);
  return [...dates].sort();
}
