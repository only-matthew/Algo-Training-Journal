import { isDateString, LOG_LIMITS, metaFromProblems, validateLogInput } from "../lib/log-schema.mjs";
import { toUtc8 } from "../lib/constants.mjs";
import { handleQqBotWebhook } from "./qq-bot.mjs";
import { createTrainingService, sha256Hex, trainingPaths } from "./services/training.mjs";
import { GitTransactionError } from "./storage/git-transaction.mjs";
import { isUuidV4 } from "../lib/training-schema.mjs";
import { readCatalog, readTrainingContext, workbenchResponse } from "./services/training-read.mjs";
import { catalogProblem, recommendV1 } from "../lib/recommendations.mjs";
import { subjectKeyForProblem } from "../lib/problem-identity.mjs";
import { archiveStatementImages, fetchStatement, parseAtCoderProblemNumber, parseLuoguProblem, readLuoguProblem } from "./services/problem-statement.mjs";
import { attachAtCoderTags, resolveAtCoderTagIds } from "./services/atcoder-tags.mjs";
import { createLogsV2Service, parseLogsV2Request, revisionFromEntries, statementImagePath, statementPath } from "./services/logs-v2.mjs";
import { normalizeLearningState } from "../lib/learning-state.mjs";
import { MAX_NEW_STATEMENT_IMAGE_BYTES } from "../lib/statement-images.mjs";

const REPO = "only-matthew/Algo-Training-Journal";
const BRANCH = "main";
const COOKIE = "__Host-journal_session";
const OAUTH_COOKIE = "__Host-journal_oauth";
const LEGACY_COOKIE = "journal_session";
const MEMBERS = { "only-matthew": "廖夏", wzzzzhhhhh: "王梓豪", "seanist-isx": "郭一鸣" };
// 队员预置的 Codeforces 用户名：登录后导入面板自动预填（可在输入框内修改）
const CF_HANDLES = { "only-matthew": "onlymatt", wzzzzhhhhh: "hnuwang", "seanist-isx": "ymguo" };
// 队员预置的 AtCoder 用户名：AtCoder 的 handle 与 CF 不同名，同样在导入面板自动预填。
const ATCODER_HANDLES = { "only-matthew": "only_matthew" };
const ORIGINS = new Set(["https://train.xialiao.org", "http://localhost:3000", "http://localhost:4173", "http://localhost:5000"]);

const RATE_LIMITS = { summarize: { max: 5, windowMs: 60000 }, "import:codeforces": { max: 10, windowMs: 60000 }, "import:luogu": { max: 10, windowMs: 60000 }, "import:atcoder": { max: 10, windowMs: 60000 }, "problem-statement": { max: 10, windowMs: 60000 } };
// 注意：此限流表是 isolate 内存态，跨冷启动 / 多个 isolate 不共享；
// 对小队规模足够，严格防滥用需迁移到 KV 或 Durable Object。
const rateMap = new Map();

function rateExceeded(key, limit) {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now - entry.since > limit.windowMs) {
    rateMap.set(key, { count: 1, since: now });
    return false;
  }
  entry.count += 1;
  if (entry.count > limit.max) return true;
  return false;
}

function cors(request) {
  const origin = request.headers.get("Origin");
  return origin && ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token, Idempotency-Key, If-Match, If-None-Match", "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS", "Access-Control-Expose-Headers": "ETag, Retry-After", Vary: "Origin" } : {};
}
function json(request, body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(request), ...headers } }); }
function cookies(request) { return Object.fromEntries((request.headers.get("Cookie") || "").split(/;\s*/).filter(Boolean).map((part) => { const i = part.indexOf("="); return [part.slice(0, i), part.slice(i + 1)]; })); }
function cookie(name, value, age = 28800) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`; }
function encode(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function decode(value) { const s = value.replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(s + "=".repeat((4 - s.length % 4) % 4)), (c) => c.charCodeAt(0)); }
async function key(secret) { return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)), "AES-GCM", false, ["encrypt", "decrypt"]); }
// 导出仅用于本地集成测试构造会话 cookie；生产密钥来自 env.SESSION_SECRET，不会暴露。
export async function seal(data, secret) { const iv = crypto.getRandomValues(new Uint8Array(12)); const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), new TextEncoder().encode(JSON.stringify(data)))); const all = new Uint8Array(12 + encrypted.length); all.set(iv); all.set(encrypted, 12); return encode(all); }
async function open(value, secret) { try { const all = decode(value); const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, await key(secret), all.slice(12)); const data = JSON.parse(new TextDecoder().decode(raw)); return data.exp > Date.now() ? data : null; } catch { return null; } }
// 计算 Git blob 的 SHA-1（与 GitHub 存储的 blob 哈希一致）：sha1("blob <字节数>\0<内容>")
// 用于与目录列表中的 blob sha 对比，跳过内容未变化的文件写入。
export async function gitBlobSha(content) {
  const encoder = new TextEncoder();
  // 文本与二进制共用同一实现：PDF 附件必须按原始字节计算 blob SHA，
  // 不能先经过 TextDecoder/TextEncoder 往返，否则哈希与 GitHub 存储值不符。
  // 文本分支同样要先编码：直接读 content.length 在字符串上是 undefined，
  // 会让头部变成 "blob undefined\0"，所有文本文件的 blob SHA 全部算错。
  const bytes = typeof content === "string" ? encoder.encode(content) : content;
  const header = encoder.encode(`blob ${bytes.length}\0`);
  const combined = new Uint8Array(header.length + bytes.length);
  combined.set(header);
  combined.set(bytes, header.length);
  const digest = await crypto.subtle.digest("SHA-1", combined);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function safeReturnTo(value) { try { const url = new URL(value || "https://train.xialiao.org/"); return ORIGINS.has(url.origin) ? url.toString() : "https://train.xialiao.org/"; } catch { return "https://train.xialiao.org/"; } }
function ghHeaders(token) { return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Algo-Training-Journal-Worker", "X-GitHub-Api-Version": "2022-11-28" }; }
async function gh(path, token, options = {}) {
  const response = await fetch(path.startsWith("http") ? path : `https://api.github.com/repos/${REPO}${path}`, { ...options, headers: { ...ghHeaders(token), ...(options.headers || {}) } });
  const remaining = parseInt(response.headers.get("X-RateLimit-Remaining"), 10);
  if (remaining === 0) {
    const resetTime = parseInt(response.headers.get("X-RateLimit-Reset"), 10);
    const resetDate = resetTime ? new Date(resetTime * 1000).toLocaleTimeString("zh-CN") : "unknown";
    console.error(`GitHub API rate limit exhausted. Resets at ${resetDate}`);
    throw Object.assign(new Error(`GitHub API 请求配额已用完，约 ${resetDate} 恢复`), { status: 429 });
  }
  if (!Number.isNaN(remaining) && remaining < 10) {
    console.warn(`GitHub API rate limit low: ${remaining} remaining`);
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error(`GitHub API ${response.status} for ${path}: ${detail}`);
    if (response.status === 403) throw Object.assign(new Error("没有仓库权限，请确认已接受仓库邀请"), { status: 403 });
    if (response.status === 429) throw Object.assign(new Error("请求过于频繁，请稍后再试"), { status: 429 });
    throw Object.assign(new Error("GitHub API 请求失败"), { status: response.status >= 500 ? 502 : 400 });
  }
  return response.status === 204 ? null : response.json();
}

