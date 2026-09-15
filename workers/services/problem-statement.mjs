import { normalizeProblemNumber } from "../../lib/problem-identity.mjs";

export const CF_STATEMENT_PARSER_VERSION = "cf-html-v2";
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_MARKDOWN = 100_000;
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
function safeUrl(value, image = false) { try { const url = new URL(value, "https://codeforces.com/"); return url.protocol === "https:" && !url.username && !url.password && (!image || url.hostname) ? url.toString() : ""; } catch { return ""; } }
function markdownFrom(node, warnings, context = {}) {
  if (node.text !== undefined) return context.pre ? node.text : node.text.replace(/\$\$\$([\s\S]*?)\$\$\$/g, (_all, f) => `$${f}$`).replace(/\s+/g, " ");
  const children = (extra = {}) => (node.children || []).map((part) => markdownFrom(part, warnings, { ...context, ...extra })).join(""); const tag = node.tag;
  if (tag === "pre") { const value = codeText(node); return `\n\n\`\`\`\n${value}${value.endsWith("\n") ? "" : "\n"}\`\`\`\n\n`; }
  if (tag === "br") return "\n";
  if (tag === "img") { const url = safeUrl(node.attrs.src, true); if (!url) return ""; warnings.add("external-images"); return `![${tidy(node.attrs.alt || "image").replace(/[\[\]]/g, "\\$")}](${url})`; }
  if (tag === "a") { const label = tidy(children()) || tidy(node.attrs.href); const url = safeUrl(node.attrs.href); return url ? `[${label}](${url})` : label; }
  if (tag === "sup") return `^(${tidy(children())})`; if (tag === "sub") return `_(${tidy(children())})`;
  if (hasClass(node, "test-example-line")) return `${children()}\n`;
  if (hasClass(node, "tex-span")) return `$${tidy(textOf(node)).replace(/^\$+|\$+$/g, "")}$`;
  if (hasClass(node, "tex-block")) return `\n\n$$\n${tidy(textOf(node)).replace(/^\$+|\$+$/g, "")}\n$$\n\n`;
  if (/^h[1-6]$/.test(tag)) return `\n\n${"#".repeat(Number(tag[1]))} ${tidy(children())}\n\n`; if (tag === "li") return `\n- ${tidy(children())}`;
  if (tag === "p") return `\n\n${children()}\n\n`; if (["div", "section", "ul", "ol"].includes(tag)) return `\n${children()}\n`; return children();
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
  const title = tidy(textOf(titleNode || { children: [] })); const time = tidy(textOf(findFirst(header || container, (node) => node.tag === "div" && hasClass(node, "time-limit")) || { children: [] })); const memory = tidy(textOf(findFirst(header || container, (node) => node.tag === "div" && hasClass(node, "memory-limit")) || { children: [] }));
  if (!header || !title || (!time && !memory)) fail("parse-failed"); const expected = expectedProblemNumber && parseCodeforcesProblemNumber(expectedProblemNumber); if (expected && !new RegExp(`^${escapeRegex(expected.index)}\\s*\\.`, "i").test(title)) fail("parse-failed");
  const warnings = new Set(); const parts = []; for (const node of container.children || []) { if (node === header) continue; const heading = sectionTitle(node); if (heading) parts.push(`## ${heading}`); parts.push(markdownFrom(node, warnings)); } const body = tidy(parts.join("\n"));
  if (!body) { if (findFirst(container, (node) => node.tag === "a" && /\.pdf(?:$|[?#])/i.test(node.attrs.href || ""))) fail("unsupported"); fail("parse-failed"); }
  const description = tidy([`# ${title}`, time && `时间限制：${time}`, memory && `内存限制：${memory}`, body].filter(Boolean).join("\n\n")); if (description.length > MAX_MARKDOWN) fail("too-large"); return { description, warnings: [...warnings] };
}
async function readLimitedBody(response, signal) {
  if (Number(response.headers.get("Content-Length") || 0) > MAX_HTML_BYTES) fail("too-large"); if (!response.body?.getReader) { const value = await response.text(); if (new TextEncoder().encode(value).byteLength > MAX_HTML_BYTES) fail("too-large"); return value; }
  const reader = response.body.getReader(); const chunks = []; let bytes = 0; try { while (true) { if (signal.aborted) fail("timeout"); const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > MAX_HTML_BYTES) { await reader.cancel(); fail("too-large"); } chunks.push(part.value); } } finally { reader.releaseLock(); } return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}
export async function fetchCodeforcesStatement({ problemNumber, sourceUrl }, { fetchImpl = fetch, now = () => new Date().toISOString(), timeoutMs = 12000 } = {}) {
  let url = validateCodeforcesUrl(sourceUrl, problemNumber); const normalized = parseCodeforcesProblemNumber(problemNumber).problemNumber; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { for (let redirects = 0; redirects <= 2; redirects += 1) { let response; try { response = await fetchImpl(url.toString(), { redirect: "manual", signal: controller.signal, headers: { Accept: "text/html" } }); } catch (error) { return unavailable(normalized, error?.name === "AbortError" || controller.signal.aborted ? "timeout" : "upstream-error", true); }
    if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get("Location"); if (!location || redirects === 2) return unavailable(normalized, "blocked"); try { url = validateCodeforcesUrl(new URL(location, url).toString(), normalized); } catch { return unavailable(normalized, "blocked"); } continue; }
    if (response.status === 404) return unavailable(normalized, "not-found"); if (response.status === 403 || !response.ok) return unavailable(normalized, response.status >= 500 ? "upstream-error" : "blocked", response.status >= 500);
    try { const parsed = parseCodeforcesStatement(await readLimitedBody(response, controller.signal), normalized); return { status: "ok", problemNumber: normalized, description: parsed.description, source: { kind: "codeforces-html", url: url.toString(), fetchedAt: now(), parserVersion: CF_STATEMENT_PARSER_VERSION }, warnings: parsed.warnings }; } catch (error) { const reason = controller.signal.aborted || error.message === "timeout" ? "timeout" : ["too-large", "unsupported", "blocked"].includes(error.message) ? error.message : "parse-failed"; return unavailable(normalized, reason, reason === "timeout"); }
  } } finally { clearTimeout(timer); } return unavailable(normalized, "blocked");
}
