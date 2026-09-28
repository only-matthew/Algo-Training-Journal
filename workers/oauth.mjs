import { isDateString, LOG_LIMITS, LOG_SCHEMA_VERSION } from "../lib/log-schema.mjs";
import { toUtc8 } from "../lib/constants.mjs";
import { handleQqBotWebhook } from "./qq-bot.mjs";
import { isUuidV4 } from "../lib/training-schema.mjs";
import { fetchStatement, parseAtCoderProblemNumber, statementFromAtCoderHtml, statementFromCodeforcesHtml } from "./services/problem-statement.mjs";
import { attachAtCoderTags, resolveAtCoderTagIds } from "./services/atcoder-tags.mjs";
import { fetchCodeforcesAccepted, fetchLuoguProblems, fetchAtCoderAccepted } from "./services/problem-import.mjs";
import { summarizeDescription } from "./services/summary.mjs";
import { expectedVersionFrom } from "./services/log-version.mjs";
import { saveLog, readLog, deleteLog } from "./services/legacy-logs.mjs";
import { handleTrainingV2 } from "./routes/training-v2.mjs";
import { handleLogsV2 } from "./routes/logs-v2.mjs";
import { memberByGithubId, memberById, memberByLogin } from "./member-config.mjs";
import { gh } from "./storage/github-api.mjs";

const COOKIE = "__Host-journal_session";
const OAUTH_COOKIE = "__Host-journal_oauth";
const LEGACY_COOKIE = "journal_session";
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
function safeReturnTo(value) { try { const url = new URL(value || "https://train.xialiao.org/"); return ORIGINS.has(url.origin) ? url.toString() : "https://train.xialiao.org/"; } catch { return "https://train.xialiao.org/"; } }
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

async function readJsonBody(request, maxBytes = LOG_LIMITS.maxRequestBytes) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maxBytes) throw Object.assign(new RangeError("提交内容超过大小限制"), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw Object.assign(new RangeError("提交内容超过大小限制"), { status: 413 });
  try { return JSON.parse(text); } catch { throw Object.assign(new TypeError("请求内容不是有效的 JSON"), { status: 400 }); }
}
async function session(request, env) {
  const requestCookies = cookies(request);
  const values = [requestCookies[COOKIE], requestCookies[LEGACY_COOKIE]].filter(Boolean);
  for (const value of values) {
    const data = await open(value, env.SESSION_SECRET);
    const member = data && (memberByGithubId(data.githubUserId) || memberById(data.memberId) || memberByLogin(data.login));
    if (member && member.logDirectory === data.member) {
      return {
        ...data,
        memberId: member.memberId,
        githubUserId: member.githubUserId,
        cfHandle: member.cfHandle,
        atcoderHandle: member.atcoderHandle,
      };
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
    const memberConfig = memberByGithubId(githubUser.id);
    if (!memberConfig) return new Response("该用户不在队伍白名单中", { status: 403 });
    const csrfToken = crypto.randomUUID();
    // Session cookie ~600-800 bytes (well under 4KB browser limit)
    const value = await seal({
      token,
      login: githubUser.login,
      member: memberConfig.logDirectory,
      memberId: memberConfig.memberId,
      githubUserId: memberConfig.githubUserId,
      avatar_url: githubUser.avatar_url,
      csrfToken,
      exp: Date.now() + 28800000,
    }, env.SESSION_SECRET);
    return new Response(null, { status: 302, headers: { Location: safeReturnTo(state.returnTo), "Set-Cookie": cookie(COOKIE, value) } });
  }
  return null;
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
// 与 AtCoder（官方页优先、洛谷镜像兜底）；两者都可接收浏览器抓回的官方页源码。
const STATEMENT_PLATFORMS = new Set(["Codeforces", "AtCoder"]);
// 浏览器小书签回传的页面源码上限（与解析层允许的 HTML 上限一致，另留一点 JSON 包装余量）。
const MAX_STATEMENT_HTML_BYTES = 2 * 1024 * 1024 + 4096;

async function handleProblemStatement(request, user) {
  if (rateExceeded(`problem-statement:${user.login}`, RATE_LIMITS["problem-statement"])) {
    return v2Error(request, "RATE_LIMITED", "请求过于频繁，请稍后再试", 429);
  }
  const body = await readJsonBody(request, MAX_STATEMENT_HTML_BYTES);
  if (!body || !STATEMENT_PLATFORMS.has(body.platform) || typeof body.problemNumber !== "string"
    || (body.sourceUrl !== undefined && typeof body.sourceUrl !== "string")
    || (body.html !== undefined && typeof body.html !== "string")) {
    return v2Error(request, "INVALID_JSON", "只支持一个 Codeforces 或 AtCoder 题号", 400);
  }
  // AtCoder 的题号必须能拆出比赛与任务 ID，否则连题目页都拼不出来，不能靠猜。
  if (body.platform === "AtCoder" && !parseAtCoderProblemNumber(body.problemNumber)) {
    return v2Error(request, "INVALID_JSON", "AtCoder 题号必须形如 abc381_a", 400);
  }
  // 浏览器抓回的官方页源码：不再请求上游，直接用对应的官方页解析器处理。
  if (body.html !== undefined) {
    const parseHtml = body.platform === "Codeforces" ? statementFromCodeforcesHtml : statementFromAtCoderHtml;
    return json(request, await parseHtml({ problemNumber: body.problemNumber, html: body.html }));
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

      // Pages 发布前读取线上 Worker 的写入契约，不依赖登录态或部署记录。
      if (url.pathname === "/api/capabilities" && request.method === "GET") {
        return json(request, { logSchema: { min: 1, max: LOG_SCHEMA_VERSION } }, 200, { "Cache-Control": "no-store" });
      }

      if (url.pathname === "/api/logout" && request.method === "DELETE") {
        return json(request, { ok: true }, 200, { "Set-Cookie": cookie(COOKIE, "", 0) });
      }

      const user = await session(request, env);
      // Reading the current session is public; an anonymous visitor is a normal state.
      if (url.pathname === "/api/session" && request.method === "GET") {
        const body = user
          ? { login: user.login, member: user.member, memberId: user.memberId, avatar_url: user.avatar_url, csrfToken: user.csrfToken, ...(user.cfHandle ? { cfHandle: user.cfHandle } : {}), ...(user.atcoderHandle ? { atcoderHandle: user.atcoderHandle } : {}) }
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
        const logsResponse = await handleLogsV2(request, user, url, { v2Json, readJsonBody, requireIdempotencyKey, requireObject });
        if (logsResponse) return logsResponse;
        const response = await handleTrainingV2(request, user, url, { v2Error, v2Json, readJsonBody, parseConditionalRevision, requireIdempotencyKey, requireObject, withoutPreconditions });
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