function v2Error(request, code, message, status, extra = {}) {
  return json(request, { error: { code, message, ...extra }, requestId: crypto.randomUUID() }, status, { "Cache-Control": "no-store" });
}

function v2Json(request, body, { status = 200, revision, headers = {} } = {}) {
  return json(request, body, status, {
    "Cache-Control": "no-store",
    ...(revision ? { ETag: `"${revision}"` } : {}),
    ...headers,
  });
}

function canonicalJson(value) {
  // Keep this in step with the receipt writer: JSON.stringify(undefined) yields
  // the string "undefined", which is not valid JSON.
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function parseConditionalRevision(request) {
  const match = request.headers.get("If-Match");
  const noneMatch = request.headers.get("If-None-Match");
  if (match && noneMatch) throw Object.assign(new Error("Use only one conditional revision header"), { code: "MALFORMED_REQUEST", status: 400 });
  if (noneMatch === "*") return null;
  if (match) {
    const quoted = /^"(sha256:[a-f0-9]{64})"$/i.exec(match);
    if (quoted) return quoted[1];
  }
  throw Object.assign(new Error("A conditional revision is required"), { code: "PRECONDITION_REQUIRED", status: 428 });
}

function requireIdempotencyKey(request) {
  const value = request.headers.get("Idempotency-Key");
  if (!isUuidV4(value)) throw Object.assign(new Error("Idempotency-Key must be a UUID v4"), { code: "PRECONDITION_REQUIRED", status: 428 });
  return value;
}

function requireObject(value, name = "body") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Object.assign(new Error(`${name} must be an object`), { code: "MALFORMED_REQUEST", status: 400 });
  return value;
}

function withoutPreconditions(command) {
  const { preconditions, ...body } = requireObject(command);
  return { body, preconditions };
}

async function githubContentAt(token, path, ref) {
  const bytes = await githubContentBytesAt(token, path, ref);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

// 与 githubContentAt 共用一次 Contents 请求，但返回原始字节。
// 题面 PDF 附件必须走这条路径：文本解码会破坏二进制内容。
async function githubContentBytesAt(token, path, ref) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`, { headers: ghHeaders(token) });
  if (response.status === 404) return null;
  if (!response.ok) throw Object.assign(new Error("GitHub content read failed"), { code: "UPSTREAM_UNAVAILABLE", status: 502 });
  const body = await response.json();
  if (Array.isArray(body) || typeof body?.content !== "string") throw Object.assign(new Error("GitHub content response was invalid"), { code: "UPSTREAM_UNAVAILABLE", status: 502 });
  return Uint8Array.from(atob(body.content.replace(/\s/g, "")), (char) => char.charCodeAt(0));
}

function trainingGit(token) {
  const treeCache = new Map();
  const fileCache = new Map();
  const readBytes = (head, path) => {
    const key = `${head}:${path}`;
    if (!fileCache.has(key)) fileCache.set(key, githubContentBytesAt(token, path, head));
    return fileCache.get(key);
  };
  const readFile = (head, path) => readBytes(head, path).then((bytes) => (bytes === null ? null : new TextDecoder().decode(bytes)));
  // 目录树按 head 缓存一次；blob SHA 由缓存内容本地计算，不额外请求 Contents API。
  const tree = async (snapshot) => {
    if (!treeCache.has(snapshot.head)) treeCache.set(snapshot.head, gh(`/git/trees/${snapshot.head}?recursive=1`, token).then((result) => {
      if (result.truncated) throw Object.assign(new Error("Repository index is too large"), { code: "INDEX_STALE", status: 503 });
      return result.tree || [];
    }));
    return treeCache.get(snapshot.head);
  };
  const listFiles = async (snapshot, prefix) => {
    const entries = await tree(snapshot);
    return entries.filter((entry) => entry.type === "blob" && entry.path.startsWith(prefix)).map((entry) => entry.path);
  };
  // logs-v2 的日期版本需要对目录内每个文件取 Git blob SHA 才能构造内容指纹，
  // 因此比 listFiles 多返回一层 { path, sha }。
  const listFileEntries = async (snapshot, prefix) => {
    const paths = await listFiles(snapshot, prefix);
    return mapConcurrent(paths, 4, async (path) => {
      const bytes = await readBytes(snapshot.head, path);
      return { path, sha: await gitBlobSha(bytes || new Uint8Array()) };
    });
  };
  return {
    async getHead() {
      const ref = await gh(`/git/ref/heads/${BRANCH}`, token);
      return ref.object.sha;
    },
    readFile,
    readBytes,
    listFiles,
    listFileEntries,
    async commit({ head, changes, message }) {
      const parent = await gh(`/git/commits/${head}`, token);
      const putFile = async (path, bytes, encoding = "utf-8") => {
        // 二进制附件由调用方预先 base64 编码；文本仍然按 utf-8 提交。
        const blob = await gh("/git/blobs", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: bytes, encoding }) });
        return { path, mode: "100644", type: "blob", sha: blob.sha };
      };
      const entries = await mapConcurrent(changes, 4, async (change) => {
        // 删除用 null blob sha 表达，tree API 会移除该路径。
        if (change.delete) return { path: change.path, mode: "100644", type: "blob", sha: null };
        return change.encoding === "base64" ? putFile(change.path, change.content, "base64") : putFile(change.path, change.content);
      });
      const treeResult = await gh("/git/trees", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }) });
      const commit = await gh("/git/commits", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, tree: treeResult.sha, parents: [head] }) });
      const current = await gh(`/git/ref/heads/${BRANCH}`, token);
      if (current.object.sha !== head) throw Object.assign(new Error("Git reference changed"), { code: "REF_CONFLICT", status: 409 });
      const response = await fetch(`https://api.github.com/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: "PATCH", headers: { ...ghHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify({ sha: commit.sha, force: false }) });
      if (response.status === 422 || response.status === 409) throw Object.assign(new Error("Git reference changed"), { code: "REF_CONFLICT", status: 409 });
      if (!response.ok) throw Object.assign(new Error("GitHub reference update failed"), { code: "UPSTREAM_UNAVAILABLE", status: 502 });
      return { commitSha: commit.sha };
    },
    async listEvents(snapshot, memberId, subjectKey) {
      const prefix = `training/members/${memberId}/events/`;
      const paths = (await listFiles(snapshot, prefix)).filter((path) => path.endsWith(".json"));
      const events = await mapConcurrent(paths, 4, async (path) => JSON.parse(await readFile(snapshot.head, path)));
      return events.filter((event) => event && event.memberId === memberId && (event.subjectKey === subjectKey || event.targetAttemptId));
    },
    async listDocuments(snapshot, memberId, directory, suffix = ".json") {
      const prefix = `training/members/${memberId}/${directory}/`;
      const paths = (await listFiles(snapshot, prefix)).filter((path) => path.endsWith(suffix));
      return mapConcurrent(paths, 4, async (path) => ({ path, data: JSON.parse(await readFile(snapshot.head, path)) }));
    },
  };
}

