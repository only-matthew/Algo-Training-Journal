// 复习快捷操作的纯函数助手（无 DOM、无副作用），供 lib/form.mjs 与 lib/renderer.mjs 共用。
// 独立成小模块：renderer 需要这些函数但不能静态引入 form.mjs（约 50KB 按需加载模块）。
import { toDateString } from "./constants.mjs";

// 不可变更新：把 problems 中 String(p.id) === String(problemId) 的一项替换为 { ...p, ...patch }。
// 未命中时返回原数组引用（调用方可借此判断是否真的改到了题）。
export function patchProblemReview(problems, problemId, patch) {
  const index = (problems || []).findIndex((p) => String(p && p.id) === String(problemId));
  if (index === -1) return problems;
  const next = problems.slice();
  next[index] = { ...next[index], ...patch };
  return next;
}

// 返回 UTC+8 今天加 days 天的 YYYY-MM-DD；now 仅测试注入用。
export function dueDateInDays(days, now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}
