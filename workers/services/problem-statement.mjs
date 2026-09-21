import { normalizeProblemNumber } from "../../lib/problem-identity.mjs";
import {
  MAX_NEW_STATEMENT_IMAGE_BYTES,
  MAX_STATEMENT_IMAGES,
  MAX_STATEMENT_IMAGE_BYTES,
  bytesToBase64,
  sniffStatementImageMime,
  statementImageFileName,
} from "../../lib/statement-images.mjs";
import { LUOGU_ORIGIN, MAX_HTML_BYTES, fail, isChallengePage, readLimitedBody, requestLuoguPage } from "./luogu-page.mjs";
import { BROWSER_HEADERS } from "./http-headers.mjs";

// 解析版本记录「正文是用哪一代解析器生成的」：同一个页面的输出格式变化时要 +1，
// 便于日后判断某条记录的题面是旧的 Markdown 写法还是新的。
export const CF_STATEMENT_PARSER_VERSION = "cf-html-v4";
export const LUOGU_STATEMENT_PARSER_VERSION = "luogu-mirror-v3";
export const ATCODER_STATEMENT_PARSER_VERSION = "atcoder-html-v1";
const MAX_MARKDOWN = 100_000;
const CF_ORIGIN = "https://codeforces.com/";
const ATCODER_ORIGIN = "https://atcoder.jp";
// 题面图片的下载预算：与正文抓取分开计时，图片取不到不影响题面本身。
const IMAGE_TIMEOUT_MS = 6000;
const IMAGE_CONCURRENCY = 4;
const unavailable = (problemNumber, reason, retryable = false) => ({ status: "unavailable", problemNumber, reason, retryable });
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
// 行尾与只含空白的行要清掉：洛谷正文里 <p> 之间的换行会变成一行「空格」，
// 拼进 Markdown 会留下没有意义的空行。
const tidy = (value) => String(value).replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const codeText = (node) => textOf(node).replace(/\r\n?/g, "\n").replace(/^\n|\n$/g, "");
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function safeUrl(value, image = false, base = CF_ORIGIN) { try { const url = new URL(value, base); return url.protocol === "https:" && !url.username && !url.password && (!image || url.hostname) ? url.toString() : ""; } catch { return ""; } }

// ── 题面图片归档 ────────────────────────────────────────────────────────────
// 正文里的图片不直接写成外链：站点 CSP 只允许 'self' + data:，洛谷 CDN 还按 referer
// 限制，外链在站内加载不出来。解析时先把图片记下来、正文写成占位符，抓取函数再统一
// 下载并替换成仓库内的文件名（见 lib/statement-images.mjs）。
export const EXTERNAL_IMAGES_WARNING = "external-images";
const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]*$/i;
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;

const imagePlaceholder = (index) => `{{statement-image:${index}}}`;
// 正文里的引用写成 `./statement-<sha>.<ext>`：显式相对路径在 GitHub 与站内 Markdown
// 渲染器里都能解析（裸文件名只有 GitHub 认），站点构建时再改写成站点绝对地址。
const imageReference = (fileName) => `./${fileName}`;

/** 题面里允许归档的地址：https 外链与 data: 内联图；其余（http、ftp、相对协议不支持）一律丢弃。 */
function safeImageUrl(value, base) {
  const raw = String(value || "").trim();
  if (DATA_IMAGE.test(raw)) return raw.replace(/\s+/g, "");
  if (/^data:/i.test(raw)) return "";
  return safeUrl(raw, true, base);
}

function imageAlt(value) { return tidy(value || "image").replace(/[\[\]]/g, "\\$"); }

/**
 * 纯 Markdown 正文（洛谷的 AtCoder 题面就是这种形态）。
 *
 * 这里的换行即结构（`> 引用`、`- 列表`、缩进代码块），因此既不能按 HTML 文本折叠空白，
 * 也不能交给标签解析器——正文里出现的 `<` 会被当成标签开头吃掉。只做三件事：解码实体、
 * 登记待归档图片、把 CF 的三美元公式归一。
 */
function markdownText(value, context, warnings) {
  return textWithImages(decode(value), context, warnings)
    .replace(/\$\$\$([\s\S]*?)\$\$\$/g, (_all, formula) => `$${formula}$`)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * 行内代码（AtCoder 的 `<code>`、洛谷正文里的 Markdown 混排）。
 *
 * 围栏长度按内容里最长的反引号串加一：否则正文自己带的 `` ` `` 会提前闭合围栏，
 * 后面半截代码就变成普通文本。内容里若含反引号，Markdown 还要求首尾各留一个空格。
 */
function inlineCode(value) {
  const text = textOf(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const longest = (text.match(/`+/g) || []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = "`".repeat(longest + 1);
  const pad = longest ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

/**
 * 记下一张待归档的图片并返回正文里的占位符。
 *
 * 同一个地址只记一次：题面里同一张图重复出现时共用一个占位符，下载与哈希也只算一次。
 * 没有开启归档时（直接调用解析函数）保持原样的外链写法，只留下警告。
 */
function registerImage(source, alt, context, warnings) {
  const url = safeImageUrl(source, context.base);
  if (!url) return "";
  warnings.add(EXTERNAL_IMAGES_WARNING);
  if (!context.images) return `![${imageAlt(alt)}](${url})`;
  let index = context.imageUrls.get(url);
  if (index === undefined) {
    index = context.images.length;
    context.images.push({ url });
    context.imageUrls.set(url, index);
  }
  return `![${imageAlt(alt)}](${imagePlaceholder(index)})`;
}