async function readTrainingDocument(git, memberId, resourceKey, path) {
  const head = await git.getHead();
  const raw = await git.readFile(head, path);
  if (raw === null) return { exists: false, data: null, revision: null, snapshotCommitSha: head };
  let data;
  try { data = JSON.parse(raw); } catch { throw Object.assign(new Error("Stored training document is invalid"), { code: "UPSTREAM_UNAVAILABLE", status: 502 }); }
  if (data.memberId !== memberId) throw Object.assign(new Error("Stored document is not owned by this member"), { code: "FORBIDDEN", status: 403 });
  const revision = `sha256:${await sha256Hex({ resourceKey, document: data })}`;
  return { exists: true, data, revision, snapshotCommitSha: head };
}

async function handleTrainingV2(request, user, url) {
  const suffix = url.pathname.slice("/api/v2".length);
  const git = trainingGit(user.token);
  const paths = trainingPaths(user.login);
  const today = toUtc8(new Date().toISOString()).slice(0, 10);
  const service = createTrainingService({ git,
    loadEvents: ({ snapshot, memberId, subjectKey }) => git.listEvents(snapshot, memberId, subjectKey),
    validateFocus: async (snapshot, ids) => {
      if (!ids.length) return;
      const nodes = await readCatalog(snapshot);
      if (ids.some((id) => !nodes.some((node) => node.id === id))) throw Object.assign(new Error("请选择有效的学习专题"), { status: 422 });
    },
    validateSelection: async (snapshot, item, plan) => {
      if (item.kind === "manual") return;
      const context = await readTrainingContext({ git, snapshot, user, date: plan?.date || today, today });
      const available = recommendV1({ ...context, profile: { ...(context.profile || {}), dailyItemLimit: 10, dailyBudgetMinutes: 240 } }).items;
      if (!available.some((candidate) => candidate.subjectKey === item.subjectKey && candidate.kind === item.kind && candidate.nodeId === item.nodeId)) throw Object.assign(new Error("候选已变化，请刷新推荐后重新选择"), { code: "VERSION_CONFLICT", status: 409 });
    },
  });
  const command = async (method, resource, payload, preconditions) => {
    const operationId = requireIdempotencyKey(request);
    const requestHash = await sha256Hex({ method: request.method, path: suffix, body: payload, preconditions });
    return method({ memberId: user.login, operationId, requestHash, [resource]: payload, preconditions });
  };

  if (request.method === "GET" && (suffix === "/me/reviews" || suffix === "/me/workbench" || suffix === "/me/recommendations")) {
    const head = await git.getHead();
    const snapshot = { head, readFile: (path) => git.readFile(head, path) };
    const date = url.searchParams.get("date") || today;
    if (!isDateString(date)) throw Object.assign(new Error("Invalid date"), { code: "MALFORMED_REQUEST", status: 400 });
    const exclude = url.searchParams.getAll("exclude");
    if (exclude.length > 50 || exclude.some((key) => key.length > 500)) return v2Error(request, "MALFORMED_REQUEST", "排除列表过长", 400);
    const context = await readTrainingContext({ git, snapshot, user, date, today, includeCatalog: suffix !== "/me/reviews" });
    if (suffix === "/me/reviews") return v2Json(request, { data: context.reviews, snapshotCommitSha: head });
    const result = workbenchResponse(context, exclude);
    if (suffix === "/me/recommendations") return v2Json(request, { ...result.recommendations, today, snapshotCommitSha: head });
    return v2Json(request, result);
  }

  if (suffix === "/me/plan-actions" && request.method === "POST") {
    const { body: action, preconditions } = withoutPreconditions(await readJsonBody(request));
    return v2Json(request, await command(service.applyPlanAction, "action", action, preconditions));
  }

  if (suffix === "/me/profile") {
    if (request.method === "GET") return v2Json(request, await readTrainingDocument(git, user.login, "profile", paths.profile));
    if (request.method === "PUT") {
      const profile = requireObject(await readJsonBody(request));
      const result = await command(service.saveProfile, "profile", profile, { profile: parseConditionalRevision(request) });
      return v2Json(request, result, { revision: result.resourceVersions.profile });
    }
  }

  const planMatch = /^\/me\/plans\/(\d{4}-\d{2}-\d{2})$/.exec(suffix);
  if (planMatch) {
    const date = planMatch[1];
    if (!isDateString(date)) throw Object.assign(new Error("Invalid plan date"), { code: "MALFORMED_REQUEST", status: 400 });
    const key = `plan:${date}`;
    if (request.method === "GET") return v2Json(request, await readTrainingDocument(git, user.login, key, paths.plan(date)));
    if (request.method === "PUT") {
      const incoming = requireObject(await readJsonBody(request));
      if (Object.hasOwn(incoming, "date") && incoming.date !== date) throw Object.assign(new Error("Plan date does not match URL"), { code: "MALFORMED_REQUEST", status: 400 });
      const plan = { ...incoming, date };
      const result = await command(service.savePlan, "plan", plan, { [key]: parseConditionalRevision(request) });
      return v2Json(request, result, { revision: result.resourceVersions[key] });
    }
  }

  if (suffix === "/me/attempts" && request.method === "POST") {
    const { body: attempt, preconditions } = withoutPreconditions(await readJsonBody(request));
    const result = await command(service.recordAttempt, "attempt", attempt, preconditions);
    return v2Json(request, result, { status: 201, revision: Object.values(result.resourceVersions)[0] });
  }
  if (suffix === "/me/review-actions" && request.method === "POST") {
    const { body: action, preconditions } = withoutPreconditions(await readJsonBody(request));
    const result = await command(service.applyReviewAction, "action", action, preconditions);
    return v2Json(request, result, { status: 201, revision: Object.values(result.resourceVersions)[0] });
  }

  const assessmentMatch = /^\/me\/assessments\/([^/]+)$/.exec(suffix);
  if (assessmentMatch) {
    const nodeId = decodeURIComponent(assessmentMatch[1]);
    const key = `assessment:${nodeId}`;
    if (request.method === "GET") return v2Json(request, await readTrainingDocument(git, user.login, key, paths.assessment(nodeId)));
    if (request.method === "PUT") {
      const incoming = requireObject(await readJsonBody(request));
      if (Object.hasOwn(incoming, "nodeId") && incoming.nodeId !== nodeId) throw Object.assign(new Error("Assessment nodeId does not match URL"), { code: "MALFORMED_REQUEST", status: 400 });
      const assessment = { ...incoming, nodeId };
      const result = await command(service.saveSelfAssessment, "assessment", assessment, { [key]: parseConditionalRevision(request) });
      return v2Json(request, result, { revision: result.resourceVersions[key] });
    }
  }

  const operationMatch = /^\/me\/operations\/([^/]+)$/.exec(suffix);
  if (operationMatch && request.method === "GET") {
    const operationId = decodeURIComponent(operationMatch[1]);
    if (!isUuidV4(operationId)) throw Object.assign(new Error("Invalid operation id"), { code: "MALFORMED_REQUEST", status: 400 });
    const document = await readTrainingDocument(git, user.login, `operation:${operationId}`, `training/members/${user.login}/operations/${operationId}.json`);
    return v2Json(request, document.exists ? { exists: true, operation: { id: operationId, state: "saved" }, result: document.data.result, snapshotCommitSha: document.snapshotCommitSha } : { exists: false, operation: { id: operationId, state: "unknown" }, snapshotCommitSha: document.snapshotCommitSha });
  }

  return null;
}

