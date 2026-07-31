const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cheerio = require("cheerio");

function addSelfClosingVoids(html) {
  return html.replace(/<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b([^>]*?)>/gi, "<$1$2 />");
}

const ROOT = path.join(__dirname, "..");
const LOGS_DIR = path.join(ROOT, "logs");
const OUTPUT_DIR = path.join(ROOT, "site");
const LEGACY_LOG_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_PATTERN = /^\d{4}$/;
const MONTH_PATTERN = /^(0[1-9]|1[0-2])$/;
const DAY_PATTERN = /^(0[1-9]|[12]\d|3[01])$/;
let normalizeMeta;
let escapeHtml;
let renderMarkdown;
let toDateString;
const SITE_ORIGIN = "https://train.xialiao.org";
const SITE_NAME = "ICPC 算法训练日志";

function readMeta(dateDir, member, date) {
  const metaPath = path.join(dateDir, "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  return normalizeMeta(JSON.parse(fs.readFileSync(metaPath, "utf8")), {
    legacyIdPrefix: `${member}-${date}`,
  });
}

function readProblemFile(dir, filename) {
  const p = path.join(dir, filename);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8").trim();
}

function appendDateLogs(logs, member, date, dateDir) {
  const meta = readMeta(dateDir, member, date);
  if (!meta || !meta.problems || !meta.problems.length) return;

  for (let i = 0; i < meta.problems.length; i++) {
    const p = meta.problems[i];
    logs.push({
      member,
      date,
      problemIndex: i,
      problemId: p.id,
      problem: p.name || "未填写",
      platform: p.platform || "未填写",
      problemNumber: p.problemNumber || "",
      description: readProblemFile(dateDir, `${i}-desc.md`),
      takeaway: readProblemFile(dateDir, `${i}-takeaway.md`) || "未填写",
      difficulty: p.difficulty || "未标注",
      tags: p.tags || [],
      reviewStatus: p.reviewStatus || "none",
      code: readProblemFile(dateDir, `${i}-solution.cpp`),
    });
  }
}

