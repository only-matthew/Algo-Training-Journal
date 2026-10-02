export const PLATFORMS = {
  LUOGU: "洛谷",
  CODEFORCES: "Codeforces",
  ATCODER: "AtCoder",
  OTHER: "其他",
};

export const REVIEW_STATUSES = {
  NONE: "none",
  TODO: "todo",
  DEFERRED: "deferred",
  ARCHIVED: "archived",
};

export const REVIEW_LABELS = {
  none: "未安排复习",
  todo: "待复习",
  deferred: "超纲待做",
  archived: "已结束复习安排",
};

export const DIFFICULTY_DEFAULT = "未标注";
export const PLATFORM_DEFAULT = "未填写";

export const SITE_ORIGIN = "https://train.xialiao.org";
export const SITE_NAME = "ICPC 算法训练日志";

// 本地时区格式化：本地时区语义，不得用于判断今天 —— 只用于把「已经在本地日历里的
// Date」显示成串（例如日期选择器的默认值）。业务代码里判断「今天 / 基准日 / 是否到期」
// 一律用 todayUtc8：本地时区口径与后端（UTC+8）不一致，会在北京时间 00:00–08:00
// 之间差一天（见 docs/Audit §3.1）。
export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 唯一的「今天」口径：返回该时刻所属的 UTC+8 日历日（YYYY-MM-DD）。
// boundaryHour 把「一天」的起点从 UTC+8 的 00:00 后移，例如 4 表示日界在 04:00
// （凌晨 0–4 点仍算前一天，与 QQ 播报的历史口径一致）。无法解析的时间返回空串。
export function todayUtc8(now = new Date(), boundaryHour = 0) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.valueOf())) return "";
  const offsetHours = 8 - Number(boundaryHour || 0);
  return new Date(date.getTime() + offsetHours * 3600 * 1000).toISOString().slice(0, 10);
}

// 将任意时间戳规范化为 UTC+8（东八区）的 ISO 字符串，如 2026-08-11T01:09:44.000+08:00
export function toUtc8(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";
  const cn = new Date(date.getTime() + 8 * 3600 * 1000);
  return cn.toISOString().replace("Z", "+08:00");
}

// 将 ISO 时间戳格式化为「2026.8.10」形式（始终按 UTC+8 时区的日期显示）
export function formatUpdateDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";
  const cn = new Date(date.getTime() + 8 * 3600 * 1000);
  return `${cn.getUTCFullYear()}.${cn.getUTCMonth() + 1}.${cn.getUTCDate()}`;
}

// 将 ISO 时间戳格式化为「2026.8.10 14:30」形式（始终按 UTC+8 时区的日期 + 时间显示）
export function formatUpdateTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";
  const cn = new Date(date.getTime() + 8 * 3600 * 1000);
  const hh = String(cn.getUTCHours()).padStart(2, "0");
  const mm = String(cn.getUTCMinutes()).padStart(2, "0");
  return `${formatUpdateDate(iso)} ${hh}:${mm}`;
}