// v2 日志路由：整日读写/删除与题面 PDF/图片附件。这是 logs-v2 服务唯一的对外入口，
// 负责把 HTTP 语义（幂等键、条件版本、multipart、Content-Disposition）接到纯业务服务上。
async function handleLogsV2(request, user, url) {
  const suffix = url.pathname.slice("/api/v2".length);
  const dateMatch = /^\/logs\/dates\/(\d{4}-\d{2}-\d{2})$/.exec(suffix);
  const statementMatch = /^\/logs\/dates\/(\d{4}-\d{2}-\d{2})\/problems\/([^/]+)\/statement$/.exec(suffix);
  const imageMatch = /^\/logs\/dates\/(\d{4}-\d{2}-\d{2})\/problems\/([^/]+)\/images\/([^/]+)$/.exec(suffix);
  if (!dateMatch && !statementMatch && !imageMatch) return null;
  const date = (dateMatch || statementMatch || imageMatch)[1];
  const git = trainingGit(user.token);
  const legacyIndexPath = trainingPaths(user.login).legacyIndex;
  // 附件、正文与个人训练索引必须落在同一个 commit；索引缺失时按既有语义报 INDEX_STALE。
  const auxiliaryChanges = async ({ snapshot, date: logDate, problems }) => {
    const raw = await git.readFile(snapshot.head, legacyIndexPath);
    const change = planLegacyIndexChange({ login: user.login, member: user.member }, logDate, problems, raw);
    return change ? [change] : [];
  };
  const service = createLogsV2Service({ git, planAuxiliaryChanges: auxiliaryChanges });

  if (statementMatch) {
    if (request.method !== "GET") return null;
    const recordId = decodeURIComponent(statementMatch[2]);
    const attachment = await service.statement({ member: user.member, date, recordId });
    const fileName = attachment.fileName.replace(/[\r\n]/g, " ").trim() || "statement.pdf";
    return new Response(attachment.bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        ETag: `"sha256:${attachment.sha256}"`,
      },
    });
  }

  if (imageMatch) {
    if (request.method !== "GET") return null;
    const recordId = decodeURIComponent(imageMatch[2]);
    const image = await service.statementImage({ member: user.member, date, recordId, fileName: decodeURIComponent(imageMatch[3]) });
    return new Response(image.bytes, {
      status: 200,
      headers: {
        "Content-Type": image.mimeType,
        // 图片要在题面里内联显示：文件名即内容哈希，可以长缓存，但附件接口需要会话。
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=86400",
        ETag: `"sha256:${image.sha256}"`,
      },
    });
  }

  if (request.method === "GET") {
    const current = await service.read({ member: user.member, date });
    return v2Json(request, { ...current.log, version: current.version, revision: current.version });
  }

  if (request.method === "PUT" || request.method === "DELETE") {
    const operationId = requireIdempotencyKey(request);
    let requestBody;
    let expectedVersion;
    let attachmentChanges;
    let attachments;
    let images;
    if (request.method === "PUT") {
      const parsed = await parseLogsV2Request(request);
      const payload = requireObject(parsed.payload);
      requestBody = payload.log;
      expectedVersion = payload.expectedVersion;
      attachmentChanges = payload.attachmentChanges;
      attachments = parsed.attachments;
      images = parsed.images;
    } else {
      const payload = requireObject(await readJsonBody(request, 64 * 1024));
      expectedVersion = payload.expectedVersion;
    }
    const base = { memberId: user.login, member: user.member, date, operationId, expectedVersion };

    if (request.method === "PUT") {
      const result = await service.save({ ...base, log: requestBody, attachmentChanges, attachments, images });
      // `revision` is the name every client reads; keep it in the body as well as the
      // ETag so a save and a read are interchangeable for the caller.
      return v2Json(request, { ...result, revision: result.version }, { revision: result.version });
    }

    const result = await service.remove(base);
    return v2Json(request, { ...result, revision: null });
  }

  return null;
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length); let next = 0;
  async function worker() { while (next < items.length) { const index = next++; results[index] = await mapper(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker)); return results;
}
async function readJsonBody(request, maxBytes = LOG_LIMITS.maxRequestBytes) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maxBytes) throw Object.assign(new RangeError("提交内容超过大小限制"), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw Object.assign(new RangeError("提交内容超过大小限制"), { status: 413 });
  try { return JSON.parse(text); } catch { throw Object.assign(new TypeError("请求内容不是有效的 JSON"), { status: 400 }); }
}
/**
 * 把一组变更提交到 main。
 *
 * `changes` 里的每一项要么是现成的变更对象，要么是 `(headSha) => Promise<change|null>`
 * 形式的「按当前 head 求值的变更」——派生文件（如个人训练索引）必须用后者：非强制 ref
 * 更新失败后的重试如果复用旧快照算出的内容，就会把并发写入的改动静默覆盖回去。
 * `recheck(headSha)` 在每次尝试前用同一个 head 重新校验前置条件（日期版本），
 * 保证重试不会拿过期内容覆盖同一天的新改动。
 */
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
    }
  );

  // 6. Retry on conflict
  const remaining = parseInt(response.headers.get("X-RateLimit-Remaining"), 10);
  if (remaining === 0) {
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
export function logRoots(member, date) {
  const [year, month, day] = date.split("-");
  return [`logs/${member}/${year}/${month}/${day}`, `logs/${member}/${date}`];
}
async function session(request, env) {
  const requestCookies = cookies(request);
  const values = [requestCookies[COOKIE], requestCookies[LEGACY_COOKIE]].filter(Boolean);
  for (const value of values) {
    const data = await open(value, env.SESSION_SECRET);
    if (data && MEMBERS[data.login] === data.member) {
      return { ...data, cfHandle: CF_HANDLES[data.login], atcoderHandle: ATCODER_HANDLES[data.login] };
    }
  }
  return null;
}
async function content(path, token, ref = BRANCH) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`, { headers: ghHeaders(token) });
  if (response.status === 404) return null; if (!response.ok) { console.error(`GitHub content fetch failed: ${response.status}`); throw Object.assign(new Error("读取仓库文件失败"), { status: 502 }); }
  return new TextDecoder().decode(Uint8Array.from(atob((await response.json()).content.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
}
// 一次请求列出目录下的所有文件（path + blob sha）；目录不存在返回 null。
// 替代逐文件探测存在性，大幅减少 Contents API 调用次数。
async function listDir(path, token, ref = BRANCH) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`, { headers: ghHeaders(token) });
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
// 规划一次保存所需的文件变更：删除不再需要的旧文件，仅对内容有变化的文件创建 blob。
// existingFiles 来自目录列表（path -> blob sha），通过本地 SHA-1 对比跳过未变更文件，
// 无需逐文件读取旧内容。
export async function planLogChanges(problems, existingFiles, root, updatedAt, interval = {}) {
  const existing = new Map((existingFiles || []).map((file) => [file.path, file.sha]));
  const desired = new Map();
  const used = new Set(problems.filter((p) => Number.isInteger(p.fileIndex) && p.fileIndex >= 0).map((p) => p.fileIndex));
  let next = 0;
  for (const p of problems) {
    if (!Number.isInteger(p.fileIndex) || p.fileIndex < 0) {
      while (used.has(next)) next += 1;
      p.fileIndex = next;
      used.add(next);
      next += 1;
    }
  }
  desired.set(`${root}/meta.json`, JSON.stringify(metaFromProblems(problems, updatedAt, interval), null, 2));
  // 题面 PDF 与题面图片的字节由 v2 附件接口写入，这里只能「保留引用到的、清理不再引用的」。
  // 若把它们当作普通文件比较内容，我们手里只有路径没有字节，会把它们误判为需要删除。
  const keep = new Set();
  problems.forEach((p) => {
    const prefix = `${root}/${p.fileIndex}-`;
    desired.set(`${prefix}takeaway.md`, p.takeaway || "未填写");
    if (p.description) desired.set(`${prefix}desc.md`, p.description);
    if (p.code) desired.set(`${prefix}solution.cpp`, p.code);
    if (p.statementAttachment?.sha256) keep.add(statementPath(root, p));
    for (const image of p.statementImages || []) keep.add(statementImagePath(root, image));
  });

  const changes = [];
  for (const path of existing.keys()) {
    if (!desired.has(path) && !keep.has(path)) changes.push({ path, delete: true });
  }
  for (const [path, content] of desired) {
    if (existing.get(path) === await gitBlobSha(content)) continue;
    changes.push({ path, content });
  }
  return changes;
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
  let meta = {};
  try { meta = JSON.parse(raw || "{}"); } catch { meta = {}; }
  const previous = new Map((meta.problems || []).map((problem) => [problem.id, problem]));
  return previous;
}