function listMembers() {
  if (!fs.existsSync(LOGS_DIR)) return [];
  return fs
    .readdirSync(LOGS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function readLogs() {
  const members = listMembers();
  const logs = [];

  for (const member of members) {
    const memberDir = path.join(LOGS_DIR, member);
    const entries = fs.readdirSync(memberDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      if (LEGACY_LOG_DIR_PATTERN.test(entry.name)) {
        appendDateLogs(logs, member, entry.name, path.join(memberDir, entry.name));
        continue;
      }

      if (!YEAR_PATTERN.test(entry.name)) continue;
      const yearDir = path.join(memberDir, entry.name);
      for (const monthEntry of fs.readdirSync(yearDir, { withFileTypes: true })) {
        if (!monthEntry.isDirectory() || !MONTH_PATTERN.test(monthEntry.name)) continue;
        const monthDir = path.join(yearDir, monthEntry.name);
        for (const dayEntry of fs.readdirSync(monthDir, { withFileTypes: true })) {
          if (!dayEntry.isDirectory() || !DAY_PATTERN.test(dayEntry.name)) continue;
          const date = `${entry.name}-${monthEntry.name}-${dayEntry.name}`;
          appendDateLogs(logs, member, date, path.join(monthDir, dayEntry.name));
        }
      }
    }
  }

  const seen = new Set();
  const deduped = logs.filter((log) => {
    const key = `${log.member}|${log.date}|${log.problemIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logs.length = 0;
  logs.push(...deduped);

  logs.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.member.localeCompare(b.member, "zh-CN") ||
      a.problem.localeCompare(b.problem, "zh-CN"),
  );

  return { members, logs };
}

// Note: buildHeatmapCounts and buildRecentStats each iterate the full logs array.
// They compute different aggregates (date counts vs. time-windowed stats), so
// combining into a single pass would require restructuring their interfaces.
// Both are O(n) and the data volume is small, so keeping them separate is acceptable.
function buildHeatmapCounts(logs) {
  const all = {};
  const byMember = {};

  for (const log of logs) {
    all[log.date] = (all[log.date] || 0) + 1;
    byMember[log.member] ??= {};
    byMember[log.member][log.date] = (byMember[log.member][log.date] || 0) + 1;
  }

  return { all, byMember };
}

function buildRecentStats(logs, members) {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 29);
  const start = toDateString(startDate);
  const end = toDateString(endDate);

  const withinRange = logs.filter((log) => log.date >= start && log.date <= end);

  function summarize(items) {
    const activeDays = new Set(items.map((item) => item.date)).size;
    const byPlatform = {};
    const byDifficulty = {};
    for (const item of items) {
      byPlatform[item.platform] = (byPlatform[item.platform] || 0) + 1;
      byDifficulty[item.difficulty] = (byDifficulty[item.difficulty] || 0) + 1;
    }

    return {
      totalLogs: items.length,
      activeDays,
      avgPerWeek: Number(((items.length * 7) / 30).toFixed(1)),
      byPlatform,
      byDifficulty,
    };
  }

  const byMember = { all: summarize(withinRange) };
  for (const member of members) {
    byMember[member] = summarize(withinRange.filter((item) => item.member === member));
  }

  return { start, end, byMember };
}

function copyFile(name) {
  fs.copyFileSync(path.join(ROOT, name), path.join(OUTPUT_DIR, name));
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(path.join(ROOT, src), { withFileTypes: true })) {
    const srcPath = path.join(ROOT, src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(path.join(src, entry.name), destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function assetVersion(name) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(ROOT, name)))
    .digest("hex")
    .slice(0, 12);
}

function logSummary({ description, takeaway, code, ...summary }) {
  return summary;
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateString(date);
}

function appVersion() {
  return crypto
    .createHash("sha256")
    .update(["app.js", "lib/log-schema.mjs", "lib/journal-api.js", "lib/render-safety.mjs", "lib/constants.mjs", "lib/auth.mjs", "lib/theme.mjs", "lib/form.mjs", "lib/renderer.mjs", "lib/router.mjs", "lib/data.mjs"].map((name) => fs.readFileSync(path.join(ROOT, name))).join(""))
    .digest("hex")
    .slice(0, 12);
}

function writeVersionedIndex(dataVersion) {
  const raw = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const $ = cheerio.load(raw);
  $('meta[name="journal-data-version"]').attr("content", dataVersion);
  $('link[rel="stylesheet"][href^="style.css"]').attr("href", `style.css?v=${assetVersion("style.css")}`);
  $('script[src^="app.js"]').attr("src", `app.js?v=${appVersion()}`);
  const html = addSelfClosingVoids($.html());
  fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), html, "utf8");
  return html;
}

function routePath(segments = []) {
  if (!segments.length) return "/";
  return `/${segments.map((segment) => encodeURIComponent(String(segment))).join("/")}/`;
}

function absoluteUrl(segments = []) {
  return `${SITE_ORIGIN}${routePath(segments)}`;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[char]);
}

function plainText(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~$|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, maxLength = 155) {
  const text = plainText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function replaceHeadMetadata(html, { title, description, canonical, robots = "index,follow", jsonLd }) {
  const $ = cheerio.load(html);
  $("title").text(title);
  $('meta[name="description"]').attr("content", description);
  $('meta[name="robots"]').attr("content", robots);
  $('link[rel="canonical"]').attr("href", canonical);
  $('meta[property="og:title"]').attr("content", title);
  $('meta[property="og:description"]').attr("content", description);
  $('meta[property="og:url"]').attr("content", canonical);
  $('meta[name="twitter:title"]').attr("content", title);
  $('meta[name="twitter:description"]').attr("content", description);
  if (jsonLd) {
    const serialized = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
    const script = $('<script type="application/ld+json"></script>');
    script.text(serialized);
    $("head").append(script);
  }
  return addSelfClosingVoids($.html());
}

function showOnlyPage(html, pageId) {
  const $ = cheerio.load(html);
  const pageIds = ["overview-page", "review-page", "analysis-page", "member-page", "problem-page"];
  for (const id of pageIds) {
    const section = $(`#${id}`);
    section.removeClass("active");
    section.removeAttr("hidden");
    if (id === pageId) {
      section.addClass("active");
    } else {
      section.attr("hidden", "");
    }
  }
  return addSelfClosingVoids($.html());
}

function problemKey(log) {
  return String(log.problemId || log.problemIndex || 0);
}

function problemSegments(log) {
  return ["problem", log.member, log.date, problemKey(log)];
}

function memberSegments(member) {
  return ["member", member];
}

function recordCardHtml(log) {
  const tags = (log.tags || []).map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("");
  const reviewLabels = { todo: "待复习", mastered: "已掌握" };
  const review = reviewLabels[log.reviewStatus]
    ? `<span class="review-chip ${escapeHtml(log.reviewStatus)}">${reviewLabels[log.reviewStatus]}</span>`
    : "";
  return `<article class="record">
    <div class="record-head"><time datetime="${escapeHtml(log.date)}">${escapeHtml(log.date)}</time><a class="member-link" href="${routePath(memberSegments(log.member))}">${escapeHtml(log.member)}</a></div>
    <h3 class="record-title"><a href="${routePath(problemSegments(log))}">${escapeHtml(log.problem)}</a></h3>
    <p class="meta">平台：${escapeHtml(log.platform)} ｜ 难度：${escapeHtml(log.difficulty)}</p>
    ${tags || review ? `<div class="record-badges">${tags}${review}</div>` : ""}
    <div class="record-links"><a class="record-detail-link" href="${routePath(problemSegments(log))}">查看题目详情 →</a></div>
  </article>`;
}

function writeHomePage(html, logs) {
  const recentLogs = logs.filter((log) => log.date >= daysAgo(29));
  const cards = recentLogs.length ? recentLogs.map(recordCardHtml).join("\n") : "<p>近 30 天暂无训练记录。</p>";
  const description = "ICPC 算法训练日志，汇总队员的刷题记录、原创题解、复盘收获和代码。";
  const withMeta = replaceHeadMetadata(html, {
    title: SITE_NAME,
    description,
    canonical: absoluteUrl(),
    jsonLd: { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: absoluteUrl(), description },
  });
  const $ = cheerio.load(withMeta);
  $("#records").html(cards);
  const output = addSelfClosingVoids($.html());
  fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), output, "utf8");
  return output;
}

function writeMemberPages(html, members, logs) {
  for (const member of members) {
    const memberLogs = logs.filter((log) => log.member === member);
    const activeDays = new Set(memberLogs.map((log) => log.date)).size;
    const recentCount = memberLogs.filter((log) => log.date >= daysAgo(29)).length;
    const firstDate = memberLogs.at(-1)?.date;
    const lastDate = memberLogs[0]?.date;
    const subtitle = memberLogs.length ? `从 ${firstDate} 到 ${lastDate} 的训练记录` : "该队员暂无训练记录";
    const description = `${member} 的 ICPC 算法训练主页，共记录 ${memberLogs.length} 道题和 ${activeDays} 个训练日。`;
    let output = showOnlyPage(html, "member-page");
    output = replaceHeadMetadata(output, {
      title: `${member} 的训练主页 · ${SITE_NAME}`,
      description,
      canonical: absoluteUrl(memberSegments(member)),
      jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: `${member} 的训练主页`, url: absoluteUrl(memberSegments(member)), description },
    });
    const $ = cheerio.load(output);
    $("#member-page-title").text(member);
    $("#member-page-subtitle").text(subtitle);
    $("#member-total").removeClass("loading-value").text(memberLogs.length);
    $("#member-days").removeClass("loading-value").text(activeDays);
    $("#member-recent").removeClass("loading-value").text(recentCount);
    $("#member-record-count").text(`共 ${memberLogs.length} 道题，每道题均可单独打开和分享`);
    $("#member-records").html(memberLogs.map(recordCardHtml).join("\n") || "<p>暂无训练记录。</p>");
    writeRouteIndex(addSelfClosingVoids($.html()), memberSegments(member));
  }
}