// 洛谷的题面正文里 HTML 与 Markdown 混排：图片既有 <img src> 也有裸的 ![](url) 语法，
// 后者藏在文本节点里，必须单独识别，否则会被当成普通文字原样写进描述。
function textWithImages(text, context, warnings) {
  return String(text).replace(MARKDOWN_IMAGE, (all, alt, href) => registerImage(href, alt, context, warnings) || all);
}

function markdownFrom(node, warnings, context = {}) {
  if (node.text !== undefined) {
    const text = context.pre ? node.text : textWithImages(node.text, context, warnings);
    return context.pre ? text : text.replace(/\$\$\$([\s\S]*?)\$\$\$/g, (_all, formula) => `$${formula}$`).replace(/\s+/g, " ");
  }
  const children = (extra = {}) => (node.children || []).map((part) => markdownFrom(part, warnings, { ...context, ...extra })).join(""); const tag = node.tag;
  // 脚本与样式在题面里没有语义，任何来源都不应把它们的源码混进正文。
  if (tag === "script" || tag === "style") return "";
  if (tag === "pre") { const value = codeText(node); return `\n\n\`\`\`\n${value}${value.endsWith("\n") ? "" : "\n"}\`\`\`\n\n`; }
  if (tag === "br") return "\n";
  if (tag === "img") return registerImage(node.attrs.src, node.attrs.alt, context, warnings);
  if (tag === "a") { const label = tidy(children()) || tidy(node.attrs.href); const url = safeUrl(node.attrs.href, false, context.base); return url ? `[${label}](${url})` : label; }
  if (tag === "sup") return `^(${tidy(children())})`; if (tag === "sub") return `_(${tidy(children())})`;
  if (tag === "code") return inlineCode(node);
  // AtCoder 把公式写成 <var>，内容是裸 TeX 片段（如 \frac{|T|+1}{2}）。站内用 KaTeX 渲染
  // $...$，因此这里补上定界符；`pre` 里的 <var> 由 codeText 走纯文本分支，不会变成 $...$。
  if (tag === "var") return `$${textOf(node).trim()}$`;
  if (tag === "blockquote") { const quoted = tidy(children()).replace(/\n{2,}/g, "\n>\n"); return quoted ? `\n\n> ${quoted.replace(/\n/g, "\n> ")}\n\n` : ""; }
  if (hasClass(node, "test-example-line")) return `${children()}\n`;
  if (hasClass(node, "tex-span")) return `$${tidy(textOf(node)).replace(/^\$+|\$+$/g, "")}$`;
  if (hasClass(node, "tex-block")) return `\n\n$$\n${tidy(textOf(node)).replace(/^\$+|\$+$/g, "")}\n$$\n\n`;
  if (tag === "table") return tableMarkdown(node, warnings, context);
  if (/^h[1-6]$/.test(tag)) return `\n\n${"#".repeat(Number(tag[1]))} ${tidy(children())}\n\n`; if (tag === "li") return `\n- ${tidy(children())}`;
  if (tag === "p") return `\n\n${children()}\n\n`; if (["div", "section", "ul", "ol"].includes(tag)) return `\n${children()}\n`; return children();
}
// 表格按 GFM 输出：首行是 th 时补一行分隔符，否则渲染端只会看到一堆竖线文本。
// 行要递归收集：AtCoder 的 <tr> 包在 <thead>/<tbody> 里（洛谷与 CF 直接挂在 table 下），
// 只认直接子节点会让整张表凭空消失。没有单元格的空行（AtCoder 样例表里真实存在）跳过。
function tableRows(node) {
  const rows = [];
  const walk = (current) => { for (const child of current.children || []) { if (child.tag === "tr") rows.push(child); else walk(child); } };
  walk(node);
  return rows.filter((row) => (row.children || []).some((cell) => cell.tag === "td" || cell.tag === "th"));
}
function tableMarkdown(node, warnings, context) {
  const rows = tableRows(node);
  if (!rows.length) return "";
  const cellsOf = (row) => (row.children || []).filter((child) => child.tag === "td" || child.tag === "th").map((cell) => tidy(markdownFrom(cell, warnings, context)).replace(/\|/g, "\\|"));
  const lines = rows.map((row) => `| ${cellsOf(row).join(" | ")} |`);
  if ((rows[0].children || []).some((child) => child.tag === "th")) lines.splice(1, 0, `| ${cellsOf(rows[0]).map(() => "---").join(" | ")} |`);
  return `\n\n${lines.join("\n")}\n\n`;
}
function sectionTitle(node) { if (hasClass(node, "input-specification")) return "Input"; if (hasClass(node, "output-specification")) return "Output"; if (hasClass(node, "note")) return "Note"; if (hasClass(node, "interaction")) return "Interaction"; return ""; }
const imageContext = (collect) => (collect ? { images: [], imageUrls: new Map() } : {});

/** 下载图片时的 Referer：两个站点的图床都按来源站校验，缺了会被当成盗链。 */
function imageReferer(url) {
  try {
    const { hostname, origin } = new URL(url);
    if (/(^|\.)luogu\.com\.cn$/i.test(hostname)) return `${LUOGU_ORIGIN}/`;
    if (/(^|\.)codeforces\.com$/i.test(hostname)) return CF_ORIGIN;
    // AtCoder 的题面图挂在 img.atcoder.jp，referer 统一写题面所在站。
    if (/(^|\.)atcoder\.jp$/i.test(hostname)) return `${ATCODER_ORIGIN}/`;
    return `${origin}/`;
  } catch { return ""; }
}