export async function saveLog(user, date, input, expectedVersion) {
  const { problems, startedOn, solvedOn } = validateLogInput(input);
  const legacyPath = trainingPaths(user.login).legacyIndex;
  const { root, files } = await resolveLogRoot(user, date);
  const previous = await readLegacyEnrichment(root, files, user.token);
  for (const problem of problems) {
    const old = previous.get(problem.id);
    if (!Object.hasOwn(problem, "statementImages") && old?.statementImages?.length) problem.statementImages = old.statementImages;
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
  if (!raw) return { problems: [], revision: null };
  const meta = JSON.parse(raw);
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
  const legacyPath = trainingPaths(user.login).legacyIndex;
  const { root, files } = await resolveLogRoot(user, date);
  if (!files || !files.length) return { deleted: false };
  const changes = files.map((file) => ({ path: file.path, delete: true }));
  changes.push((head) => content(legacyPath, user.token, head).then((raw) => planLegacyIndexChange(user, date, [], raw)));
  await assertLogVersionPlan({ expectedVersion, files, changes, root, allowedOutside: [legacyPath] });
  await commit(changes, `delete(${user.member}): training log for ${date}`, user.token, 0, (head) => assertFreshDateVersion(user, date, expectedVersion, legacyPath, head));
  return { deleted: true };
}

export function planLegacyIndexChange(user, date, problems, raw) {
  let index;
  try { index = raw == null ? null : JSON.parse(raw); } catch { index = null; }
  if (index?.schemaVersion !== 1 || index.memberId !== user.login || index.member !== user.member || !Array.isArray(index.records)) {
    throw Object.assign(new Error("个人训练索引暂不可用"), { code: "INDEX_STALE", status: 503 });
  }
  const records = index.records.filter((record) => record?.date !== date);
  for (const problem of problems) {
    const recordRef = { memberId: user.login, date, recordId: problem.id };
    records.push({
      subjectKey: subjectKeyForProblem({ ...recordRef, ...problem }),
      date,
      recordRef,
      problem: catalogProblem(problem),
      ...normalizeLearningState(problem),
      ...(problem.reviewDue ? { reviewDue: problem.reviewDue } : {}),
      href: `/problem/${[user.member, date, problem.id].map(encodeURIComponent).join("/")}/`,
    });
  }
  // Keep each day's records in the same order as its source meta.json. Array#sort
  // is stable, so sorting only by date preserves both untouched groups and the
  // order of the replacement problems appended above.
  records.sort((a, b) => a.date.localeCompare(b.date));
  const content = `${JSON.stringify({ ...index, records }, null, 2)}\n`;
  if (raw?.replace(/\r\n/g, "\n") === content) return null;
  return { path: trainingPaths(user.login).legacyIndex, content };
}

export async function summarizeDescription(ai, description) {
  if (!ai) return null;
  const text = String(description || "").trim();
  if (!text || text.length < 20) return null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await ai.run("@cf/qwen/qwen3-30b-a3b-fp8", {
        max_tokens: 512,
        temperature: 0.15,
        messages: [
          { role: "system", content: "你是算法竞赛题意压缩助手。仅依据用户给出的题面，用一句不超过60个汉字的中文概括：处理什么对象、要求计算或判断什么、最关键的约束或优化目标。不要猜测解法，不要列点，不要标题、引号、Markdown、解释或思考过程。" },
          { role: "user", content: `${text.slice(0, 6000)}\n/no_think` },
        ],
      });
      const summary = String(result.response || "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/^(?:概括|摘要|题意)\s*[:：]\s*/i, "")
        .replace(/^[""'']+|[“”"']+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (summary) return summary.slice(0, 120);
      return null;
    } catch (error) {
      if (attempt === 2) {
        console.error("AI summarize failed after 3 attempts:", error.message);
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  return null;
}

async function handleAuth(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/" && url.searchParams.has("code")) {
    const returnTo = safeReturnTo(url.searchParams.get("state"));
    return Response.redirect(`${url.origin}/auth/login?returnTo=${encodeURIComponent(returnTo)}`, 302);
  }
  if (url.pathname === "/auth/login") {
    const nonce = crypto.randomUUID();
    const state = await seal({ nonce, returnTo: safeReturnTo(url.searchParams.get("returnTo")), exp: Date.now() + 600000 }, env.SESSION_SECRET);
    const callback = `${url.origin}/auth/callback`;
    const location = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(env.GITHUB_CLIENT_ID)}&scope=public_repo&redirect_uri=${encodeURIComponent(callback)}&state=${encodeURIComponent(state)}`;
    return new Response(null, { status: 302, headers: { Location: location, "Set-Cookie": cookie(OAUTH_COOKIE, nonce, 600) } });
  }
  if (url.pathname === "/auth/callback") {
    const state = await open(url.searchParams.get("state") || "", env.SESSION_SECRET);
    if (!state || state.nonce !== cookies(request)[OAUTH_COOKIE]) return new Response("Invalid OAuth state", { status: 400 });
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get("code") }) });
    const token = (await tokenResponse.json()).access_token;
    if (!token) return new Response("OAuth failed", { status: 400 });
    const githubUser = await gh("https://api.github.com/user", token);
    const member = MEMBERS[githubUser.login];
    if (!member) return new Response("该用户不在队伍白名单中", { status: 403 });
    const csrfToken = crypto.randomUUID();
    // Session cookie ~600-800 bytes (well under 4KB browser limit)
    const value = await seal({ token, login: githubUser.login, member, avatar_url: githubUser.avatar_url, csrfToken, exp: Date.now() + 28800000 }, env.SESSION_SECRET);
    return new Response(null, { status: 302, headers: { Location: safeReturnTo(state.returnTo), "Set-Cookie": cookie(COOKIE, value) } });
  }
  return null;
}

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
function expectedVersionFrom(request, body) {
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

async function handleLogsDate(request, user) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (!isDateString(date)) return json(request, { error: "日期格式无效" }, 400);
  // 拒绝未来日期（按 UTC+8 今天比较），防止误填未来打卡
  const today = toUtc8(new Date().toISOString()).slice(0, 10);
  if (date > today) return json(request, { error: "不能提交未来日期的记录" }, 400);
  if (request.method === "GET") return json(request, await readLog(user, date));
  if (request.method === "PUT") {
    const body = await readJsonBody(request);
    const expectedVersion = expectedVersionFrom(request, body);
    const input = { ...body };
    delete input.expectedVersion;
    return json(request, await saveLog(user, date, input, expectedVersion));
  }
  if (request.method === "DELETE") {
    let body = null;
    try { body = await readJsonBody(request, 4096); } catch { body = null; }
    return json(request, await deleteLog(user, date, expectedVersionFrom(request, body)));
  }
}

async function handleSummarize(request, user, env) {
  if (rateExceeded(`summarize:${user.member}`, RATE_LIMITS.summarize)) {
    return json(request, { error: "请求过于频繁，请稍后再试" }, 429);
  }
  const { description } = await readJsonBody(request);
  if (!description || typeof description !== "string" || !description.trim()) {
    return json(request, { error: "请提供题目描述" }, 400);
  }
  if (description.length > 20000) {
    return json(request, { error: "题目描述过长，请控制在 20000 字以内" }, 413);
  }
  const summary = await summarizeDescription(env.AI, description);
  if (!summary) return json(request, { error: "生成失败，请检查描述内容" }, 422);
  return json(request, { summary });
}

// 题面抓取只支持两个有官方公开页面的平台：Codeforces（英文题面，被反爬时退回洛谷镜像）
// 与 AtCoder（官方英文题面，少数老题只有日文原题）。
const STATEMENT_PLATFORMS = new Set(["Codeforces", "AtCoder"]);

async function handleProblemStatement(request, user) {
  if (rateExceeded(`problem-statement:${user.login}`, RATE_LIMITS["problem-statement"])) {
    return v2Error(request, "RATE_LIMITED", "请求过于频繁，请稍后再试", 429);
  }
  const body = await readJsonBody(request, 4096);
  if (!body || !STATEMENT_PLATFORMS.has(body.platform) || typeof body.problemNumber !== "string"
    || (body.sourceUrl !== undefined && typeof body.sourceUrl !== "string")) {
    return v2Error(request, "INVALID_JSON", "只支持一个 Codeforces 或 AtCoder 题号", 400);
  }
  // AtCoder 的题号必须能拆出比赛与任务 ID，否则连题目页都拼不出来，不能靠猜。
  if (body.platform === "AtCoder" && !parseAtCoderProblemNumber(body.problemNumber)) {
    return v2Error(request, "INVALID_JSON", "AtCoder 题号必须形如 abc381_a", 400);
  }
  const result = await fetchStatement({ platform: body.platform, problemNumber: body.problemNumber, sourceUrl: body.sourceUrl });
  // 洛谷镜像页顺带带回了算法标签（数字 id，只有 AT_ 镜像才有）。换成站内标签一起返回，
  // 前端就能在填题面时顺手把标签填好；字典取不到时只是没有 tags，不影响题面。
  if (result.status === "ok" && Array.isArray(result.tagIds)) {
    const { tagIds, ...statement } = result;
    const tags = await resolveAtCoderTagIds(tagIds);
    return json(request, tags.length ? { ...statement, tags } : statement);
  }
  return json(request, result);
}

// Codeforces 官方 API：拉取最近 days 天内的 AC 记录，按题目去重（公开接口，无需登录）。
// 自动翻页直到覆盖时间窗口或达到 maxPages 页，避免一次性拉取全部历史记录。
export async function fetchCodeforcesAccepted(handle, { fetchImpl = fetch, days = 3, maxPages = 5, perPage = 100 } = {}) {
  const h = String(handle || "").trim();
  if (!h) throw Object.assign(new TypeError("请输入 Codeforces 用户名"), { status: 400 });
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const seen = new Set();
  const problems = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * perPage + 1;
    const response = await fetchImpl(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(h)}&from=${from}&count=${perPage}`);
    if (!response.ok) throw Object.assign(new Error("Codeforces 接口不可用，请稍后再试"), { status: 502 });
    const data = await response.json();
    if (data.status !== "OK") throw Object.assign(new Error(`Codeforces 用户 ${h} 不存在或接口错误`), { status: 400 });
    const result = data.result || [];
    if (!result.length) break;
    for (const submission of result) {
      if (submission.creationTimeSeconds < cutoff) continue;
      if (submission.verdict !== "OK") continue;
      const p = submission.problem;
      if (!p || !p.name) continue;
      const number = [p.contestId, p.index].filter(Boolean).join("");
      const key = `${number}|${p.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push({
        name: p.name,
        platform: "Codeforces",
        problemNumber: number,
        submissionUrl: submission.id && p.contestId ? `https://codeforces.com/contest/${p.contestId}/submission/${submission.id}` : "",
        ...(p.rating ? { rating: p.rating } : {}),
        tags: Array.isArray(p.tags) ? p.tags : [],
      });
    }
    // 本页最后一条已早于窗口起点：后续页面只会更旧，无需继续翻页
    const oldest = result[result.length - 1];
    if (result.length < perPage || !oldest || oldest.creationTimeSeconds < cutoff) break;
  }
  return problems;
}

