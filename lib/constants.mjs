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
