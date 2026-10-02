// 日期字符串工具的唯一来源：全仓库所有「YYYY-MM-DD」的校验与加减都从这里引入，
// 不要再各写一份（审计 §4.1「isDateString 5 份实现」）。
//
// 口径：date-only 字符串一律按 UTC 日历理解，运算只用 UTC API（setUTCDate/getUTCDate）。
// 禁止用本地 setDate/getDate —— 那会让非 UTC+8 环境在日界附近整体差一天（审计 §3.1）。

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 严格的 YYYY-MM-DD 校验：正则 + UTC 回读，后者剔除 2026-02-30 这类「格式对但日期假」的值。
 * 与 lib/log-schema.mjs 的实现同口径；非字符串（包括能被正则隐式转成字符串的单元素数组）
 * 一律返回 false。
 */
export function isDateString(value) {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

/**
 * 日期加减，纯 UTC 日历运算（跨月、跨年、闰年都正确）。
 * 非法日期、非法天数返回空串——调用方（表单/建议/构建）已有「空串即无值」的处理约定。
 */
export function addDaysToDate(dateString, days) {
  if (!isDateString(dateString)) return "";
  const offset = Number(days);
  if (!Number.isFinite(offset)) return "";
  const value = new Date(`${dateString}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