// 洛谷官方难度分级（洛谷帮助中心《题目难度体系》当前 8 级，减号统一为 ASCII）：
// 0 暂无评定 | 1 入门 | 2 普及- | 3 普及 | 4 普及+/提高- | 5 提高 | 6 提高+/省选- | 7 省选/NOI- | 8 NOI/NOI+/CTS
const LUOGU_DIFFICULTY = { 0: "暂无评定", 1: "入门", 2: "普及-", 3: "普及", 4: "普及+/提高-", 5: "提高", 6: "提高+/省选-", 7: "省选/NOI-", 8: "NOI/NOI+/CTS" };

// 洛谷：抓取题目页解析题名、官方难度与题目描述（页面内嵌 lentille-context JSON）。
// 标签为数字 ID 且平台未提供公开的标签名称接口，故不返回；洛谷提交记录 API 需登录态 + CSRF，
// 故导入采用「粘贴题号 → 补全题名/难度/题面」的半自动方案。
// 题面与「抓取 CF 题面」走同一套解析与图片归档：裸 Markdown 图片语法里的 CDN 链接
// 在站内加载不出来（CSP 只允许 'self' 与 data:），必须随保存归档到仓库。
export async function fetchLuoguProblems(numbers, { fetchImpl = fetch, concurrency = 3 } = {}) {
  const list = String(numbers || "")
    .split(/[\s,，、;；]+/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z]?\d+$/.test(s))
    .slice(0, 15);
  if (!list.length) throw Object.assign(new TypeError("请至少输入一个洛谷题号，如 P1001"), { status: 400 });

  const fallback = (number) => ({ name: number, platform: "洛谷", problemNumber: number, difficulty: "未标注", description: "" });
  const results = new Array(list.length);
  // 一次导入最多回传 15 道题，图片是 base64 回传的：给整批设一个总量预算，
  // 超出的题目按「图片未归档」降级（正文保留外链），不会让响应体无限膨胀。
  let imageBudget = 4 * 1024 * 1024;
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const index = next++;
      const number = list[index].toUpperCase();
      try {
        const response = await fetchImpl(`https://www.luogu.com.cn/problem/${encodeURIComponent(number)}`);
        if (!response.ok) throw new Error("页面不存在");
        const html = await response.text();
        const item = fallback(number);
        const problem = readLuoguProblem(html);
        if (problem) {
          if (problem.name) item.name = problem.name;
          if (typeof problem.difficulty === "number") item.difficulty = LUOGU_DIFFICULTY[problem.difficulty] || "未标注";
          try {
            const parsed = parseLuoguProblem(problem, { collectImages: true });
            const budget = Math.max(0, Math.min(MAX_NEW_STATEMENT_IMAGE_BYTES, imageBudget));
            const archived = await archiveStatementImages(parsed.description, parsed.images, { fetchImpl, maxTotalBytes: budget });
            imageBudget -= archived.images.reduce((sum, image) => sum + image.bytes, 0);
            // 单条导入的正文上限沿用旧口径（15 题一次导入，响应体不能无限膨胀）；
            // 截断后可能剩下半截图片语法，一并清掉。
            item.description = archived.description.slice(0, 20000).replace(/\n?!\[[^\]]*\]?\([^)]*$/, "");
            if (archived.images.length) item.statementImages = archived.images.map(({ fileName, sha256, mimeType, bytes, data }) => ({ fileName, sha256, mimeType, bytes, data }));
          } catch { /* 正文解析失败时保留题名与难度，描述留空由用户手工填写 */ }
        } else {
          // 回退：解析 <title>（如「P1001 A+B Problem - 洛谷 | ...」）
          const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || "").replace(/\s*-\s*洛谷.*$/i, "");
          const name = title.replace(/^[A-Za-z]?\d+\s*/, "").trim();
          if (name) item.name = name;
        }
        results[index] = item;
      } catch {
        results[index] = fallback(number);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return results;
}