function replaceProblemArticle(html, article) {
  return html.replace(
    /(<article id="problem-detail"[^>]*>)[\s\S]*?(<\/article>)/,
    (_match, openingTag, closingTag) => `${openingTag}${article}${closingTag}`,
  );
}

function problemPageHtml(html, log) {
  const canonical = absoluteUrl(problemSegments(log));
  const description = truncate(log.takeaway !== "未填写" ? log.takeaway : log.description)
    || `${log.member} 在 ${log.date} 记录的 ${log.problem} 训练题目、题解与代码。`;
  const badges = [
    ...(log.tags || []).map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`),
    ...({ todo: [`<span class="review-chip todo">待复习</span>`], mastered: [`<span class="review-chip mastered">已掌握</span>`] }[log.reviewStatus] || []),
  ].join("");
  const article = `<div class="problem-detail-head">
      <div><p class="eyebrow">${escapeHtml(log.date)} · 第 ${(log.problemIndex ?? 0) + 1} 题</p><h1>${escapeHtml(log.problem)}</h1></div>
      <div class="problem-detail-actions"><a class="member-chip" href="${routePath(memberSegments(log.member))}">${escapeHtml(log.member)} 的主页</a></div>
    </div>
    <p class="problem-meta">平台：${escapeHtml(log.platform)} ${log.problemNumber ? `<span>题号：${escapeHtml(log.problemNumber)}</span>` : ""} <span>难度：${escapeHtml(log.difficulty)}</span></p>
    ${badges ? `<div class="record-badges">${badges}</div>` : ""}
    <div class="problem-content">
      ${log.description ? `<section class="problem-section"><h2>题目描述</h2>${renderMarkdown(log.description)}</section>` : ""}
      ${log.takeaway ? `<section class="problem-section"><h2>收获 / 题解</h2>${renderMarkdown(log.takeaway)}</section>` : ""}
      ${log.code ? `<section class="problem-section"><h2>代码</h2><div class="record-takeaway problem-code-expanded"><pre class="line-numbers"><code class="language-cpp">${escapeHtml(log.code)}</code></pre></div></section>` : ""}
    </div>`;
  let page = replaceHeadMetadata(showOnlyPage(html, "problem-page"), {
    title: `${log.problem} · ${log.member} · ${SITE_NAME}`,
    description,
    canonical,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: log.problem,
      description,
      datePublished: log.date,
      dateModified: log.date,
      author: { "@type": "Person", name: log.member },
      mainEntityOfPage: canonical,
    },
  });
  const $ = cheerio.load(page);
  $("#problem-back-member").attr("href", routePath(memberSegments(log.member)));
  $("#problem-detail").attr("data-prerendered-path", routePath(problemSegments(log)));
  return replaceProblemArticle(addSelfClosingVoids($.html()), article);
}

function writeProblemPages(html, logs) {
  for (const log of logs) writeRouteIndex(problemPageHtml(html, log), problemSegments(log));
}

function writeCrawlerFiles(members, logs) {
  const entries = [
    { segments: [], lastmod: logs[0]?.date || new Date().toISOString().slice(0, 10) },
    ...members.map((member) => ({ segments: memberSegments(member), lastmod: logs.find((log) => log.member === member)?.date })),
    ...logs.map((log) => ({ segments: problemSegments(log), lastmod: log.date })),
  ];
  const urls = entries.map(({ segments, lastmod }) => `  <url>\n    <loc>${escapeXml(absoluteUrl(segments))}</loc>${lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : ""}\n  </url>`).join("\n");
  fs.writeFileSync(path.join(OUTPUT_DIR, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, "utf8");
  fs.writeFileSync(path.join(OUTPUT_DIR, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`, "utf8");
}

