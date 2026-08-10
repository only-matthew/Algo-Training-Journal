export const PLATFORMS = {
  LUOGU: "洛谷",
  CODEFORCES: "Codeforces",
  ATCODER: "AtCoder",
  OTHER: "其他",
};

export const REVIEW_STATUSES = {
  NONE: "none",
  TODO: "todo",
  MASTERED: "mastered",
};

export const REVIEW_LABELS = {
  none: "",
  todo: "待复习",
  mastered: "已掌握",
};

export const DIFFICULTY_DEFAULT = "未标注";
export const PLATFORM_DEFAULT = "未填写";

export const SITE_ORIGIN = "https://train.xialiao.org";
export const SITE_NAME = "ICPC 算法训练日志";

export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