// 图片同样按字节数封顶：Content-Length 可能缺失或撒谎，所以流式累计后再判定。
async function readImageBody(response, limit, signal) {
  if (Number(response.headers.get("Content-Length") || 0) > limit) return null;
  if (!response.body?.getReader) { const buffer = await response.arrayBuffer(); return buffer.byteLength > limit ? null : new Uint8Array(buffer); }
  const reader = response.body.getReader(); const chunks = []; let bytes = 0;
  try {
    while (true) {
      if (signal.aborted) return null;
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) { await reader.cancel(); return null; }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return merged;
}

/**
 * 下载抓取到的题面图片，并把正文里的占位符换成仓库文件名。
 *
 * 任何一张图失败都只影响它自己：正文保留原始外链、警告里标记仍有未归档图片，
 * 题面本身照常可用（图片是可选增强，不能拖垮整条抓取链路）。
 */
export async function archiveStatementImages(description, images, { fetchImpl = fetch, timeoutMs = IMAGE_TIMEOUT_MS, maxImages = MAX_STATEMENT_IMAGES, maxImageBytes = MAX_STATEMENT_IMAGE_BYTES, maxTotalBytes = MAX_NEW_STATEMENT_IMAGE_BYTES } = {}) {
  const all = Array.isArray(images) ? images : [];
  const requests = all.slice(0, maxImages);
  const results = new Array(requests.length).fill(null);
  const deadline = Date.now() + timeoutMs;
  let next = 0;
  async function worker() {
    while (next < requests.length) {
      const index = next++;
      const { url } = requests[index];
      if (/^data:/i.test(url)) {
        const bytes = decodeDataImage(url);
        if (bytes) results[index] = bytes;
        continue;
      }
      const budget = deadline - Date.now();
      if (budget <= 0) continue;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), budget);
      try {
        const response = await fetchImpl(url, { redirect: "follow", signal: controller.signal, headers: { ...BROWSER_HEADERS, Accept: "image/*,*/*;q=0.8", ...(imageReferer(url) ? { Referer: imageReferer(url) } : {}) } });
        if (response.ok) results[index] = await readImageBody(response, maxImageBytes, controller.signal);
      } catch { /* 单张图片失败按未归档处理 */ } finally { clearTimeout(timer); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, requests.length) }, worker));

  const archived = [];
  let total = 0;
  let text = String(description);
  let failed = requests.length < all.length;
  for (let index = 0; index < requests.length; index += 1) {
    const bytes = results[index];
    const mimeType = bytes && bytes.byteLength ? sniffStatementImageMime(bytes) : "";
    const sha256 = mimeType ? await sha256Hex(bytes) : "";
    const fileName = sha256 ? statementImageFileName(sha256, mimeType) : "";
    const duplicate = fileName && archived.some((image) => image.fileName === fileName);
    // 单张上限与总量上限都在这里再判一次：超过单张上限的图片会被保存接口拒绝，
    // 与其让整次保存失败，不如让这张图退回外链（data: 内联图不走下载路径，只有这里能拦）。
    if (!fileName || (!duplicate && (bytes.byteLength > maxImageBytes || total + bytes.byteLength > maxTotalBytes))) {
      failed = true;
      text = text.split(imagePlaceholder(index)).join(requests[index].url);
      continue;
    }
    // bytes 只用于响应体传输；不同地址指向同一张图时只回传一次。
    if (!duplicate) {
      total += bytes.byteLength;
      archived.push({ fileName, sha256, mimeType, bytes: bytes.byteLength, data: bytesToBase64(bytes) });
    }
    text = text.split(imagePlaceholder(index)).join(imageReference(fileName));
  }
  // 超出数量上限的图片根本没被处理：它们的占位符必须还原成原外链，
  // 否则正文里会留下一个谁都不认识的占位符。
  for (let index = requests.length; index < all.length; index += 1) {
    text = text.split(imagePlaceholder(index)).join(all[index].url);
  }
  return { description: text, images: archived, failed };
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeDataImage(url) {
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  try {
    const binary = atob(url.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.byteLength ? bytes : null;
  } catch { return null; }
}

// 归档完成后清掉「有外链图片」的警告：全部归档成功时正文里已经没有外链了。
function settledWarnings(warnings, archived) {
  return archived.failed ? warnings : warnings.filter((warning) => warning !== EXTERNAL_IMAGES_WARNING);
}

export function parseCodeforcesProblemNumber(problemNumber) { const normalized = normalizeProblemNumber(problemNumber); const match = /^(\d+)([A-Z][A-Z0-9]*)$/.exec(normalized || ""); return match ? { contestId: match[1], index: match[2], problemNumber: normalized } : null; }
export function validateCodeforcesUrl(value, problemNumber) {
  const expected = parseCodeforcesProblemNumber(problemNumber); if (!expected) throw Object.assign(new TypeError("Codeforces 题号必须形如 123A"), { status: 400, code: "INVALID_REQUEST" });
  const url = new URL(value || `https://codeforces.com/problemset/problem/${expected.contestId}/${expected.index}?locale=en`);
  if (url.protocol !== "https:" || url.hostname !== "codeforces.com" || url.username || url.password || url.port) throw Object.assign(new TypeError("题面地址必须是 codeforces.com HTTPS 地址"), { status: 400, code: "INVALID_REQUEST" });
  const match = /^\/(problemset\/problem|contest|gym)\/(\d+)(?:\/problem)?\/([A-Za-z][A-Za-z0-9]*)\/?$/.exec(url.pathname);
  if (!match || match[2] !== expected.contestId || match[3].toUpperCase() !== expected.index) throw Object.assign(new TypeError("题面地址与题号不一致"), { status: 400, code: "INVALID_REQUEST" });
  url.search = "?locale=en"; url.hash = ""; return url;
}
export function parseCodeforcesStatement(html, expectedProblemNumber, { collectImages = false } = {}) {
  const document = parseHtml(html); const container = findFirst(document, (node) => node.tag === "div" && hasClass(node, "problem-statement"));
  if (!container) fail(/captcha|challenge|access denied|cloudflare/i.test(html) ? "blocked" : "parse-failed");
  const header = findFirst(container, (node) => node.tag === "div" && hasClass(node, "header")); const titleNode = findFirst(header || container, (node) => node.tag === "div" && hasClass(node, "title"));
  // 限制块里嵌着 .property-title（"time limit per test"），那是标签不是限制本身，不能拼进正文。
  const propertyText = (node) => tidy((node.children || []).filter((child) => !(child.tag === "div" && hasClass(child, "property-title"))).map((child) => child.text ?? textOf(child)).join(""));
  const title = tidy(textOf(titleNode || { children: [] })); const time = propertyText(findFirst(header || container, (node) => node.tag === "div" && hasClass(node, "time-limit")) || { children: [] }); const memory = propertyText(findFirst(header || container, (node) => node.tag === "div" && hasClass(node, "memory-limit")) || { children: [] });
  if (!header || !title || (!time && !memory)) fail("parse-failed"); const expected = expectedProblemNumber && parseCodeforcesProblemNumber(expectedProblemNumber); if (expected && !new RegExp(`^${escapeRegex(expected.index)}\\s*\\.`, "i").test(title)) fail("parse-failed");
  const warnings = new Set(); const parts = []; const context = imageContext(collectImages); for (const node of container.children || []) { if (node === header) continue; const heading = sectionTitle(node); if (heading) parts.push(`## ${heading}`); parts.push(markdownFrom(node, warnings, context)); } const body = tidy(parts.join("\n"));
  if (!body) { if (findFirst(container, (node) => node.tag === "a" && /\.pdf(?:$|[?#])/i.test(node.attrs.href || ""))) fail("unsupported"); fail("parse-failed"); }
  const description = tidy([`# ${title}`, time && `时间限制：${time}`, memory && `内存限制：${memory}`, body].filter(Boolean).join("\n\n")); if (description.length > MAX_MARKDOWN) fail("too-large"); return { description, warnings: [...warnings], images: context.images || [] };
}
// 题面正文失败与网络失败用同一套降级原因，供两个来源共用。
const failureReason = (error, signal) => signal.aborted || error?.message === "timeout" ? "timeout" : ["too-large", "unsupported", "blocked"].includes(error?.message) ? error.message : "parse-failed";
const REASONS_RETRYABLE = new Set(["timeout", "upstream-error"]);

export async function fetchCodeforcesStatement({ problemNumber, sourceUrl }, { fetchImpl = fetch, now = () => new Date().toISOString(), timeoutMs = 12000, imageTimeoutMs = IMAGE_TIMEOUT_MS } = {}) {
  let url = validateCodeforcesUrl(sourceUrl, problemNumber); const normalized = parseCodeforcesProblemNumber(problemNumber).problemNumber; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { for (let redirects = 0; redirects <= 2; redirects += 1) { let response; try { response = await fetchImpl(url.toString(), { redirect: "manual", signal: controller.signal, headers: BROWSER_HEADERS }); } catch (error) { return unavailable(normalized, error?.name === "AbortError" || controller.signal.aborted ? "timeout" : "upstream-error", true); }
    if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get("Location"); if (!location || redirects === 2) return unavailable(normalized, "blocked"); try { url = validateCodeforcesUrl(new URL(location, url).toString(), normalized); } catch { return unavailable(normalized, "blocked"); } continue; }
    if (response.status === 404) return unavailable(normalized, "not-found"); if (response.status === 403 || !response.ok) return unavailable(normalized, response.status >= 500 ? "upstream-error" : "blocked", response.status >= 500);
    try {
      const parsed = parseCodeforcesStatement(await readLimitedBody(response, controller.signal), normalized, { collectImages: true });
      const archived = await archiveStatementImages(parsed.description, parsed.images, { fetchImpl, timeoutMs: imageTimeoutMs });
      if (archived.description.length > MAX_MARKDOWN) return unavailable(normalized, "too-large");
      return { status: "ok", problemNumber: normalized, description: archived.description, images: archived.images, source: { kind: "codeforces-html", url: url.toString(), fetchedAt: now(), parserVersion: CF_STATEMENT_PARSER_VERSION }, warnings: settledWarnings(parsed.warnings, archived) };
    } catch (error) { const reason = failureReason(error, controller.signal); return unavailable(normalized, reason, REASONS_RETRYABLE.has(reason)); }
  } } finally { clearTimeout(timer); } return unavailable(normalized, "blocked");
}

// 洛谷题面镜像：codeforces.com 被 Cloudflare 拦下时，用洛谷同题页面兜底。
// 页面抓取（含 C3VK 握手与限额读取）见 luogu-page.mjs，与 AtCoder 标签抓取共用同一套。
const LUOGU_CONTEXT = /<script[^>]*id=["']lentille-context["'][^>]*>([\s\S]*?)<\/script>/i;
// 判断一段洛谷正文是 HTML 还是纯 Markdown：只有 `<` 紧跟着标签名才算标签，
// 「1 < 2」「x <= y」这类数学写法不会被误判。
const HTML_LIKE = /<\/?[a-z][a-z0-9]*[\s/>]/i;
const LUOGU_SECTIONS = [["background", "背景"], ["description", "题目描述"], ["formatI", "输入格式"], ["formatO", "输出格式"], ["hint", "说明/提示"]];
export const LUOGU_MIRROR_WARNING = "mirror-source";

function sampleBlock(sample, index) {
  const value = (key) => String(sample[key] ?? "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  const fence = (text) => ["```", text, "```"].join("\n");
  return [`### 样例 ${index + 1}`, "输入：", fence(value("in") || value("input")), "输出：", fence(value("out") || value("output"))].join("\n");
}
/** 洛谷页面里嵌的 lentille-context JSON → problem 对象；页面结构变了就返回 null。 */
export function readLuoguProblem(html) {
  const context = LUOGU_CONTEXT.exec(String(html || ""));
  if (!context) return null;
  try { const problem = JSON.parse(context[1])?.data?.problem; return problem && typeof problem === "object" ? problem : null; } catch { return null; }
}
/**
 * 把洛谷题目对象转成 Markdown 题面。
 *
 * 洛谷题号导入与两条镜像链路（CF / AtCoder）共用这一段：都从同一份页面数据出发，
 * 正文格式与图片归档方式必须一致，否则用户会在不同入口看到不同结果。
 */
export function parseLuoguProblem(problem, { expectedProblemNumber, expectedPid: declaredPid, collectImages = false } = {}) {
  const expected = expectedProblemNumber && parseCodeforcesProblemNumber(expectedProblemNumber);
  if (!problem || typeof problem !== "object") fail("parse-failed");
  // pid 是洛谷自己的题目身份：CF 镜像从题号推出 `CF<contestId><index>`，AtCoder 镜像
  // 直接声明 `AT_<task>`，导入链路按用户输入的题号取页面（不校验）。两者都用它确认页面身份。
  const pid = String(problem.pid || "").toUpperCase();
  const expectedPid = expected ? `CF${expected.contestId}${expected.index}` : String(declaredPid || "").toUpperCase();
  if (pid && expectedPid && pid !== expectedPid) fail("parse-failed");
  const warnings = new Set(); const parts = []; const context = imageContext(collectImages);
  const renderContext = { ...context, base: LUOGU_ORIGIN };
  // 正文有两种形态：HTML（洛谷题目、CF 镜像）与纯 Markdown（AtCoder 的 AT_ 镜像）。
  // 后者交给 HTML 解析器会把换行结构压扁、把 `<` 当成标签开头，必须分开处理。
  const render = (raw) => (HTML_LIKE.test(String(raw)) ? tidy(markdownFrom(parseHtml(String(raw)), warnings, renderContext)) : tidy(markdownText(String(raw), renderContext, warnings)));
  if (typeof problem.content === "string") { const body = render(problem.content); if (body) parts.push(body); }
  else if (problem.content && typeof problem.content === "object") for (const [key, label] of LUOGU_SECTIONS) { const raw = problem.content[key]; if (typeof raw !== "string" || !raw.trim()) continue; const body = render(raw); if (body) parts.push(`## ${label}`, body); }
  // 样例可能嵌在正文里，也可能单列在 samples：后者只在正文没有代码块时补，避免重复。
  // 形态有两种：`{in,out}` 对象（洛谷题目与 CF 镜像）和 `[in, out]` 数组对（AtCoder 镜像）。
  const samples = (Array.isArray(problem.samples) ? problem.samples : [])
    .map((sample) => (Array.isArray(sample) ? { in: sample[0], out: sample[1] } : sample))
    .filter((sample) => sample && typeof sample === "object");
  if (samples.length && !parts.join("\n").includes("```")) parts.push(...samples.map((sample, index) => sampleBlock(sample, index)));
  const title = tidy(problem.title || problem.name || (problem.content && typeof problem.content === "object" ? problem.content.name : "") || "");
  const body = tidy(parts.join("\n\n")); if (!body) fail("parse-failed");
  const description = tidy([title && `# ${title}`, body].filter(Boolean).join("\n\n")); if (description.length > MAX_MARKDOWN) fail("too-large");
  // 洛谷题目的算法标签是数字 id（如 [42] = 线段树），字典在 /_lfe/tags。这里把原始 id 一并
  // 交出去，调用方（AtCoder 题面路由）用已经拿到的那份页面顺手换成站内标签，不必再抓一次。
  const tagIds = Array.isArray(problem.tags) ? problem.tags.filter((id) => Number.isInteger(id)) : [];
  return { description, warnings: [...warnings], images: context.images || [], tagIds };
}
export function parseLuoguStatement(html, expectedProblemNumber, options) {
  const problem = readLuoguProblem(html);
  if (!problem) fail(isChallengePage(html) ? "blocked" : "parse-failed");
  return parseLuoguProblem(problem, { ...options, expectedProblemNumber });
}
/**
 * 洛谷镜像页的共同链路：C3VK 握手 → 解析 → 图片归档。
 *
 * 两个调用方（CF 同题镜像、AtCoder 的 AT_ 镜像）只差 URL、解析函数与来源版本，
 * 降级原因与时限必须完全一致，因此共用这一段而不是各写一遍。
 */
async function fetchLuoguMirror({ url, problemNumber, parserVersion, parse }, { fetchImpl = fetch, now = () => new Date().toISOString(), timeoutMs = 12000, imageTimeoutMs = IMAGE_TIMEOUT_MS } = {}) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { ...BROWSER_HEADERS, "Accept-Language": "zh-CN,zh;q=0.9" };
  try {
    const { response, error, blocked } = await requestLuoguPage(url, { fetchImpl, controller, headers });
    if (error) return unavailable(problemNumber, error?.name === "AbortError" || controller.signal.aborted ? "timeout" : "upstream-error", true);
    if (blocked || !response) return unavailable(problemNumber, "blocked");
    if (response.status === 404) return unavailable(problemNumber, "not-found");
    if (response.status === 403 || !response.ok) return unavailable(problemNumber, response.status >= 500 ? "upstream-error" : "blocked", response.status >= 500);
    try {
      const parsed = parse(await readLimitedBody(response, controller.signal));
      const archived = await archiveStatementImages(parsed.description, parsed.images, { fetchImpl, timeoutMs: imageTimeoutMs });
      if (archived.description.length > MAX_MARKDOWN) return unavailable(problemNumber, "too-large");
      // tagIds 是洛谷的原始数字标签；由调用方决定要不要换成站内标签（见 atcoder-tags.mjs）。
      return { status: "ok", problemNumber, description: archived.description, images: archived.images, ...(parsed.tagIds?.length ? { tagIds: parsed.tagIds } : {}), source: { kind: "luogu-mirror", url, fetchedAt: now(), parserVersion }, warnings: [LUOGU_MIRROR_WARNING, ...settledWarnings(parsed.warnings, archived)] };
    } catch (error) { const reason = failureReason(error, controller.signal); return unavailable(problemNumber, reason, REASONS_RETRYABLE.has(reason)); }
  } finally { clearTimeout(timer); }
}
export async function fetchLuoguStatement({ problemNumber }, options = {}) {
  const expected = parseCodeforcesProblemNumber(problemNumber); const normalized = expected ? expected.problemNumber : normalizeProblemNumber(problemNumber);
  if (!expected) return unavailable(normalized, "parse-failed");
  return fetchLuoguMirror({
    url: `${LUOGU_ORIGIN}/problem/CF${expected.contestId}${expected.index}`,
    problemNumber: normalized,
    parserVersion: LUOGU_STATEMENT_PARSER_VERSION,
    parse: (html) => parseLuoguStatement(html, normalized, { collectImages: true }),
  }, options);
}

// ── AtCoder 题面 ────────────────────────────────────────────────────────────
// AtCoder 没有题面 API，但题目页是公开的：atcoder.jp/contests/<contest>/tasks/<task>。
// 题号本身就是任务 ID（abc381_a），比赛 ID 是最后一个下划线之前的部分——这与
// lib/problem-links.mjs 生成原题链接的口径一致，不另立一套解析规则。
// 页面同时内嵌日文（span.lang-ja）与英文（span.lang-en）两套题面，只取英文那套。
//
// 现实约束（2026-09-21 边缘实测）：atcoder.jp 对机房出口整体返回 403（连首页都是，
// 换请求头无效，属 IP 级拦截），Cloudflare Workers 因此取不到官方页。所以官方页仍然
// 先试（上游放行、或本地/住宅网络都能拿到英文原题），失败后退回洛谷的 AT_ 镜像页
// ——与 Codeforces 那条「官方优先、洛谷兜底」的来源链完全同构。
export const ATCODER_JA_WARNING = "ja-statement";
export const ATCODER_MIRROR_PARSER_VERSION = "luogu-atcoder-mirror-v1";
// 题面由用户浏览器在 atcoder.jp 页面上抓回（小书签）时加的来源提示：正文是官方页原文，
// 但抓取发生在客户端，与服务器直连拿到的同一份页面在可信度上略有差别。
export const ATCODER_CLIENT_WARNING = "client-html";

export function parseAtCoderProblemNumber(problemNumber) {
  const value = String(problemNumber || "").trim().replace(/\s+/g, "").toLowerCase();
  const cut = value.lastIndexOf("_");
  if (cut <= 0 || cut === value.length - 1) return null;
  const contest = value.slice(0, cut);
  // 只接受能安全拼进 URL 的字符：拼不出题目页就不抓，也不去猜比赛 ID。
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(contest) || !/^[a-z0-9][a-z0-9_]*$/.test(value)) return null;
  return { contest, problemNumber: value };
}

const ATCODER_TITLE = /<title>([\s\S]*?)<\/title>/i;
const ATCODER_LIMITS = /Time Limit:\s*([^<>]{1,48}?)\s*\/\s*Memory Limit:\s*([^<>]{1,48}?)\s*</i;

export function parseAtCoderStatement(html, expectedProblemNumber, { collectImages = false } = {}) {
  const expected = parseAtCoderProblemNumber(expectedProblemNumber);
  if (!expected) fail("parse-failed");
  const source = String(html || "");
  const document = parseHtml(source);
  // 页面用 og:url 声明自己是谁：题号与页面对不上时，绝不能把别题（或别的比赛）的
  // 题面写进记录。AtCoder 的 URL 大小写不敏感，比较时统一转小写。
  const claimed = findFirst(document, (node) => node.tag === "meta" && String(node.attrs.property || "").toLowerCase() === "og:url")?.attrs?.content || "";
  if (claimed) {
    let path = "";
    try { path = new URL(claimed).pathname; } catch { path = ""; }
    if (path.toLowerCase() !== `/contests/${expected.contest}/tasks/${expected.problemNumber}`.toLowerCase()) fail("parse-failed");
  }
  const container = findFirst(document, (node) => node.tag === "div" && String(node.attrs.id || "").toLowerCase() === "task-statement");
  if (!container) fail(isChallengePage(source) ? "blocked" : "parse-failed");
  const warnings = new Set();
  const english = findFirst(container, (node) => hasClass(node, "lang-en"));
  // 少数老题（如 JOI 系列）只有日文题面：取日文原题并留下警告，不能假装是官方英文题面。
  if (!english) warnings.add(ATCODER_JA_WARNING);
  const bodyNode = english || findFirst(container, (node) => hasClass(node, "lang-ja")) || container;
  const context = imageContext(collectImages);
  const body = tidy(markdownFrom(bodyNode, warnings, { ...context, base: ATCODER_ORIGIN }));
  if (!body) fail("parse-failed");
  const title = tidy(decode(ATCODER_TITLE.exec(source)?.[1] || "")).replace(/\s*-\s*AtCoder\s*$/i, "");
  const limits = ATCODER_LIMITS.exec(source);
  const description = tidy([title && `# ${title}`, limits && `时间限制：${tidy(limits[1])}`, limits && `内存限制：${tidy(limits[2])}`, body].filter(Boolean).join("\n\n"));
  if (description.length > MAX_MARKDOWN) fail("too-large");
  return { description, warnings: [...warnings], images: context.images || [], pageUrl: claimed };
}

/**
 * AtCoder 题面：由用户浏览器抓回的官方页源码。
 *
 * 为什么需要这条路：atcoder.jp 对机房出口整体 403（Workers 拿不到），而浏览器直接读
 * 又受 CORS 限制（AtCoder 不返回 `Access-Control-Allow-Origin`）。唯一能拿到官方页的
 * 是运行在 atcoder.jp 上的代码——于是给一个「小书签」：它在题目页里复制 `outerHTML`，
 * 用户把源码粘回表单，这里用**同一个解析器**处理（含 og:url 校验，粘错题会判 parse-failed）。
 *
 * 图片仍按原样交给归档层：img.atcoder.jp 同样够不到，于是退回外链并保留
 * `external-images` 警告——正文照常可用。
 */
export async function statementFromAtCoderHtml({ problemNumber, html }, { fetchImpl = fetch, now = () => new Date().toISOString(), imageTimeoutMs = IMAGE_TIMEOUT_MS } = {}) {
  const expected = parseAtCoderProblemNumber(problemNumber);
  if (!expected) return unavailable(normalizeProblemNumber(problemNumber), "parse-failed");
  const normalized = expected.problemNumber;
  const source = String(html ?? "");
  if (source.length > MAX_HTML_BYTES) return unavailable(normalized, "too-large");
  // 客户端抓回的源码里，图片地址是页面里的绝对地址（https://img.atcoder.jp/...），
  // 归档层会尝试下载；够不到就退回外链，与官方页直取的行为一致。
  const controller = new AbortController();
  try {
    const parsed = parseAtCoderStatement(source, normalized, { collectImages: true });
    const archived = await archiveStatementImages(parsed.description, parsed.images, { fetchImpl, timeoutMs: imageTimeoutMs });
    if (archived.description.length > MAX_MARKDOWN) return unavailable(normalized, "too-large");
    const url = parsed.pageUrl && /^https:\/\/atcoder\.jp\//i.test(parsed.pageUrl)
      ? parsed.pageUrl
      : `${ATCODER_ORIGIN}/contests/${encodeURIComponent(expected.contest)}/tasks/${encodeURIComponent(normalized)}`;
    return {
      status: "ok",
      problemNumber: normalized,
      description: archived.description,
      images: archived.images,
      source: { kind: "atcoder-html", url, fetchedAt: now(), parserVersion: ATCODER_STATEMENT_PARSER_VERSION },
      warnings: [ATCODER_CLIENT_WARNING, ...settledWarnings(parsed.warnings, archived)],
    };
  } catch (error) {
    const reason = failureReason(error, controller.signal);
    return unavailable(normalized, reason, REASONS_RETRYABLE.has(reason));
  }
}

/** AtCoder 官方页 → Markdown（只在拿得到官方页时成功，见上面关于 403 的说明）。 */
export async function fetchAtCoderStatement({ problemNumber }, { fetchImpl = fetch, now = () => new Date().toISOString(), timeoutMs = 12000, imageTimeoutMs = IMAGE_TIMEOUT_MS } = {}) {
  const expected = parseAtCoderProblemNumber(problemNumber);
  if (!expected) return unavailable(normalizeProblemNumber(problemNumber), "parse-failed");
  const normalized = expected.problemNumber;
  const url = `${ATCODER_ORIGIN}/contests/${encodeURIComponent(expected.contest)}/tasks/${encodeURIComponent(normalized)}?lang=en`;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { ...BROWSER_HEADERS, "Accept-Language": "en-US,en;q=0.9,ja;q=0.8" };
  try {
    let response;
    try { response = await fetchImpl(url, { redirect: "follow", signal: controller.signal, headers }); }
    catch (error) { return unavailable(normalized, error?.name === "AbortError" || controller.signal.aborted ? "timeout" : "upstream-error", true); }
    if (response.status === 404) return unavailable(normalized, "not-found");
    // 429 与 403 都是「现在拿不到，别再打」：AtCoder 会对异常流量直接限流。
    if (response.status === 403 || response.status === 429) return unavailable(normalized, "blocked");
    if (!response.ok) return unavailable(normalized, response.status >= 500 ? "upstream-error" : "blocked", response.status >= 500);
    try {
      const parsed = parseAtCoderStatement(await readLimitedBody(response, controller.signal), normalized, { collectImages: true });
      const archived = await archiveStatementImages(parsed.description, parsed.images, { fetchImpl, timeoutMs: imageTimeoutMs });
      if (archived.description.length > MAX_MARKDOWN) return unavailable(normalized, "too-large");
      return { status: "ok", problemNumber: normalized, description: archived.description, images: archived.images, source: { kind: "atcoder-html", url, fetchedAt: now(), parserVersion: ATCODER_STATEMENT_PARSER_VERSION }, warnings: settledWarnings(parsed.warnings, archived) };
    } catch (error) { const reason = failureReason(error, controller.signal); return unavailable(normalized, reason, REASONS_RETRYABLE.has(reason)); }
  } finally { clearTimeout(timer); }
}

/**
 * AtCoder 题面的洛谷镜像：`https://www.luogu.com.cn/problem/AT_<任务 ID>`。
 *
 * 洛谷按 `AT_` 前缀收录 AtCoder 题目，正文多是日文原题、部分是中文翻译，因此和 CF 镜像
 * 一样带上 `mirror-source` 警告，由表单提示用户对照原题核对。覆盖面上洛谷只收了部分
 * AtCoder 题目（ABC/ARC/AGC 常见题基本都在，typical90、部分 JOI 等没有），取不到时
 * 返回 not-found，由调用方决定怎么提示。
 */
/**
 * 洛谷的 AtCoder 题面首行固定是 `[problemUrl]: <atcoder 原题地址>`。这种写法在 Markdown
 * 里是「链接引用定义」，渲染时会整行消失，原题地址就没了；改写成正文里可见的一行。
 */
function linkOriginalProblem(problem) {
  const rewrite = (value) => (typeof value === "string" ? value.replace(/^\[problemUrl\]:[ \t]*(\S+)[ \t]*$/im, "原题链接：$1") : value);
  const content = problem.content;
  if (typeof content !== "object" || !content) return { ...problem, content: rewrite(content) };
  return { ...problem, content: Object.fromEntries(Object.entries(content).map(([key, value]) => [key, rewrite(value)])) };
}

export function parseLuoguAtCoderStatement(html, expectedProblemNumber, options) {
  const expected = parseAtCoderProblemNumber(expectedProblemNumber);
  if (!expected) fail("parse-failed");
  const problem = readLuoguProblem(html);
  if (!problem) fail(isChallengePage(html) ? "blocked" : "parse-failed");
  return parseLuoguProblem(linkOriginalProblem(problem), { ...options, expectedPid: `AT_${expected.problemNumber}` });
}

export async function fetchLuoguAtCoderStatement({ problemNumber }, options = {}) {
  const expected = parseAtCoderProblemNumber(problemNumber);
  if (!expected) return unavailable(normalizeProblemNumber(problemNumber), "parse-failed");
  return fetchLuoguMirror({
    url: `${LUOGU_ORIGIN}/problem/AT_${encodeURIComponent(expected.problemNumber)}`,
    problemNumber: expected.problemNumber,
    parserVersion: ATCODER_MIRROR_PARSER_VERSION,
    parse: (html) => parseLuoguAtCoderStatement(html, expected.problemNumber, { collectImages: true }),
  }, options);
}

// 抓取入口：Codeforces 与 AtCoder 都是「官方页优先、洛谷镜像兜底」，两条来源链共用同一套
// 总时限；两个来源都失败时回给官方页的失败原因，镜像的失败原因不覆盖它。官方页明确回答
// not-found 时不试镜像（说明页面可达且题目确实不存在）。
export async function fetchStatement({ platform = "Codeforces", problemNumber, sourceUrl }, options = {}) {
  const { fetchImpl = fetch, now = () => new Date().toISOString(), timeoutMs = 12000, imageTimeoutMs = IMAGE_TIMEOUT_MS } = options;
  const deadline = Date.now() + timeoutMs;
  const remaining = () => deadline - Date.now();
  // AtCoder 的题目地址由题号推出来，没有用户传入的 URL 需要校验，因此 sourceUrl 被忽略。
  if (platform === "AtCoder") {
    const primary = await fetchAtCoderStatement({ problemNumber }, { fetchImpl, now, timeoutMs: Math.max(1000, Math.round(remaining() * 0.5)), imageTimeoutMs });
    if (primary.status === "ok" || primary.reason === "not-found") return primary;
    const atcoderBudget = remaining();
    if (atcoderBudget < 1000) return primary;
    const mirror = await fetchLuoguAtCoderStatement({ problemNumber }, { fetchImpl, now, timeoutMs: atcoderBudget, imageTimeoutMs });
    return mirror.status === "ok" ? mirror : primary;
  }
  const primary = await fetchCodeforcesStatement({ problemNumber, sourceUrl }, { fetchImpl, now, timeoutMs: Math.max(1000, Math.round(remaining() * 0.6)), imageTimeoutMs });
  if (primary.status === "ok" || primary.reason === "not-found") return primary;
  const budget = remaining();
  if (budget < 1000) return primary;
  const mirror = await fetchLuoguStatement({ problemNumber }, { fetchImpl, now, timeoutMs: budget, imageTimeoutMs });
  return mirror.status === "ok" ? mirror : primary;
}
