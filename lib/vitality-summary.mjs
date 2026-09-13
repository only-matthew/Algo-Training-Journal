import { computeVitalityTimeline, vitalityRecordKey, VITALITY_VERSION } from './vitality.mjs';
import { normalizePlatform } from './problem-identity.mjs';

const rounded = value => Number(value.toFixed(3));

/** 所有平台共享同一计算路径；计分原因保留给卡片、平台明细和构建审计。 */
export function buildVitality(logs) {
  const perLog = new Map(), byRecord = new Map(), byMember = {};
  for (const [member, records] of Map.groupBy(logs, log => log.member)) {
    const timeline = computeVitalityTimeline(records);
    const byDate = new Map(), platforms = new Map(), subjects = new Set();
    const byTier = { high: 0, mid: 0, low: 0 };
    let total = 0, ratedRecords = 0, unknownRecords = 0, unlinkedRecords = 0;
    for (const entry of timeline) {
      const value = rounded(entry.vitality);
      const key = vitalityRecordKey(entry);
      perLog.set(key, value);
      byRecord.set(key, { vitality: value, vitalityStatus: entry.vitalityStatus, vitalityOutcome: entry.outcome });
      total += value;
      const day = byDate.get(entry.date) ?? { value: 0, maxRating: 0 };
      day.value += value;
      day.maxRating = Math.max(day.maxRating, entry.rating);
      byDate.set(entry.date, day);
      const platform = normalizePlatform(entry.platform) || '其他';
      const stats = platforms.get(platform) ?? { platform, records: 0, rated: 0, counted: 0, duplicates: 0, value: 0 };
      stats.records++;
      stats.rated += Number(entry.rating > 0);
      stats.counted += Number(['counted', 'completed_delta'].includes(entry.vitalityStatus));
      stats.duplicates += Number(['duplicate', 'review'].includes(entry.vitalityStatus));
      stats.value += value;
      platforms.set(platform, stats);
      ratedRecords += Number(entry.rating > 0);
      unknownRecords += Number(entry.outcome === 'unknown');
      unlinkedRecords += Number(entry.subjectKey?.startsWith('record:'));
      if (entry.vitalityStatus === 'counted') subjects.add(entry.subjectKey);
      byTier[entry.rating >= 1500 ? 'high' : entry.rating >= 1000 ? 'mid' : 'low'] += value;
    }
    let cumulative = 0;
    const daily = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) => {
      cumulative += day.value;
      return { date, value: rounded(day.value), cumulative: rounded(cumulative), maxRating: day.maxRating };
    });
    byMember[member] = {
      algorithmVersion: VITALITY_VERSION, total: rounded(total), problems: subjects.size,
      records: records.length, ratedRecords, unknownRecords, unlinkedRecords, daily,
      byPlatform: [...platforms.values()].sort((a, b) => a.platform.localeCompare(b.platform, 'zh-CN')).map(stats => ({ ...stats, value: rounded(stats.value) })),
      byTier: Object.fromEntries(Object.entries(byTier).map(([tier, value]) => [tier, rounded(value)])),
    };
  }
  const allDays = new Map();
  for (const scope of Object.values(byMember)) for (const day of scope.daily) allDays.set(day.date, (allDays.get(day.date) || 0) + day.value);
  let cumulative = 0;
  const allDaily = [...allDays].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => {
    cumulative += value;
    return { date, value: rounded(value), cumulative: rounded(cumulative) };
  });
  return { perLog, byRecord, byMember, allDaily, total: rounded(cumulative), algorithmVersion: VITALITY_VERSION };
}
