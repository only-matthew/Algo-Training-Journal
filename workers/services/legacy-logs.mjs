import { validateLogInput, problemAuditFields } from "../../lib/log-schema.mjs";
import { toUtc8, todayUtc8 } from "../../lib/constants.mjs";
import { trainingPaths } from "./training.mjs";
import { revisionFromEntries } from "./logs-v2.mjs";
import { gitBlobSha, logRoots, planLegacyIndexChange, planLogChanges } from "./log-planning.mjs";
import { assertLogVersionPlan } from "./log-version.mjs";
import { REPO, BRANCH, GH_TIMEOUT_MS, ghHeaders, gh } from "../storage/github-api.mjs";
import { mapConcurrent } from "./map-concurrent.mjs";

/** Submit the date changes and derived index against one checked Git head. */
async function commit(changes, message, token, retry = 0, recheck = null) {
  // 1. Get current branch reference and parent commit
  const ref = await gh(`/git/ref/heads/${BRANCH}`, token);
  const parent = await gh(`/git/commits/${ref.object.sha}`, token);
  const head = ref.object.sha;

  // 1b. 每次尝试都重新校验前置条件并重新求值派生变更：重试必须基于新的 head。
  if (recheck) await recheck(head);
  const resolved = [];
  for (const change of changes) {
    const value = typeof change === "function" ? await change(head) : change;
    if (value) resolved.push(value);
  }
  if (!resolved.length) return { commitSha: null };

  // 2. Create or delete blobs for all changes
  const treeEntries = await mapConcurrent(resolved, 4, async (change) => {
    if (change.delete) {
      return { path: change.path, mode: "100644", type: "blob", sha: null };
    }
    const blob = await gh("/git/blobs", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: change.content, encoding: "utf-8" }),
    });
    return { path: change.path, mode: "100644", type: "blob", sha: blob.sha };
  });

  // 3. Create new tree
  const newTree = await gh("/git/trees", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: treeEntries }),
  });

  // 4. Create commit
  const newCommit = await gh("/git/commits", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, tree: newTree.sha, parents: [head] }),
  });

  // 5. Update branch reference
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/git/refs/heads/${BRANCH}`,
    {
      method: "PATCH",
      headers: { ...ghHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
      signal: AbortSignal.timeout(GH_TIMEOUT_MS),
    }
  );

  // 6. Retry on conflict
  const remaining = parseInt(response.headers.get("X-RateLimit-Remaining"), 10);
  if (!response.ok && (response.status === 403 || response.status === 429) && remaining === 0) {
    console.error("GitHub API rate limit exhausted while updating ref.");
    throw Object.assign(new Error("GitHub API 请求配额已用完，请稍后再试"), { status: 429 });
  }
  if (response.status === 422 && retry < 2) {
    return commit(changes, message, token, retry + 1, recheck);
  }
  if (!response.ok) {
    console.error(`GitHub ref update failed: ${response.status}`);
    throw Object.assign(new Error("GitHub 更新引用失败"), { status: 502 });
  }
  return { commitSha: newCommit.sha };
}
async function content(path, token, ref = BRANCH) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`, { headers: ghHeaders(token), signal: AbortSignal.timeout(GH_TIMEOUT_MS) });
  if (response.status === 404) return null; if (!response.ok) { console.error(`GitHub content fetch failed: ${response.status}`); throw Object.assign(new Error("读取仓库文件失败"), { status: 502 }); }
  return new TextDecoder().decode(Uint8Array.from(atob((await response.json()).content.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
}
// 一次请求列出目录下的所有文件（path + blob sha）；目录不存在返回 null。
// 替代逐文件探测存在性，大幅减少 Contents API 调用次数。
async function listDir(path, token, ref = BRANCH) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`, { headers: ghHeaders(token), signal: AbortSignal.timeout(GH_TIMEOUT_MS) });
  if (response.status === 404) return null;
  if (!response.ok) { console.error(`GitHub contents list failed: ${response.status}`); throw Object.assign(new Error("读取仓库目录失败"), { status: 502 }); }
  const body = await response.json();
  if (!Array.isArray(body)) return null;
  return body.filter((entry) => entry.type === "file").map(({ path: p, sha }) => ({ path: p, sha }));
}
// ref 省略时读当前 main；显式传 commit sha 用于「按将要提交到的那个 head」重读仓库状态。
async function resolveLogRoot(user, date, ref = BRANCH) {
  const [currentRoot, oldRoot] = logRoots(user.member, date);
  const current = await listDir(currentRoot, user.token, ref);
  if (current !== null) return { root: currentRoot, files: current };
  const old = await listDir(oldRoot, user.token, ref);
  if (old !== null) return { root: oldRoot, files: old };
  return { root: currentRoot, files: null };
}
/**
 * The legacy JSON endpoint cannot upload attachment bytes, so it must never be
 * able to introduce or change an attachment/image reference — that would write a
 * record pointing at a PDF or image that does not exist. Re-sending an unchanged
 * reference (what the form does when it round-trips an existing record) is fine.
 */
function assertAttachmentsUnchanged(problems, previous) {
  const incomparable = (problem, old) => {
    const attachmentChanged = problem.statementAttachment && old?.statementAttachment?.sha256 !== problem.statementAttachment.sha256;
    const next = (problem.statementImages || []).map((image) => image.sha256).sort().join(",");
    const before = (old?.statementImages || []).map((image) => image.sha256).sort().join(",");
    return attachmentChanged || (problem.statementImages !== undefined && next !== before);
  };
  for (const problem of problems) {
    if (!problem.statementAttachment && problem.statementImages === undefined) continue;
    if (!incomparable(problem, previous.get(problem.id))) continue;
    throw Object.assign(new Error("题面 PDF 与题面图片必须通过附件上传接口保存，此接口无法写入附件字节"), { code: "ATTACHMENT_REQUIRES_V2", status: 422 });
  }
}

/** 旧接口的写入快照：题面附件/图片的引用只能沿用，缺字段时按「保持不变」处理。 */
async function readLegacyEnrichment(root, files, token) {
  const metaPath = `${root}/meta.json`;
  if (!(files || []).some((file) => file.path === metaPath)) return new Map();
  const raw = await content(metaPath, token);
  // 「文件不存在」与「文件损坏」必须分开（审计 §4.1）：目录列表刚说有这个文件，
  // 读回来是 null 说明它在这中间被删了，可以当成「没有历史记录」继续；
  // 而解析失败是数据损坏——若按空记录继续，会把这一天的 statementImages 静默清空。
  if (raw == null) return new Map();
  let meta;
  try { meta = JSON.parse(raw); }
  catch { throw Object.assign(new Error("日志元数据损坏，已停止写入以免覆盖"), { code: "STORAGE_UNAVAILABLE", status: 502 }); }
  if (!meta || typeof meta !== "object" || Array.isArray(meta) || (meta.problems !== undefined && !Array.isArray(meta.problems))) {
    throw Object.assign(new Error("日志元数据结构无效，已停止写入以免覆盖"), { code: "STORAGE_UNAVAILABLE", status: 502 });
  }
  return new Map((meta.problems || []).map((problem) => [problem.id, problem]));
}

export async function saveLog(user, date, input, expectedVersion) {
  const { problems, startedOn, solvedOn } = validateLogInput(input, {
    recordDate: date,
    today: todayUtc8(),
  });
  const legacyPath = trainingPaths(user.memberId || user.login).legacyIndex;
  const { root, files } = await resolveLogRoot(user, date);
  const previous = await readLegacyEnrichment(root, files, user.token);
  for (const problem of problems) {
    const old = previous.get(problem.id);
    if (!Object.hasOwn(problem, "statementImages") && old?.statementImages?.length) problem.statementImages = old.statementImages;
    // 审计字段（difficultyLegacy / difficultySource / difficultyRatingSource / problemNumberLegacy）
    // 旧客户端不会发送，而它们记录的是"改动前的原值"，无法从当前值反推：从服务端现有记录继承，
    // 否则一次旧接口保存就永久丢掉回滚依据（审计 §2.2）。客户端显式带上时以客户端为准。
    if (old) for (const [key, value] of Object.entries(problemAuditFields(old))) if (!Object.hasOwn(problem, key)) problem[key] = value;
  }
  assertAttachmentsUnchanged(problems, previous);
  const updatedAt = toUtc8(new Date());
  const changes = await planLogChanges(problems, files, root, updatedAt, { startedOn, solvedOn });
  // 个人索引是从各日日志派生的整份文件：按提交尝试的 head 重读重算，
  // 冲突重试时不会拿旧快照算出的内容覆盖别人刚写进去的改动。
  changes.push((head) => content(legacyPath, user.token, head).then((raw) => planLegacyIndexChange(user, date, problems, raw)));
  await assertLogVersionPlan({ expectedVersion, files, changes, root, allowedOutside: [legacyPath] });
  await commit(changes, `save(${user.member}): training log for ${date}`, user.token, 0, (head) => assertFreshDateVersion(user, date, expectedVersion, legacyPath, head));
  return { problems, revision: await predictedRevision(files, changes, root) };
}

/**
 * 每次提交尝试前用该次 head 重新校验日期版本：期间有人改过这一天就必须 409，
 * 不能把按旧快照规划出来的日期文件写到新的 head 上。
 */
async function assertFreshDateVersion(user, date, expectedVersion, legacyPath, head) {
  const { root, files } = await resolveLogRoot(user, date, head);
  return assertLogVersionPlan({ expectedVersion, files, changes: [], root, allowedOutside: [legacyPath] });
}

/**
 * The revision the caller should use for its next write: the current date files
 * with this save's changes applied. Files outside the date root (the personal
 * index) are excluded, matching how the revision is computed everywhere else, so
 * a client can keep editing and saving without reloading the page first.
 */
async function predictedRevision(files, changes, root) {
  const next = new Map((files || []).filter((file) => file.path.startsWith(`${root}/`)).map((file) => [file.path, file.sha]));
  for (const change of changes || []) {
    // 派生变更（函数）一定在日期目录之外，且此时尚未求值。
    if (typeof change === "function" || !change.path.startsWith(`${root}/`)) continue;
    if (change.delete) next.delete(change.path);
    else next.set(change.path, await gitBlobSha(change.content));
  }
  return revisionFromEntries([...next.entries()].map(([path, sha]) => ({ path, sha })));
}
export async function readLog(user, date) {
  const { root, files } = await resolveLogRoot(user, date);
  const metaPath = `${root}/meta.json`;
  if (!files || !files.some((file) => file.path === metaPath)) return { problems: [], revision: null };
  const raw = await content(metaPath, user.token);
  // 目录列表刚说文件在，读回来是 null 只可能是它在这中间被删了（并发删除），按「没有记录」继续。
  if (!raw) return { problems: [], revision: null };
  // 解析失败不能冒泡成通用 500：这是数据损坏，给出结构化 502，读路径也不该装作这一天不存在。
  let meta;
  try { meta = JSON.parse(raw); }
  catch { throw Object.assign(new Error("日志元数据损坏，无法读取"), { code: "STORAGE_UNAVAILABLE", status: 502 }); }
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw Object.assign(new Error("日志元数据结构无效，无法读取"), { code: "STORAGE_UNAVAILABLE", status: 502 });
  }
  const paths = new Set(files.map((file) => file.path));
  return {
    revision: await revisionFromEntries(files),
    updatedAt: typeof meta.updatedAt === "string" ? meta.updatedAt : undefined,
    startedOn: meta.startedOn,
    solvedOn: meta.solvedOn,
    problems: await Promise.all((meta.problems || []).map(async (p, i) => {
      const slot = Number.isInteger(p.fileIndex) && p.fileIndex >= 0 ? p.fileIndex : i;
      return {
        ...p,
        description: paths.has(`${root}/${slot}-desc.md`) ? (await content(`${root}/${slot}-desc.md`, user.token)) || "" : "",
        takeaway: paths.has(`${root}/${slot}-takeaway.md`) ? (await content(`${root}/${slot}-takeaway.md`, user.token)) || "" : "",
        code: paths.has(`${root}/${slot}-solution.cpp`) ? (await content(`${root}/${slot}-solution.cpp`, user.token)) || "" : "",
      };
    })),
  };
}
export async function deleteLog(user, date, expectedVersion) {
  const legacyPath = trainingPaths(user.memberId || user.login).legacyIndex;
  const { root, files } = await resolveLogRoot(user, date);
  if (!files || !files.length) return { deleted: false };
  const changes = files.map((file) => ({ path: file.path, delete: true }));
  changes.push((head) => content(legacyPath, user.token, head).then((raw) => planLegacyIndexChange(user, date, [], raw)));
  await assertLogVersionPlan({ expectedVersion, files, changes, root, allowedOutside: [legacyPath] });
  await commit(changes, `delete(${user.member}): training log for ${date}`, user.token, 0, (head) => assertFreshDateVersion(user, date, expectedVersion, legacyPath, head));
  return { deleted: true };
}