function writeVersionedApp() {
  const source = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const html = source
    .replace("./lib/log-schema.mjs", `./lib/log-schema.mjs?v=${assetVersion("lib/log-schema.mjs")}`)
    .replace("./lib/journal-api.js", `./lib/journal-api.js?v=${assetVersion("lib/journal-api.js")}`)
    .replace("./lib/render-safety.mjs", `./lib/render-safety.mjs?v=${assetVersion("lib/render-safety.mjs")}`)
    .replace("./lib/constants.mjs", `./lib/constants.mjs?v=${assetVersion("lib/constants.mjs")}`)
    .replace("./lib/auth.mjs", `./lib/auth.mjs?v=${assetVersion("lib/auth.mjs")}`)
    .replace("./lib/theme.mjs", `./lib/theme.mjs?v=${assetVersion("lib/theme.mjs")}`)
    .replace("./lib/form.mjs", `./lib/form.mjs?v=${assetVersion("lib/form.mjs")}`)
    .replace("./lib/renderer.mjs", `./lib/renderer.mjs?v=${assetVersion("lib/renderer.mjs")}`)
    .replace("./lib/router.mjs", `./lib/router.mjs?v=${assetVersion("lib/router.mjs")}`)
    .replace("./lib/data.mjs", `./lib/data.mjs?v=${assetVersion("lib/data.mjs")}`);
  fs.writeFileSync(path.join(OUTPUT_DIR, "app.js"), html, "utf8");
}

function writeRouteIndex(html, segments) {
  const routeDir = path.join(OUTPUT_DIR, ...segments);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, "index.html"), html, "utf8");
}

function writeRouteIndexes(html, members, logs) {
  const routeTitles = { analysis: "训练分析", review: "错题本" };
  for (const route of Object.keys(routeTitles)) {
    const routeHtml = replaceHeadMetadata(showOnlyPage(html, `${route}-page`), {
      title: `${routeTitles[route]} · ${SITE_NAME}`,
      description: `${SITE_NAME}${routeTitles[route]}页面。`,
      canonical: absoluteUrl([route]),
      robots: "noindex,follow",
    });
    writeRouteIndex(routeHtml, [route]);
  }
  const notFoundHtml = replaceHeadMetadata(html, {
    title: `页面未找到 · ${SITE_NAME}`,
    description: "请求的页面不存在。",
    canonical: absoluteUrl(),
    robots: "noindex,follow",
  });
  fs.writeFileSync(path.join(OUTPUT_DIR, "404.html"), notFoundHtml, "utf8");
}

