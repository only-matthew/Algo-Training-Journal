export function estimatedSessionKey(record) {
  return `${record.member}|${record.startedOn || record.date}|${record.solvedOn || record.date}`;
}

export function countEstimatedSessions(records) {
  return new Set(records.map(estimatedSessionKey)).size;
}

export function countMemberRecordDays(records) {
  return new Set(records.map((record) => `${record.member}|${record.date}`)).size;
}
