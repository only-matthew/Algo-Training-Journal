import { normalizeProblemNumber } from "../../lib/problem-identity.mjs";

export const CF_STATEMENT_PARSER_VERSION = "cf-html-v2";
export const LUOGU_STATEMENT_PARSER_VERSION = "luogu-mirror-v1";
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_MARKDOWN = 100_000;
const CF_ORIGIN = "https://codeforces.com/";
const LUOGU_ORIGIN = "https://www.luogu.com.cn";
// codeforces.com 的题面页挂在 Cloudflare 后面：机房出口（含 Workers）大多只拿到
// 403「Just a moment」挑战页。浏览器请求头能提高直取成功率，但不保证通过，
// 也不做任何验证码绕过——拿不到时按规范降级。
const BROWSER_HEADERS = Object.freeze({
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
});
const unavailable = (problemNumber, reason, retryable = false) => ({ status: "unavailable", problemNumber, reason, retryable });
const fail = (message) => { throw new Error(message); };
const classes = (node) => (node?.attrs?.class || "").toLowerCase().split(/\s+/).filter(Boolean);
const hasClass = (node, name) => classes(node).includes(name);
function findFirst(node, predicate) { if (predicate(node)) return node; for (const child of node.children || []) { const hit = findFirst(child, predicate); if (hit) return hit; } return null; }
function decode(value) { return String(value || "").replace(/&(#x[\da-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi, (_all, entity) => { const e = entity.toLowerCase(); const named = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }; if (e in named) return named[e]; const n = e.startsWith("#x") ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10); try { return Number.isFinite(n) ? String.fromCodePoint(n) : _all; } catch { return _all; } }); }

// A small dependency-free tree reader. It retains nested text and preformatted code,
// unlike a tag-stripping regex, and avoids Node-only DOM packages in the Worker bundle.
function parseHtml(html) {
  const root = { tag: "root", attrs: {}, children: [] }; const stack = [root];
  const tokens = /<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>|[^<]+|</g; const voids = new Set(["br", "img", "hr", "meta", "link", "input", "source", "wbr"]); let match;
  while ((match = tokens.exec(html))) { const raw = match[0];
    if (raw[0] !== "<") { stack.at(-1).children.push({ text: decode(raw) }); continue; }
    if (/^<\//.test(raw)) { const name = /^<\/\s*([^\s>]+)/.exec(raw)?.[1]?.toLowerCase(); for (let i = stack.length - 1; i > 0; i -= 1) if (stack[i].tag === name) { stack.length = i; break; } continue; }
    if (/^<!/.test(raw)) continue; const name = /^<\s*([^\s/>]+)/.exec(raw)?.[1]?.toLowerCase(); if (!name) continue;
    const attrs = {}; for (const a of raw.slice(name.length + 1, -1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) { if (a[1]) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? ""); }
    const node = { tag: name, attrs, children: [] }; stack.at(-1).children.push(node); if (!voids.has(name) && !/\/>\s*$/.test(raw)) stack.push(node);
  } return root;
}
const textOf = (node) => (node.children || []).map((child) => child.text ?? textOf(child)).join("");
// Collapse only excess blank lines; leading spaces inside fenced samples are data.
const tidy = (value) => String(value).replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const codeText = (node) => textOf(node).replace(/\r\n?/g, "\n").replace(/^\n|\n$/g, "");
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function safeUrl(value, image = false, base = CF_ORIGIN) { try { const url = new URL(value, base); return url.protocol === "https:" && !url.username && !url.password && (!image || url.hostname) ? url.toString() : ""; } catch { return ""; } }
function markdownFrom(node, warnings, context = {}) {
  if (node.text !== undefined) return context.pre ? node.text : node.text.replace(/\$\$\$([\s\S]*?)\$\$\$/g, (_all, f) => `$${f}$`).replace(/\s+/g, " ");
  const children = (extra = {}) => (node.children || []).map((part) => markdownFrom(part, warnings, { ...context, ...extra })).join(""); const tag = node.tag;
  // 脚本与样式在题面里没有语义，任何来源都不应把它们的源码混进正文。
  if (tag === "script" || tag === "style") return "";
  if (tag === "pre") { const value = codeText(node); return `\n\n\`\`\`\n${value}${value.endsWith("\n") ? "" : "\n"}\`\`\`\n\n`; }
  if (tag === "br") return "\n";
  if (tag === "img") { const url = safeUrl(node.attrs.src, true, context.base); if (!url) return ""; warnings.add("external-images"); return `![${tidy(node.attrs.alt || "image").replace(/[\[\]]/g, "\\$")}](${url})`; }
  if (tag === "a") { const label = tidy(children()) || tidy(node.attrs.href); const url = safeUrl(node.attrs.href, false, context.base); return url ? `[${label}](${url})` : label; }
  if (tag === "sup") return `^(${tidy(children())})`; if (tag === "sub") return `_(${tidy(children())})`;
  if (hasClass(node, "test-example-line")) return `${children()}\n`;
  if (hasClass(node, "tex-span")) return `$${tidy(textOf(node)).replace(/^\$+|\$+$/g, "")}$`;
  if (hasClass(node, "tex-block")) return `\n\n$$\n${tidy(textOf(node)).replace(/^\$+|\$+$/g, "")}\n$$\n\n`;
  if (tag === "table") return tableMarkdown(node, warnings, context);
  if (/^h[1-6]$/.test(tag)) return `\n\n${"#".repeat(Number(tag[1]))} ${tidy(children())}\n\n`; if (tag === "li") return `\n- ${tidy(children())}`;
  if (tag === "p") return `\n\n${children()}\n\n`; if (["div", "section", "ul", "ol"].includes(tag)) return `\n${children()}\n`; return children();
}
// 表格按 GFM 输出：首行是 th 时补一行分隔符，否则渲染端只会看到一堆竖线文本。
function tableMarkdown(node, warnings, context) {
  const rows = (node.children || []).filter((child) => child.tag === "tr");
  if (!rows.length) return "";
  const cellsOf = (row) => (row.children || []).filter((child) => child.tag === "td" || child.tag === "th").map((cell) => tidy(markdownFrom(cell, warnings, context)).replace(/\|/g, "\\|"));
  const lines = rows.map((row) => `| ${cellsOf(row).join(" | ")} |`);
  if ((rows[0].children || []).some((child) => child.tag === "th")) lines.splice(1, 0, `| ${cellsOf(rows[0]).map(() => "---").join(" | ")} |`);
  return `\n\n${lines.join("\n")}\n\n`;
}
function sectionTitle(node) { if (hasClass(node, "input-specification")) return "Input"; if (hasClass(node, "output-specification")) return "Output"; if (hasClass(node, "note")) return "Note"; if (hasClass(node, "interaction")) return "Interaction"; return ""; }

export function parseCodeforcesProblemNumber(problemNumber) { const normalized = normalizeProblemNumber(problemNumber); const match = /^(\d+)([A-Z][A-Z0-9]*)$/.exec(normalized || ""); return match ? { contestId: match[1], index: match[2], problemNumber: normalized } : null; }
export function validateCodeforcesUrl(value, problemNumber) {
  const expected = parseCodeforcesProblemNumber(problemNumber); if (!expected) throw Object.assign(new TypeError("Codeforces 题号必须形如 123A"), { status: 400, code: "INVALID_REQUEST" });
  const url = new URL(value || `https://codeforces.com/problemset/problem/${expected.contestId}/${expected.index}?locale=en`);
  if (url.protocol !== "https:" || url.hostname !== "codeforces.com" || url.username || url.password || url.port) throw Object.assign(new TypeError("题面地址必须是 codeforces.com HTTPS 地址"), { status: 400, code: "INVALID_REQUEST" });
  const match = /^\/(problemset\/problem|contest|gym)\/(\d+)(?:\/problem)?\/([A-Za-z][A-Za-z0-9]*)\/?$/.exec(url.pathname);
  if (!match || match[2] !== expected.contestId || match[3].toUpperCase() !== expected.index) throw Object.assign(new TypeError("题面地址与题号不一致"), { status: 400, code: "INVALID_REQUEST" });
  url.search = "?locale=en"; url.hash = ""; return url;
}
export function parseCodeforcesStatement(html, expectedProblemNumber) {
  const document = parseHtml(html); const container = findFirst(document, (node) => node.tag === "div" && hasClass(node, "problem-statement"));
  if (!container) fail(/captcha|challenge|access denied|cloudflare/i.test(html) ? "blocked" : "parse-failed");
  const header = findFirst(container, (node) => node.tag === "div" && hasClass(node, "header")); const titleNode = findFirst(header || container, (node) => node.tag === "div" && hasClass(node, "title"));
  // 限制块里嵌着 .property-title（"time limit per test"），那是标签不是限制本身，不能拼进正文。
  const propertyText = (node) => tidy((node.children || []).filter((child) => !(child.tag === "div" && hasClass(child, "property-title"))).map((child) => child.text ?? textOf(child)).join(""));
  const title = tidy(textOf(titleNode || { children: [] })); const time = propertyText(findFirst(header || container, (node) => node.tag === "div" && hasClass(node, "time-limit")) || { children: [] }); const memory = propertyText(findFirst(header || container, (node) => node.tag === "div" && hasClass(node, "memory-limit")) || { children: [] });
  if (!header || !title || (!time && !memory)) fail("parse-failed"); const expected = expectedProblemNumber && parseCodeforcesProblemNumber(expectedProblemNumber); if (expected && !new RegExp(`^${escapeRegex(expected.index)}\\s*\\.`, "i").test(title)) fail("parse-failed");
  const warnings = new Set(); const parts = []; for (const node of container.children || []) { if (node === header) continue; const heading = sectionTitle(node); if (heading) parts.push(`## ${heading}`); parts.push(markdownFrom(node, warnings)); } const body = tidy(parts.join("\n"));
  if (!body) { if (findFirst(container, (node) => node.tag === "a" && /\.pdf(?:$|[?#])/i.test(node.attrs.href || ""))) fail("unsupported"); fail("parse-failed"); }
  const description = tidy([`# ${title}`, time && `时间限制：${time}`, memory && `内存限制：${memory}`, body].filter(Boolean).join("\n\n")); if (description.length > MAX_MARKDOWN) fail("too-large"); return { description, warnings: [...warnings] };
}
async function readLimitedBody(response, signal) {
  if (Number(response.headers.get("Content-Length") || 0) > MAX_HTML_BYTES) fail("too-large"); if (!response.body?.getReader) { const value = await response.text(); if (new TextEncoder().encode(value).byteLength > MAX_HTML_BYTES) fail("too-large"); return value; }
  const reader = response.body.getReader(); const chunks = []; let bytes = 0; try { while (true) { if (signal.aborted) fail("timeout"); const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > MAX_HTML_BYTES) { await reader.cancel(); fail("too-large"); } chunks.push(part.value); } } finally { reader.releaseLock(); } return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}
// 题面正文失败与网络失败用同一套降级原因，供两个来源共用。
const failureReason = (error, signal) => signal.aborted || error?.message === "timeout" ? "timeout" : ["too-large", "unsupported", "blocked"].includes(error?.message) ? error.message : "parse-failed";
const REASONS_RETRYABLE = new Set(["timeout", "upstream-error"]);

export async function fetchCodeforcesStatement({ problemNumber, sourceUrl }, { fetchImpl = fetch, now = () => new Date().toISOString(), timeoutMs = 12000 } = {}) {
  let url = validateCodeforcesUrl(sourceUrl, problemNumber); const normalized = parseCodeforcesProblemNumber(problemNumber).problemNumber; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { for (let redirects = 0; redirects <= 2; redirects += 1) { let response; try { response = await fetchImpl(url.toString(), { redirect: "manual", signal: controller.signal, headers: BROWSER_HEADERS }); } catch (error) { return unavailable(normalized, error?.name === "AbortError" || controller.signal.aborted ? "timeout" : "upstream-error", true); }
    if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get("Location"); if (!location || redirects === 2) return unavailable(normalized, "blocked"); try { url = validateCodeforcesUrl(new URL(location, url).toString(), normalized); } catch { return unavailable(normalized, "blocked"); } continue; }
    if (response.status === 404) return unavailable(normalized, "not-found"); if (response.status === 403 || !response.ok) return unavailable(normalized, response.status >= 500 ? "upstream-error" : "blocked", response.status >= 500);
    try { const parsed = parseCodeforcesStatement(await readLimitedBody(response, controller.signal), normalized); return { status: "ok", problemNumber: normalized, description: parsed.description, source: { kind: "codeforces-html", url: url.toString(), fetchedAt: now(), parserVersion: CF_STATEMENT_PARSER_VERSION }, warnings: parsed.warnings }; } catch (error) { const reason = failureReason(error, controller.signal); return unavailable(normalized, reason, REASONS_RETRYABLE.has(reason)); }
  } } finally { clearTimeout(timer); } return unavailable(normalized, "blocked");
}

// 洛谷题面镜像：codeforces.com 被 Cloudflare 拦下时，用洛谷同题页面兜底。
// 洛谷对匿名请求先下发 C3VK 挑战 cookie（302 回跳同 URL），带 cookie 再请求即可拿到页面；
// 这个握手与 scripts/fetch-luogu-meta.mjs、洛谷导入走的是同一条链路。
const LUOGU_CONTEXT = /<script[^>]*id=["']lentille-context["'][^>]*>([\s\S]*?)<\/script>/i;
const LUOGU_SECTIONS = [["background", "背景"], ["description", "题目描述"], ["formatI", "输入格式"], ["formatO", "输出格式"], ["hint", "说明/提示"]];
const isChallengePage = (html) => /captcha|challenge|access denied|cloudflare|just a moment/i.test(html);
export const LUOGU_MIRROR_WARNING = "mirror-source";

function setCookies(response) {
  const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const raw = list.length ? list : [response.headers.get("set-cookie")].filter(Boolean);
  return raw.flatMap((value) => String(value).split(/,(?=[^;,=]+=)/)).map((value) => value.split(";")[0].trim()).filter(Boolean);
}
function sampleBlock(sample, index) {
  const value = (key) => String(sample[key] ?? "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  const fence = (text) => ["```", text, "```"].join("\n");
  return [`### 样例 ${index + 1}`, "输入：", fence(value("in") || value("input")), "输出：", fence(value("out") || value("output"))].join("\n");
}
export function parseLuoguStatement(html, expectedProblemNumber) {
  const expected = expectedProblemNumber && parseCodeforcesProblemNumber(expectedProblemNumber); const context = LUOGU_CONTEXT.exec(html);
  if (!context) fail(isChallengePage(html) ? "blocked" : "parse-failed");
  let problem; try { problem = JSON.parse(context[1])?.data?.problem; } catch { fail("parse-failed"); }
  if (!problem || typeof problem !== "object") fail("parse-failed");
  // pid 是洛谷自己的题目身份；缺失时不再猜，URL 本来就是按题号拼出来的。
  const pid = String(problem.pid || "").toUpperCase(); const expectedPid = expected ? `CF${expected.contestId}${expected.index}` : "";
  if (pid && expectedPid && pid !== expectedPid) fail("parse-failed");
  const warnings = new Set(); const parts = []; const render = (raw) => tidy(markdownFrom(parseHtml(raw), warnings, { base: LUOGU_ORIGIN }));
  if (typeof problem.content === "string") { const body = render(problem.content); if (body) parts.push(body); }
  else if (problem.content && typeof problem.content === "object") for (const [key, label] of LUOGU_SECTIONS) { const raw = problem.content[key]; if (typeof raw !== "string" || !raw.trim()) continue; const body = render(raw); if (body) parts.push(`## ${label}`, body); }
  // 样例可能嵌在正文里，也可能单列在 samples：后者只在正文没有代码块时补，避免重复。
  const samples = Array.isArray(problem.samples) ? problem.samples.filter((sample) => sample && typeof sample === "object" && !Array.isArray(sample)) : [];
  if (samples.length && !parts.join("\n").includes("```")) parts.push(...samples.map((sample, index) => sampleBlock(sample, index)));
  const title = tidy(problem.title || problem.name || (problem.content && typeof problem.content === "object" ? problem.content.name : "") || "");
  const body = tidy(parts.join("\n")); if (!body) fail("parse-failed");
  const description = tidy([title && `# ${title}`, body].filter(Boolean).join("\n\n")); if (description.length > MAX_MARKDOWN) fail("too-large");
  return { description, warnings: [...warnings] };
}
export async function fetchLuoguStatement({ problemNumber }, { fetchImpl = fetch, now = () => new Date().toISOString(), timeoutMs = 12000 } = {}) {
  const expected = parseCodeforcesProblemNumber(problemNumber); const normalized = expected ? expected.problemNumber : normalizeProblemNumber(problemNumber);
  if (!expected) return unavailable(normalized, "parse-failed");
  const url = `${LUOGU_ORIGIN}/problem/CF${expected.contestId}${expected.index}`;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { ...BROWSER_HEADERS, "Accept-Language": "zh-CN,zh;q=0.9" }; const send = (extra = {}) => fetchImpl(url, { redirect: "manual", signal: controller.signal, headers: { ...headers, ...extra } });
  try {
    let response; try { response = await send(); } catch (error) { return unavailable(normalized, error?.name === "AbortError" || controller.signal.aborted ? "timeout" : "upstream-error", true); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      // 挑战 cookie 可能挂在这次 302 上，也可能要再请求一次才下发。
      let cookies = setCookies(response);
      if (!cookies.length) { try { cookies = setCookies(await send()); } catch { cookies = []; } }
      if (!cookies.length) return unavailable(normalized, "blocked");
      try { response = await send({ Cookie: cookies.join("; ") }); } catch (error) { return unavailable(normalized, error?.name === "AbortError" || controller.signal.aborted ? "timeout" : "upstream-error", true); }
      if ([301, 302, 303, 307, 308].includes(response.status)) return unavailable(normalized, "blocked");
    }
    if (response.status === 404) return unavailable(normalized, "not-found");
    if (response.status === 403 || !response.ok) return unavailable(normalized, response.status >= 500 ? "upstream-error" : "blocked", response.status >= 500);
    try { const parsed = parseLuoguStatement(await readLimitedBody(response, controller.signal), normalized); return { status: "ok", problemNumber: normalized, description: parsed.description, source: { kind: "luogu-mirror", url, fetchedAt: now(), parserVersion: LUOGU_STATEMENT_PARSER_VERSION }, warnings: [LUOGU_MIRROR_WARNING, ...parsed.warnings] }; } catch (error) { const reason = failureReason(error, controller.signal); return unavailable(normalized, reason, REASONS_RETRYABLE.has(reason)); }
  } finally { clearTimeout(timer); }
}

// 抓取入口：先取官方英文题面，被反爬拦下（或解析失败）时退回洛谷镜像，
// 两个来源共用同一个总时限；主来源的失败原因最终回给前端，镜像失败不改变它。
export async function fetchStatement({ problemNumber, sourceUrl }, { fetchImpl = fetch, now = () => new Date().toISOString(), timeoutMs = 12000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => deadline - Date.now();
  const primary = await fetchCodeforcesStatement({ problemNumber, sourceUrl }, { fetchImpl, now, timeoutMs: Math.max(1000, Math.round(remaining() * 0.6)) });
  if (primary.status === "ok" || primary.reason === "not-found") return primary;
  const budget = remaining();
  if (budget < 1000) return primary;
  const mirror = await fetchLuoguStatement({ problemNumber }, { fetchImpl, now, timeoutMs: budget });
  return mirror.status === "ok" ? mirror : primary;
}
