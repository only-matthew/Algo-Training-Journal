import { isDateString, metaFromProblems, validateLogInput } from "../lib/log-schema.mjs";

const REPO = "only-matthew/Algo-Training-Journal";
const BRANCH = "main";
const COOKIE = "journal_session";
const OAUTH_COOKIE = "journal_oauth";
const MEMBERS = { "only-matthew": "廖夏", wzzzzhhhhh: "王梓豪", "seanist-isx": "郭一鸣" };
const ORIGINS = new Set(["https://train.xialiao.org", "http://localhost:3000", "http://localhost:4173", "http://localhost:5000"]);

function cors(request) {
  const origin = request.headers.get("Origin");
  return origin && ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,PUT,DELETE,OPTIONS", Vary: "Origin" } : {};
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
async function commit(changes, message, token, retry = 0) {
  const ref = await gh(`/git/ref/heads/${BRANCH}`, token); const parent = await gh(`/git/commits/${ref.object.sha}`, token);
  const tree = await Promise.all(changes.map(async (change) => change.delete ? { path: change.path, mode: "100644", type: "blob", sha: null } : { path: change.path, mode: "100644", type: "blob", sha: (await gh("/git/blobs", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: change.content, encoding: "utf-8" }) })).sha }));
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
    if (url.pathname === "/api/logs/date") { const date = url.searchParams.get("date"); if (!isDateString(date)) return json(request, { error: "日期格式无效" }, 400); if (request.method === "GET") return json(request, await readLog(user, date)); if (request.method === "PUT") return json(request, await saveLog(user, date, await request.json())); if (request.method === "DELETE") return json(request, await deleteLog(user, date)); }
    return json(request, { error: "Not found" }, 404);
  } catch (error) { console.error(error); return json(request, { error: error.message || "服务器错误" }, 500); }
} };