// AtCoder：通过 AtCoder Problems 非官方公开 API（kenkoooo.com）拉取最近 days 天内的 AC 提交，
// 按题目去重（保留最近一次 AC）；题名与难度来自 resources/merged-problems.json。
// 该 API 不提供题面与标签，故与 Codeforces 一致不返回 description；标签需在表单中手动补充。
const ATCODER_SUBMISSIONS_URL = "https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions";
const ATCODER_PROBLEMS_URL = "https://kenkoooo.com/atcoder/resources/merged-problems.json";

export async function fetchAtCoderAccepted(handle, { fetchImpl = fetch, days = 3, maxPages = 5, perPage = 500 } = {}) {
  const h = String(handle || "").trim();
  if (!h) throw Object.assign(new TypeError("请输入 AtCoder 用户名"), { status: 400 });
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  // problem_id → 最近一次 AC 的提交，用于按题去重（保留最近一次）、排序，并生成提交页链接。
  const byProblem = new Map();
  let fromSecond = cutoff;
  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchImpl(`${ATCODER_SUBMISSIONS_URL}?user=${encodeURIComponent(h)}&from_second=${fromSecond}`);
    if (!response.ok) throw Object.assign(new Error("AtCoder 接口不可用，请稍后再试"), { status: 502 });
    const result = await response.json();
    if (!Array.isArray(result) || !result.length) break;
    for (const submission of result) {
      if (submission.result !== "AC" || !submission.problem_id) continue;
      const epoch = Number(submission.epoch_second);
      if (!Number.isFinite(epoch) || epoch < cutoff) continue;
      const prev = byProblem.get(submission.problem_id);
      if (!prev || epoch > prev.epoch) {
        byProblem.set(submission.problem_id, { problemId: submission.problem_id, epoch, submissionId: submission.id, contestId: submission.contest_id });
      }
    }
    // API 按 epoch_second 升序返回、单页最多 perPage 条；满页时以下一条时间续页
    if (result.length < perPage) break;
    const next = Number(result[result.length - 1].epoch_second);
    if (!Number.isFinite(next) || next <= fromSecond) break;
    fromSecond = next + 1;
  }
  const entries = [...byProblem.values()].sort((a, b) => b.epoch - a.epoch);
  if (!entries.length) return [];
  // 补充题名与难度；题库数据拉取失败时降级为仅返回题号，不影响主流程
  let byId = null;
  try {
    const response = await fetchImpl(ATCODER_PROBLEMS_URL);
    if (response.ok) {
      const list = await response.json();
      byId = new Map();
      for (const item of list) if (item && item.id) byId.set(item.id, item);
    }
  } catch {
    byId = null;
  }
  return entries.map(({ problemId, submissionId, contestId }) => {
    const meta = byId ? byId.get(problemId) : null;
    const title = (meta && (meta.title || meta.name)) || "";
    // 提交页是公开的（AtCoder 提交页可直接看源码，不像 CF 受 Cloudflare 保护），
    // 与 CF 导入一样带上直达链接，省得用户自己去翻提交记录。
    const submissionUrl = submissionId && contestId ? `https://atcoder.jp/contests/${encodeURIComponent(contestId)}/submissions/${encodeURIComponent(submissionId)}` : "";
    return {
      name: title || problemId,
      platform: "AtCoder",
      problemNumber: problemId,
      ...(submissionUrl ? { submissionUrl } : {}),
      ...(meta && typeof meta.difficulty === "number" ? { rating: meta.difficulty } : {}),
    };
  });
}

