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

// 将 ISO 时间戳格式化为「2026.8.10」形式（本地时区的日期）
export function formatUpdateDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
}

// 将 ISO 时间戳格式化为「2026.8.10 14:30」形式（本地时区的日期 + 时间）
export function formatUpdateTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${formatUpdateDate(iso)} ${hh}:${mm}`;
}
