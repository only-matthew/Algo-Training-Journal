import { trainingDatesOf } from './training-interval.mjs';

// 训练日题数、记录日打卡、活力分摊各有用途。活力直接使用曲线的同一份结果，
// 避免再次除以天数并逐项舍入造成热力图与曲线不一致。
export function buildTrainingHeatmap(logs, vitality, today, onDegrade = console.warn) {
  const all = {}, byMember = {}, recordByMember = {}, valueAll = {}, valueByMember = {};
  for (const log of logs) {
    recordByMember[log.member] ??= {};
    recordByMember[log.member][log.date] = (recordByMember[log.member][log.date] || 0) + 1;
    const dates = trainingDatesOf(log, {
      today,
      onDegrade: (error) => onDegrade?.(`[training-interval] ${log.member}/${log.date}/${log.problemId || log.problemIndex}: ${error.message}; using record date only`),
    });
    byMember[log.member] ??= {};
    for (const date of dates) {
      all[date] = (all[date] || 0) + 1;
      byMember[log.member][date] = (byMember[log.member][date] || 0) + 1;
    }
  }
  for (const [member, scope] of Object.entries(vitality.byMember)) {
    valueByMember[member] = Object.fromEntries(scope.daily.map(day => [day.date, day.value]));
  }
  for (const day of vitality.allDaily) valueAll[day.date] = day.value;
  return { all, byMember, recordByMember, valueAll, valueByMember };
}
