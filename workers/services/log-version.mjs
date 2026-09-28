import { revisionFromEntries } from "./logs-v2.mjs";

// 条件写入：客户端必须回传读取时拿到的 revision。缺少版本一律 428 并提示刷新，
// 不允许存在「无版本 PUT」旁路，否则并发编辑会静默覆盖。
// 版本只覆盖该日期目录自身的文件（不把 legacy 索引算进去），与 logs-v2 的日期版本同口径。
function parseExpectedVersion(value) {
  if (value === undefined) {
    throw Object.assign(new Error("保存前需要先读取该日期的版本；请刷新页面后重试"), { code: "PRECONDITION_REQUIRED", status: 428 });
  }
  if (value !== null && (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value))) {
    throw Object.assign(new TypeError("版本格式无效，请刷新页面后重试"), { code: "VALIDATION_FAILED", status: 422 });
  }
  return value;
}

/** 请求体 expectedVersion 优先，其次 If-Match；都没有则 undefined（由 parseExpectedVersion 拒绝）。 */
export function expectedVersionFrom(request, body) {
  if (body && typeof body === "object" && Object.hasOwn(body, "expectedVersion")) return parseExpectedVersion(body.expectedVersion);
  const header = request.headers.get("If-Match");
  if (header) {
    const quoted = /^"(sha256:[a-f0-9]{64})"$/i.exec(header);
    if (!quoted) return parseExpectedVersion(undefined);
    return parseExpectedVersion(quoted[1]);
  }
  return parseExpectedVersion(undefined);
}

/**
 * Gate for every conditional write.
 *
 * Order matters: the version format is validated first (so a malformed client
 * revision can never be coerced into a legitimate one), then the planned
 * changes are confined to the resolved date directory, and only then is the
 * revision compared. Running the boundary guard before the comparison keeps it
 * unconditional — a plan that escapes the date directory is refused even when
 * the caller also got the version wrong.
 *
 * Exported for direct unit testing of the boundary guard.
 */
export async function assertLogVersionPlan({ expectedVersion, files, changes, root, allowedOutside = [] }) {
  expectedVersion = parseExpectedVersion(expectedVersion);
  // 计划中的变更必须只发生在本日期目录内。越界写入是逻辑错误，不能提交。
  // 派生变更以函数形式给出（提交时才求值），其路径由调用方写进 allowedOutside。
  const outside = (changes || [])
    .map((change) => (typeof change === "function" ? null : change.path))
    .filter((path) => path && !path.startsWith(`${root}/`) && !allowedOutside.includes(path));
  if (outside.length) {
    throw Object.assign(new Error(`保存计划包含该日期目录以外的文件：${outside[0]}`), { code: "INTERNAL_ERROR", status: 500 });
  }
  const current = files && files.length ? await revisionFromEntries(files) : null;
  if (expectedVersion === null) {
    if (current === null) return null;
    throw Object.assign(new Error("该日期已有记录，请刷新后重试"), { code: "VERSION_CONFLICT", status: 409, currentRevision: current });
  }
  if (current === null || expectedVersion !== current) {
    throw Object.assign(new Error("记录已被其他端修改，请刷新后重试"), { code: "VERSION_CONFLICT", status: 409, currentRevision: current });
  }
  return current;
}
