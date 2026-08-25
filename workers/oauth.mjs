import { isDateString, LOG_LIMITS, metaFromProblems, validateLogInput } from "../lib/log-schema.mjs";
import { toUtc8 } from "../lib/constants.mjs";
import { handleQqBotWebhook } from "./qq-bot.mjs";

const REPO = "only-matthew/Algo-Training-Journal";
const BRANCH = "main";
const COOKIE = "__Host-journal_session";
const OAUTH_COOKIE = "__Host-journal_oauth";
const LEGACY_COOKIE = "journal_session";
const MEMBERS = { "only-matthew": "廖夏", wzzzzhhhhh: "王梓豪", "seanist-isx": "郭一鸣" };
// 队员预置的 Codeforces 用户名：登录后导入面板自动预填（可在输入框内修改）
const CF_HANDLES = { "only-matthew": "onlymatt", wzzzzhhhhh: "hnuwang", "seanist-isx": "ymguo" };
const ORIGINS = new Set(["https://train.xialiao.org", "http://localhost:3000", "http://localhost:4173", "http://localhost:5000"]);

const RATE_LIMITS = { summarize: { max: 5, windowMs: 60000 }, "import:codeforces": { max: 10, windowMs: 60000 }, "import:luogu": { max: 10, windowMs: 60000 }, "import:atcoder": { max: 10, windowMs: 60000 } };
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
  return origin && ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token", "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS", Vary: "Origin" } : {};
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
  const bytes = encoder.encode(content);
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
  // 1. Get current branch reference and parent commit
  const ref = await gh(`/git/ref/heads/${BRANCH}`, token);
  const parent = await gh(`/git/commits/${ref.object.sha}`, token);

  // 2. Create or delete blobs for all changes
  const treeEntries = await mapConcurrent(changes, 4, async (change) => {
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
    body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }),
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
    return commit(changes, message, token, retry + 1);
  }
  if (!response.ok) {
    console.error(`GitHub ref update failed: ${response.status}`);
    throw Object.assign(new Error("GitHub 更新引用失败"), { status: 502 });
  }
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
      return { ...data, cfHandle: CF_HANDLES[data.login] };
    }
  }
  return null;
}
async function content(path, token) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${encodeURI(path)}?ref=${BRANCH}`, { headers: ghHeaders(token) });
  if (response.status === 404) return null; if (!response.ok) { console.error(`GitHub content fetch failed: ${response.status}`); throw Object.assign(new Error("读取仓库文件失败"), { status: 502 }); }
  return new TextDecoder().decode(Uint8Array.from(atob((await response.json()).content.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
}
// 一次请求列出目录下的所有文件（path + blob sha）；目录不存在返回 null。
// 替代逐文件探测存在性，大幅减少 Contents API 调用次数。
async function listDir(path, token) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${encodeURI(path)}?ref=${BRANCH}`, { headers: ghHeaders(token) });
  if (response.status === 404) return null;
  if (!response.ok) { console.error(`GitHub contents list failed: ${response.status}`); throw Object.assign(new Error("读取仓库目录失败"), { status: 502 }); }
  const body = await response.json();
  if (!Array.isArray(body)) return null;
  return body.filter((entry) => entry.type === "file").map(({ path: p, sha }) => ({ path: p, sha }));
}
async function resolveLogRoot(user, date) {
  const [currentRoot, oldRoot] = logRoots(user.member, date);
  const current = await listDir(currentRoot, user.token);
  if (current !== null) return { root: currentRoot, files: current };
  const old = await listDir(oldRoot, user.token);
  if (old !== null) return { root: oldRoot, files: old };
  return { root: currentRoot, files: null };
}
// 规划一次保存所需的文件变更：删除不再需要的旧文件，仅对内容有变化的文件创建 blob。
// existingFiles 来自目录列表（path -> blob sha），通过本地 SHA-1 对比跳过未变更文件，
// 无需逐文件读取旧内容。
export async function planLogChanges(problems, existingFiles, root, updatedAt) {
  const existing = new Map((existingFiles || []).map((file) => [file.path, file.sha]));
  const desired = new Map();
  desired.set(`${root}/meta.json`, JSON.stringify(metaFromProblems(problems, updatedAt), null, 2));
  problems.forEach((p, i) => {
    const prefix = `${root}/${i}-`;
    desired.set(`${prefix}takeaway.md`, p.takeaway || "未填写");
    if (p.description) desired.set(`${prefix}desc.md`, p.description);
    if (p.code) desired.set(`${prefix}solution.cpp`, p.code);
  });

  const changes = [];
  for (const path of existing.keys()) {
    if (!desired.has(path)) changes.push({ path, delete: true });
  }
  for (const [path, content] of desired) {
    if (existing.get(path) === await gitBlobSha(content)) continue;
    changes.push({ path, content });
  }
  return changes;
}
export async function saveLog(user, date, input) {
  const { problems } = validateLogInput(input);
  const { root, files } = await resolveLogRoot(user, date);
  const updatedAt = toUtc8(new Date());
  const changes = await planLogChanges(problems, files, root, updatedAt);
  await commit(changes, `save(${user.member}): training log for ${date}`, user.token);
  return { problems };
}
export async function readLog(user, date) {
  const { root, files } = await resolveLogRoot(user, date);
  const metaPath = `${root}/meta.json`;
  if (!files || !files.some((file) => file.path === metaPath)) return { problems: [] };
  const raw = await content(metaPath, user.token);
  if (!raw) return { problems: [] };
  const meta = JSON.parse(raw);
  const paths = new Set(files.map((file) => file.path));
  return {
    updatedAt: typeof meta.updatedAt === "string" ? meta.updatedAt : undefined,
    problems: await Promise.all((meta.problems || []).map(async (p, i) => ({
      ...p,
      description: paths.has(`${root}/${i}-desc.md`) ? (await content(`${root}/${i}-desc.md`, user.token)) || "" : "",
      takeaway: paths.has(`${root}/${i}-takeaway.md`) ? (await content(`${root}/${i}-takeaway.md`, user.token)) || "" : "",
      code: paths.has(`${root}/${i}-solution.cpp`) ? (await content(`${root}/${i}-solution.cpp`, user.token)) || "" : "",
    }))),
  };
}
export async function deleteLog(user, date) {
  const { root, files } = await resolveLogRoot(user, date);
  if (!files || !files.length) return { deleted: false };
  const changes = files.map((file) => ({ path: file.path, delete: true }));
  await commit(changes, `delete(${user.member}): training log for ${date}`, user.token);
  return { deleted: true };
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

async function handleLogsDate(request, user) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (!isDateString(date)) return json(request, { error: "日期格式无效" }, 400);
  if (request.method === "GET") return json(request, await readLog(user, date));
  if (request.method === "PUT") return json(request, await saveLog(user, date, await readJsonBody(request)));
  if (request.method === "DELETE") return json(request, await deleteLog(user, date));
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

// 洛谷官方难度分级（与 _lfe/config 的 problemDifficulty 一致，减号统一为 ASCII）
const LUOGU_DIFFICULTY = { 0: "暂无评定", 1: "入门", 2: "普及-", 3: "普及/提高-", 4: "普及+/提高", 5: "提高+/省选-", 6: "省选/NOI-", 7: "NOI/NOI+/CTSC" };

function htmlToText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 洛谷：抓取题目页解析题名、官方难度与题目描述（页面内嵌 lentille-context JSON）。
// 标签为数字 ID 且平台未提供公开的标签名称接口，故不返回；洛谷提交记录 API 需登录态 + CSRF，
// 故导入采用「粘贴题号 → 补全题名/难度/题面」的半自动方案。
export async function fetchLuoguProblems(numbers, { fetchImpl = fetch, concurrency = 3 } = {}) {
  const list = String(numbers || "")
    .split(/[\s,，、;；]+/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z]?\d+$/.test(s))
    .slice(0, 15);
  if (!list.length) throw Object.assign(new TypeError("请至少输入一个洛谷题号，如 P1001"), { status: 400 });

  const fallback = (number) => ({ name: number, platform: "洛谷", problemNumber: number, difficulty: "未标注", description: "" });
  const results = new Array(list.length);
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
        const context = html.match(/<script id="lentille-context" type="application\/json">([\s\S]*?)<\/script>/i);
        const problem = context ? JSON.parse(context[1])?.data?.problem : null;
        if (problem) {
          if (problem.name) item.name = problem.name;
          if (typeof problem.difficulty === "number") item.difficulty = LUOGU_DIFFICULTY[problem.difficulty] || "未标注";
          // content 为对象结构 { description, background, hint, ... }，取 description 字段；
          // 直接 String(对象) 会产生 "[object Object]"
          if (problem.content) {
            const raw = typeof problem.content === "string"
              ? problem.content
              : (problem.content && problem.content.description) || "";
            if (raw) item.description = htmlToText(raw).slice(0, 20000);
          }
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
  // problem_id → 最近一次 AC 时间，用于按题去重并让结果按最新 AC 排序
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
      if (!prev || epoch > prev.epoch) byProblem.set(submission.problem_id, { problemId: submission.problem_id, epoch });
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
  return entries.map(({ problemId }) => {
    const meta = byId ? byId.get(problemId) : null;
    const title = (meta && (meta.title || meta.name)) || "";
    return {
      name: title || problemId,
      platform: "AtCoder",
      problemNumber: problemId,
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
    return json(request, { problems: await fetchAtCoderAccepted(handle) });
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
        return handleQqBotWebhook(request, env, ctx);
      }

      const origin = request.headers.get("Origin");
      if (origin && !ORIGINS.has(origin)) return json(request, { error: "不允许的请求来源" }, 403);

      if (url.pathname === "/api/logout" && request.method === "DELETE") {
        return json(request, { ok: true }, 200, { "Set-Cookie": cookie(COOKIE, "", 0) });
      }

      const user = await session(request, env);
      if (!user) return json(request, { error: "未登录或会话已过期" }, 401);

      if (request.method !== "GET" && (request.headers.get("X-CSRF-Token") || "") !== user.csrfToken) {
        return json(request, { error: "CSRF 校验失败" }, 403);
      }

      if (url.pathname === "/api/session" && request.method === "GET") {
        return json(request, { login: user.login, member: user.member, avatar_url: user.avatar_url, csrfToken: user.csrfToken, ...(user.cfHandle ? { cfHandle: user.cfHandle } : {}) });
      }
      if (url.pathname === "/api/logs/date") {
        return handleLogsDate(request, user);
      }
      if (url.pathname === "/api/summarize" && request.method === "POST") {
        return handleSummarize(request, user, env);
      }
      if (url.pathname === "/api/import" && request.method === "POST") {
        return handleImport(request, user);
      }

      return json(request, { error: "Not found" }, 404);
    } catch (error) {
      console.error(error);
      const code = error.status || 500;
      const message = error.status && error.status < 500 ? error.message : "服务器内部错误";
      return json(request, { error: message }, code);
    }
  },
};
