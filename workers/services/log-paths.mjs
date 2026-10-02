// 同一天日志在仓库里的路径约定与 Git blob 工具。
//
// 这是**叶子模块**：不 import 任何本地模块，因此 `logs-v2.mjs`（v2 整天写入）与
// `log-planning.mjs`（旧接口写入）可以共用它而不会形成循环依赖。这两条路径过去各自
// 复制了一份 `gitBlobSha` 与日志根目录布局，任一边修正都不会同步到另一边。
//
// 背景见 docs/Audit/AUDIT-2026-10-02.md §3.2。

const encoder = new TextEncoder();

/** Compute the Git blob SHA-1 for text or raw bytes. */
export async function gitBlobSha(content) {
  const bytes = typeof content === "string" ? encoder.encode(content) : content;
  const header = encoder.encode(`blob ${bytes.length}\0`);
  const combined = new Uint8Array(header.length + bytes.length);
  combined.set(header);
  combined.set(bytes, header.length);
  const digest = await crypto.subtle.digest("SHA-1", combined);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * 一天日志可能存在的两种目录布局：新的 `logs/<成员>/YYYY/MM/DD` 与旧的
 * `logs/<成员>/YYYY-MM-DD`。读取时按顺序探测，写入时用第一个。
 */
export function logRoots(member, date) {
  const [year, month, day] = date.split("-");
  return [`logs/${member}/${year}/${month}/${day}`, `logs/${member}/${date}`];
}

/**
 * 按「第一个空闲槽位」给题目分配 fileIndex。
 *
 * 文件名（`<fileIndex>-takeaway.md` 等）依赖这个槽位，两条写路径必须给出完全一致的
 * 结果，否则同一天会因为槽位算法不同而反复改名、产生无意义的 diff。传进来的题目应已
 * 通过 `validateLogInput`，因此 fileIndex 只可能是 undefined 或 0..9999。
 */
export function assignFileIndexes(problems) {
  const used = new Set(problems.filter((problem) => Number.isInteger(problem.fileIndex) && problem.fileIndex >= 0).map((problem) => problem.fileIndex));
  let next = 0;
  for (const problem of problems) {
    if (Number.isInteger(problem.fileIndex) && problem.fileIndex >= 0) continue;
    while (used.has(next)) next += 1;
    problem.fileIndex = next;
    used.add(next);
    next += 1;
  }
  return problems;
}
