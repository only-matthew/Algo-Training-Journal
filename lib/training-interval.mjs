export const MAX_TRAINING_DAYS = 120;

function isDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

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

/**
 * 展开单条记录覆盖的训练日。
 *
 * 历史数据可能带着越界区间（例如区间校验上线之前写入的记录）。读取与统计都
 * 不允许被这种数据中断，因此越界时降级为「只算记录当天」，与构建期热力图
 * 的降级口径一致；`onDegrade` 让调用方记录一次可诊断的警告。
 */
export function trainingDatesOf(record, { today, onDegrade } = {}) {
  try {
    return expandTrainingInterval(today ? { ...record, today } : record, record?.date);
  } catch (error) {
    if (onDegrade) onDegrade(error);
    return record?.date ? [String(record.date)] : [];
  }
}

/** 训练日 = 记录当天与本人确认区间的并集，重叠天数不重复计。 */
export function mergeTrainingDates(records) {
  const dates = new Set();
  for (const record of records || []) for (const date of trainingDatesOf(record)) dates.add(date);
  return [...dates].sort();
}