function writeJson(relativePath, value) {
  const outputPath = path.join(OUTPUT_DIR, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(value), "utf8");
}

function writeProblemDetails(logs, generatedAt) {
  for (const log of logs) {
    writeJson(path.join("data", "problems", log.member, log.date, `${log.problemId || log.problemIndex || 0}.json`), {
      schemaVersion: 3,
      generatedAt,
      ...log,
    });
  }
}

async function main() {
  ({ normalizeMeta } = await import("../lib/log-schema.mjs"));
  ({ escapeHtml, renderMarkdown } = await import("../lib/render-safety.mjs"));
  ({ toDateString } = await import("../lib/constants.mjs"));
  const { members, logs } = readLogs();
  const heatmap = buildHeatmapCounts(logs);
  const recent30 = buildRecentStats(logs, members);
  const generatedAt = new Date().toISOString();
  const summaryLogs = logs.map(logSummary);
  const fullData = { schemaVersion: 3, generatedAt, members, logs: summaryLogs, heatmap, recent30 };
  const overviewData = {
    schemaVersion: 3,
    generatedAt,
    members,
    logs: summaryLogs.filter((log) => log.date >= daysAgo(29)),
    heatmap,
    recent30,
  };
  const dataVersion = crypto.createHash("sha256").update(JSON.stringify(fullData)).digest("hex").slice(0, 12);

  const resolved = path.resolve(OUTPUT_DIR);
  const expected = path.resolve(path.join(ROOT, "site"));
  if (resolved !== expected) {
    console.error(`Refusing to delete unexpected directory: ${resolved} (expected ${expected})`);
    process.exit(1);
  }

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(OUTPUT_DIR, "lib"), { recursive: true });
  copyDirRecursive("vendor", path.join(OUTPUT_DIR, "vendor"));
  copyFile("style.css");
  writeVersionedApp();
  fs.copyFileSync(path.join(ROOT, "lib", "log-schema.mjs"), path.join(OUTPUT_DIR, "lib", "log-schema.mjs"));
  fs.copyFileSync(path.join(ROOT, "lib", "journal-api.js"), path.join(OUTPUT_DIR, "lib", "journal-api.js"));
  fs.copyFileSync(path.join(ROOT, "lib", "render-safety.mjs"), path.join(OUTPUT_DIR, "lib", "render-safety.mjs"));
  fs.copyFileSync(path.join(ROOT, "lib", "constants.mjs"), path.join(OUTPUT_DIR, "lib", "constants.mjs"));
  fs.copyFileSync(path.join(ROOT, "lib", "auth.mjs"), path.join(OUTPUT_DIR, "lib", "auth.mjs"));
  fs.copyFileSync(path.join(ROOT, "lib", "theme.mjs"), path.join(OUTPUT_DIR, "lib", "theme.mjs"));
  fs.copyFileSync(path.join(ROOT, "lib", "form.mjs"), path.join(OUTPUT_DIR, "lib", "form.mjs"));
  fs.copyFileSync(path.join(ROOT, "lib", "renderer.mjs"), path.join(OUTPUT_DIR, "lib", "renderer.mjs"));
  fs.copyFileSync(path.join(ROOT, "lib", "router.mjs"), path.join(OUTPUT_DIR, "lib", "router.mjs"));
  fs.copyFileSync(path.join(ROOT, "lib", "data.mjs"), path.join(OUTPUT_DIR, "lib", "data.mjs"));
  const html = writeVersionedIndex(dataVersion);
  const homeHtml = writeHomePage(html, logs);
  writeRouteIndexes(homeHtml, members, logs);
  writeMemberPages(html, members, logs);
  writeProblemPages(html, logs);
  writeCrawlerFiles(members, logs);
  if (fs.existsSync(path.join(ROOT, "CNAME"))) copyFile("CNAME");
  fs.writeFileSync(path.join(OUTPUT_DIR, ".nojekyll"), "", "utf8");
  writeJson(path.join("data", "overview.json"), overviewData);
  writeJson(path.join("data", "all.json"), fullData);
  writeProblemDetails(logs, generatedAt);
  console.log(`Generated ${logs.length} logs for ${members.length} members.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { replaceProblemArticle };