async function handleImport(request, user) {
  const { platform, handle, numbers } = await readJsonBody(request);
  if (platform === "codeforces") {
    if (rateExceeded(`import:codeforces:${user.member}`, RATE_LIMITS["import:codeforces"])) {
      return json(request, { error: "导入请求过于频繁，请稍后再试" }, 429);
    }
    return json(request, { problems: await fetchCodeforcesAccepted(handle) });
  }
  if (platform === "luogu") {
    if (rateExceeded(`import:luogu:${user.member}`, RATE_LIMITS["import:luogu"])) {
      return json(request, { error: "导入请求过于频繁，请稍后再试" }, 429);
    }
    return json(request, { problems: await fetchLuoguProblems(numbers) });
  }
  if (platform === "atcoder") {
    if (rateExceeded(`import:atcoder:${user.member}`, RATE_LIMITS["import:atcoder"])) {
      return json(request, { error: "导入请求过于频繁，请稍后再试" }, 429);
    }
    // 算法标签来自洛谷的 AtCoder 镜像（AtCoder 与 kenkoooo 都不提供）：按比赛批量补，
    // 拿不到就只是没有标签，绝不影响导入本身（见 services/atcoder-tags.mjs）。
    return json(request, { problems: await attachAtCoderTags(await fetchAtCoderAccepted(handle)) });
  }
  return json(request, { error: "不支持的导入平台，可选 codeforces、luogu 或 atcoder" }, 400);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });

    try {
      const authResponse = await handleAuth(request, env);
      if (authResponse) return authResponse;

      // QQ 机器人 Webhook：服务端回调，ed25519 签名鉴权，不经过登录会话/Origin/CSRF
      if (url.pathname === "/api/qq-bot" && request.method === "POST") {
        return await handleQqBotWebhook(request, env, ctx);
      }

      const origin = request.headers.get("Origin");
      if (origin && !ORIGINS.has(origin)) return url.pathname.startsWith("/api/v2/")
        ? v2Error(request, "FORBIDDEN", "不允许的请求来源", 403)
        : json(request, { error: "不允许的请求来源" }, 403);

      if (url.pathname === "/api/logout" && request.method === "DELETE") {
        return json(request, { ok: true }, 200, { "Set-Cookie": cookie(COOKIE, "", 0) });
      }

      const user = await session(request, env);
      // Reading the current session is public; an anonymous visitor is a normal state.
      if (url.pathname === "/api/session" && request.method === "GET") {
        const body = user
          ? { login: user.login, member: user.member, avatar_url: user.avatar_url, csrfToken: user.csrfToken, ...(user.cfHandle ? { cfHandle: user.cfHandle } : {}), ...(user.atcoderHandle ? { atcoderHandle: user.atcoderHandle } : {}) }
          : null;
        return json(request, body, 200, { "Cache-Control": "no-store" });
      }
      if (!user) return url.pathname.startsWith("/api/v2/")
        ? v2Error(request, "AUTH_REQUIRED", "未登录或会话已过期", 401)
        : json(request, { error: "未登录或会话已过期" }, 401);

      if (request.method !== "GET" && (request.headers.get("X-CSRF-Token") || "") !== user.csrfToken) {
        if (url.pathname.startsWith("/api/v2/")) return v2Error(request, "CSRF_FAILED", "CSRF 校验失败", 403);
        return json(request, { error: "CSRF 校验失败" }, 403);
      }

      if (url.pathname.startsWith("/api/v2/")) {
        const logsResponse = await handleLogsV2(request, user, url);
        if (logsResponse) return logsResponse;
        const response = await handleTrainingV2(request, user, url);
        if (response) return response;
      }

      if (url.pathname === "/api/logs/date") {
        return await handleLogsDate(request, user);
      }
      if (url.pathname === "/api/summarize" && request.method === "POST") {
        return await handleSummarize(request, user, env);
      }
      if (url.pathname === "/api/problem-statement" && request.method === "POST") {
        return await handleProblemStatement(request, user);
      }
      if (url.pathname === "/api/import" && request.method === "POST") {
        return await handleImport(request, user);
      }

      return url.pathname.startsWith("/api/v2/")
        ? v2Error(request, "NOT_FOUND", "训练接口不存在", 404)
        : json(request, { error: "Not found" }, 404);
    } catch (error) {
      console.error(error);
      if (url.pathname.startsWith("/api/v2/")) {
        const status = error.status || (error.code === "VERSION_CONFLICT" ? 409 : error instanceof TypeError ? 422 : 500);
        const code = error.code || (status === 401 ? "AUTH_REQUIRED" : status === 409 ? "VERSION_CONFLICT" : status === 422 ? "VALIDATION_FAILED" : status >= 500 ? "UPSTREAM_UNAVAILABLE" : "VALIDATION_FAILED");
        const extra = error.currentRevision ? { currentRevision: error.currentRevision } : {};
        return v2Error(request, code, status >= 500 ? "训练数据服务暂时不可用" : error.message, status, extra);
      }
      const code = error.status || 500;
      const message = error.status && error.status < 500 ? error.message : "服务器内部错误";
      // 条件写入失败时把当前版本回给客户端，便于刷新或重新加载；HEAD 无法稳定取得，故省略。
      return json(request, {
        error: message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.currentRevision ? { currentRevision: error.currentRevision } : {}),
      }, code);
    }
  },
};
