import { isDateString, LOG_LIMITS, metaFromProblems, validateLogInput } from "../lib/log-schema.mjs";

const REPO = "only-matthew/Algo-Training-Journal";
const BRANCH = "main";
const COOKIE = "journal_session";
const OAUTH_COOKIE = "journal_oauth";
const MEMBERS = { "only-matthew": "廖夏", wzzzzhhhhh: "王梓豪", "seanist-isx": "郭一鸣" };
const ORIGINS = new Set(["https://train.xialiao.org", "http://localhost:3000", "http://localhost:4173", "http://localhost:5000"]);

function cors(request) {
  const origin = request.headers.get("Origin");
  return origin && ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS", Vary: "Origin" } : {};
}
function json(request, body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(request), ...headers } }); }
function cookies(request) { return Object.fromEntries((request.headers.get("Cookie") || "").split(/;\s*/).filter(Boolean).map((part) => { const i = part.indexOf("="); return [part.slice(0, i), part.slice(i + 1)]; })); }
function cookie(name, value, age = 28800) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`; }
function encode(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function decode(value) { const s = value.replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(s + "=".repeat((4 - s.length % 4) % 4)), (c) => c.charCodeAt(0)); }
async function key(secret) { return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)), "AES-GCM", false, ["encrypt", "decrypt"]); }
async function seal(data, secret) { const iv = crypto.getRandomValues(new Uint8Array(12)); const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), new TextEncoder().encode(JSON.stringify(data)))); const all = new Uint8Array(12 + encrypted.length); all.set(iv); all.set(encrypted, 12); return encode(all); }
async function open(value, secret) { try { const all = decode(value); const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, await key(secret), all.slice(12)); const data = JSON.parse(new TextDecoder().decode(raw)); return data.exp > Date.now() ? data : null; } catch { return null; } }
function safeReturnTo(value) { try { const url = new URL(value || "https://train.xialiao.org/"); return ORIGINS.has(url.origin) ? url.toString() : "https://train.xialiao.org/"; } catch { return "https://train.xialiao.org/"; } }
function ghHeaders(token) { return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Algo-Training-Journal-Worker", "X-GitHub-Api-Version": "2022-11-28" }; }
async function gh(path, token, options = {}) { const response = await fetch(path.startsWith("http") ? path : `https://api.github.com/repos/${REPO}${path}`, { ...options, headers: { ...ghHeaders(token), ...(options.headers || {}) } }); if (!response.ok) throw new Error(`GitHub API ${response.status}: ${(await response.text()).slice(0, 200)}`); return response.status === 204 ? null : response.json(); }
async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length); let next = 0;
  async function worker() { while (next < items.length) { const index = next++; results[index] = await mapper(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker)); return results;
}
async function readJsonBody(request) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > LOG_LIMITS.maxRequestBytes) throw Object.assign(new RangeError("提交内容不能超过 1.5 MB"), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > LOG_LIMITS.maxRequestBytes) throw Object.assign(new RangeError("提交内容不能超过 1.5 MB"), { status: 413 });
  try { return JSON.parse(text); } catch { throw Object.assign(new TypeError("请求内容不是有效的 JSON"), { status: 400 }); }
}
async function commit(changes, message, token, retry = 0) {
  const ref = await gh(`/git/ref/heads/${BRANCH}`, token); const parent = await gh(`/git/commits/${ref.object.sha}`, token);
  const tree = await mapConcurrent(changes, 4, async (change) => change.delete ? { path: change.path, mode: "100644", type: "blob", sha: null } : { path: change.path, mode: "100644", type: "blob", sha: (await gh("/git/blobs", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: change.content, encoding: "utf-8" }) })).sha });
  const nextTree = await gh("/git/trees", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base_tree: parent.tree.sha, tree }) });
  const nextCommit = await gh("/git/commits", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, tree: nextTree.sha, parents: [ref.object.sha] }) });
  const response = await fetch(`https://api.github.com/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: "PATCH", headers: { ...ghHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify({ sha: nextCommit.sha, force: false }) });
  if (response.status === 422 && retry < 2) return commit(changes, message, token, retry + 1);
  if (!response.ok) throw new Error(`GitHub API ${response.status}`);
}
function dir(member, date) { const [y, m, d] = date.split("-"); return `logs/${member}/${y}/${m}/${d}`; }
async function session(request, env) { const data = await open(cookies(request)[COOKIE] || "", env.SESSION_SECRET); return data && MEMBERS[data.login] === data.member ? data : null; }
async function content(path, token) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${encodeURI(path)}?ref=${BRANCH}`, { headers: ghHeaders(token) });
  if (response.status === 404) return null; if (!response.ok) throw new Error(`GitHub API ${response.status}`);
  return new TextDecoder().decode(Uint8Array.from(atob((await response.json()).content.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
}
async function saveLog(user, date, input) {
  const { problems } = validateLogInput(input); const root = dir(user.member, date); const oldRaw = await content(`${root}/meta.json`, user.token); const oldCount = oldRaw ? JSON.parse(oldRaw).problems?.length || 0 : 0; const changes = [{ path: `${root}/meta.json`, content: JSON.stringify(metaFromProblems(problems), null, 2) }];
  problems.forEach((p, i) => { changes.push({ path: `${root}/${i}-takeaway.md`, content: p.takeaway || "未填写" }); changes.push(p.description ? { path: `${root}/${i}-desc.md`, content: p.description } : { path: `${root}/${i}-desc.md`, delete: true }); changes.push(p.code ? { path: `${root}/${i}-solution.cpp`, content: p.code } : { path: `${root}/${i}-solution.cpp`, delete: true }); });
  for (let i = problems.length; i < oldCount; i++) for (const suffix of ["desc.md", "takeaway.md", "solution.cpp"]) changes.push({ path: `${root}/${i}-${suffix}`, delete: true });
  const existing = []; for (const change of changes) if (!change.delete || await content(change.path, user.token) !== null) existing.push(change);
  await commit(existing, `save(${user.member}): training log for ${date}`, user.token); return { problems };
}
async function readLog(user, date) {
  const root = dir(user.member, date); const raw = await content(`${root}/meta.json`, user.token); if (!raw) return { problems: [] }; const meta = JSON.parse(raw);
  return { problems: await Promise.all((meta.problems || []).map(async (p, i) => ({ ...p, description: await content(`${root}/${i}-desc.md`, user.token) || "", takeaway: await content(`${root}/${i}-takeaway.md`, user.token) || "", code: await content(`${root}/${i}-solution.cpp`, user.token) || "" }))) };
}
async function deleteLog(user, date) { const root = dir(user.member, date); const raw = await content(`${root}/meta.json`, user.token); if (!raw) return { deleted: false }; const count = JSON.parse(raw).problems?.length || 0; const changes = [{ path: `${root}/meta.json`, delete: true }]; for (let i = 0; i < count; i++) for (const suffix of ["desc.md", "takeaway.md", "solution.cpp"]) { const path = `${root}/${i}-${suffix}`; if (await content(path, user.token) !== null) changes.push({ path, delete: true }); } await commit(changes, `delete(${user.member}): training log for ${date}`, user.token); return { deleted: true }; }

async function summarizeDescription(ai, description) {
  if (!ai) return null;
  const text = String(description || "").trim();
  if (!text || text.length < 20) return null;

  const result = await ai.run("@cf/qwen/qwen3-30b-a3b-fp8", {
    max_tokens: 120,
    temperature: 0.15,
    messages: [
      { role: "system", content: "你是算法竞赛题意压缩助手。仅依据用户给出的题面，用一句不超过60个汉字的中文概括：处理什么对象、要求计算或判断什么、最关键的约束或优化目标。不要猜测解法，不要列点，不要标题、引号、Markdown、解释或思考过程。" },
      { role: "user", content: text.slice(0, 6000) },
    ],
  });
  const summary = String(result.response || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^(?:概括|摘要|题意)\s*[:：]\s*/i, "")
    .replace(/^[“”"']+|[“”"']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return summary ? summary.slice(0, 120) : null;
}

export default { async fetch(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
  try {
    if (url.pathname === "/" && url.searchParams.has("code")) { const returnTo = safeReturnTo(url.searchParams.get("state")); return Response.redirect(`${url.origin}/auth/login?returnTo=${encodeURIComponent(returnTo)}`, 302); }
    if (url.pathname === "/auth/login") { const nonce = crypto.randomUUID(); const state = await seal({ nonce, returnTo: safeReturnTo(url.searchParams.get("returnTo")), exp: Date.now() + 600000 }, env.SESSION_SECRET); const callback = `${url.origin}/auth/callback`; const location = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(env.GITHUB_CLIENT_ID)}&scope=public_repo&redirect_uri=${encodeURIComponent(callback)}&state=${encodeURIComponent(state)}`; return new Response(null, { status: 302, headers: { Location: location, "Set-Cookie": cookie(OAUTH_COOKIE, nonce, 600) } }); }
    if (url.pathname === "/auth/callback") { const state = await open(url.searchParams.get("state") || "", env.SESSION_SECRET); if (!state || state.nonce !== cookies(request)[OAUTH_COOKIE]) return new Response("Invalid OAuth state", { status: 400 }); const tokenResponse = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get("code") }) }); const token = (await tokenResponse.json()).access_token; if (!token) return new Response("OAuth failed", { status: 400 }); const githubUser = await gh("https://api.github.com/user", token); const member = MEMBERS[githubUser.login]; if (!member) return new Response("该用户不在队伍白名单中", { status: 403 }); const value = await seal({ token, login: githubUser.login, member, avatar_url: githubUser.avatar_url, exp: Date.now() + 28800000 }, env.SESSION_SECRET); return new Response(null, { status: 302, headers: { Location: safeReturnTo(state.returnTo), "Set-Cookie": cookie(COOKIE, value) } }); }
    const origin = request.headers.get("Origin");
    if (origin && !ORIGINS.has(origin)) return json(request, { error: "不允许的请求来源" }, 403);
    if (url.pathname === "/api/logout" && request.method === "DELETE") return json(request, { ok: true }, 200, { "Set-Cookie": cookie(COOKIE, "", 0) });
    const user = await session(request, env); if (!user) return json(request, { error: "未登录或会话已过期" }, 401);
    if (url.pathname === "/api/session" && request.method === "GET") return json(request, { login: user.login, member: user.member, avatar_url: user.avatar_url });
    if (url.pathname === "/api/logs/date") { const date = url.searchParams.get("date"); if (!isDateString(date)) return json(request, { error: "日期格式无效" }, 400); if (request.method === "GET") return json(request, await readLog(user, date)); if (request.method === "PUT") return json(request, await saveLog(user, date, await readJsonBody(request))); if (request.method === "DELETE") return json(request, await deleteLog(user, date)); }
    if (url.pathname === "/api/summarize" && request.method === "POST") {
      const { description } = await readJsonBody(request);
      if (!description || typeof description !== "string" || !description.trim()) return json(request, { error: "请提供题目描述" }, 400);
      if (description.length > 20000) return json(request, { error: "题目描述过长，请控制在 20000 字以内" }, 413);
      const summary = await summarizeDescription(env.AI, description);
      if (!summary) return json(request, { error: "生成失败，请检查描述内容" }, 422);
      return json(request, { summary });
    }
    return json(request, { error: "Not found" }, 404);
  } catch (error) { console.error(error); const status = error.status || (error instanceof TypeError || error instanceof RangeError ? 400 : 500); return json(request, { error: error.message || "服务器错误" }, status); }
} };
