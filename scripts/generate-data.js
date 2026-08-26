const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cheerio = require("cheerio");
const { execFileSync } = require("child_process");

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
let toUtc8;
let problemStableKey;
let problemDetailHtml;
let originalProblemUrl;
let updatedLabel;
let relatedSectionHtml;
let roadmapOverviewHtml;
let roadmapPhaseHtml;
let roadmapNodeHtml;
let tagPageHtml;
let tagIndexHtml;
let cfTagToChinese;
let SITE_ORIGIN;
let SITE_NAME;

// 批量获取多个文件各自的最后一次提交时间（一次 git log，替代每文件 spawn 一次进程）
function lastCommitDates(relPaths) {
  const map = new Map();
  if (!relPaths.length) return map;
  try {
    const out = execFileSync("git", ["log", "--format=%cI%x1f", "--name-only", "--", ...relPaths], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    let date = null;
    for (const line of out.split("\n")) {
      if (line.endsWith("\x1f")) {
        date = line.slice(0, -1);
        continue;
      }
      if (line && !map.has(line)) map.set(line, date);
    }
  } catch {
    // git 不可用时保持空表，调用方回退到 mtime
  }
  return map;
}

function readMeta(dateDir, member, date, commitDates) {
  const metaPath = path.join(dateDir, "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  const normalized = normalizeMeta(JSON.parse(fs.readFileSync(metaPath, "utf8")), {
    legacyIdPrefix: `${member}-${date}`,
  });
  // 旧记录没有 updatedAt 时，优先使用 git 最后一次提交时间
  // （文件 mtime 会被 clone/pull 重置为拉取时刻，不可靠），并统一转为 UTC+8
  if (!normalized.updatedAt) {
    const relPath = path.relative(ROOT, metaPath).split(path.sep).join("/");
    const commitDate = commitDates.get(relPath);
    normalized.updatedAt = toUtc8(commitDate || new Date(fs.statSync(metaPath).mtime));
  }
  return normalized;
}

function readProblemFile(dir, filename) {
  const p = path.join(dir, filename);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8").trim();
}

function appendDateLogs(logs, member, date, dateDir, commitDates) {
  const meta = readMeta(dateDir, member, date, commitDates);
  if (!meta || !meta.problems || !meta.problems.length) return;

  for (let i = 0; i < meta.problems.length; i++) {
    const p = meta.problems[i];
    logs.push({
      member,
      date,
      updatedAt: meta.updatedAt,
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
  const dateDirs = [];

  for (const member of members) {
    const memberDir = path.join(LOGS_DIR, member);
    const entries = fs.readdirSync(memberDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      if (LEGACY_LOG_DIR_PATTERN.test(entry.name)) {
        dateDirs.push({ member, date: entry.name, dir: path.join(memberDir, entry.name) });
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
          dateDirs.push({ member, date, dir: path.join(monthDir, dayEntry.name) });
        }
      }
    }
  }

  // 一次 git log 批量取得所有 meta.json 的最后提交时间
  const commitDates = lastCommitDates(
    dateDirs.map(({ dir }) => path.relative(ROOT, path.join(dir, "meta.json")).split(path.sep).join("/")),
  );

  const logs = [];
  for (const { member, date, dir } of dateDirs) appendDateLogs(logs, member, date, dir, commitDates);

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

function resolveStatsEnd(logs, now = new Date(), formatDate = toDateString) {
  const today = formatDate(now);
  return logs.reduce((latest, log) => log.date > latest ? log.date : latest, today);
}

function buildRecentStats(logs, members) {
  const end = resolveStatsEnd(logs);
  const endDate = new Date(`${end}T12:00:00`);
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 29);
  const start = toDateString(startDate);

  const withinRange = [];
  const grouped = new Map();
  for (const item of logs) {
    if (item.date < start || item.date > end) continue;
    withinRange.push(item);
    if (!grouped.has(item.member)) grouped.set(item.member, []);
    grouped.get(item.member).push(item);
  }

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

  // 单遍分组，避免对每个成员重复过滤整个数组（O(m×n) → O(n)）
  const byMember = { all: summarize(withinRange) };
  for (const member of members) {
    byMember[member] = summarize(grouped.get(member) || []);
  }

  return { start, end, byMember };
}

function copyFile(name) {
  fs.copyFileSync(path.join(ROOT, name), path.join(OUTPUT_DIR, name));
}

function writeVersionedModule(name) {
  const source = fs.readFileSync(path.join(ROOT, name), "utf8");
  const content = source.replace(/(["'])(\.\/[^"']+\.(?:mjs|js))\1/g, (match, quote, importPath) => {
    const dependency = path.posix.join(path.posix.dirname(name), importPath);
    return `${quote}${importPath}?v=${assetVersion(dependency)}${quote}`;
  });
  fs.writeFileSync(path.join(OUTPUT_DIR, name), content, "utf8");
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

function writeVersionedDataModule() {
  writeVersionedModule("lib/data.mjs");
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
    .update(["app.js", "lib/log-schema.mjs", "lib/journal-api.js", "lib/render-safety.mjs", "lib/constants.mjs", "lib/problem-detail.mjs", "lib/roadmap.mjs", "lib/cf-tag-map.mjs", "lib/auth.mjs", "lib/theme.mjs", "lib/form.mjs", "lib/renderer.mjs", "lib/router.mjs", "lib/data.mjs"].map((name) => fs.readFileSync(path.join(ROOT, name))).join(""))
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

// 生成 Service Worker：缓存版本由代码哈希 + 数据哈希 + 构建时间共同决定，
// 任何部署都会产生新版本 → 旧缓存自动清理，避免发布后命中陈旧资源。
function writeServiceWorker(dataVersion) {
  const version = `${appVersion()}-${dataVersion}-${Date.now().toString(36)}`;
  const sw = `// Algo Training Journal Service Worker（构建时生成，勿手改）
const VERSION = ${JSON.stringify(version)};
const CACHE = "atj-" + VERSION;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add("/")).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：网络优先，失败时回退缓存的首页（离线可用）
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // 静态资源与数据 JSON（均带版本查询或随构建整体失效）：缓存优先，未命中再请求并回填
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
`;
  fs.writeFileSync(path.join(OUTPUT_DIR, "sw.js"), sw, "utf8");
  console.log(`[write] sw.js（缓存版本 ${version}）`);
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
  const pageIds = ["overview-page", "review-page", "analysis-page", "member-page", "problem-page", "roadmap-page", "tag-page"];
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

// 训练记录摘要：标签索引 records 与节点 relatedRecords 共用的元素形状
function recordSummary(log) {
  return {
    member: log.member,
    date: log.date,
    problemId: String(log.problemId || log.problemIndex || 0),
    problem: log.problem,
    problemNumber: log.problemNumber || "",
    platform: log.platform || "",
    difficulty: log.difficulty || "",
    tags: log.tags || [],
    reviewStatus: log.reviewStatus || "none",
  };
}

function recordCardHtml(log) {
  const tags = (log.tags || []).map((tag) => `<a class="tag-chip" href="/tags/${encodeURIComponent(tag)}/">${escapeHtml(tag)}</a>`).join("");
  const reviewLabels = { todo: "待复习", mastered: "已掌握" };
  const review = reviewLabels[log.reviewStatus]
    ? `<span class="review-chip ${escapeHtml(log.reviewStatus)}">${reviewLabels[log.reviewStatus]}</span>`
    : "";
  return `<article class="record">
    <div class="record-head"><span class="record-date-wrap"><time datetime="${escapeHtml(log.date)}">${escapeHtml(log.date)}</time>${updatedLabel(log)}</span><a class="member-link" href="${routePath(memberSegments(log.member))}">${escapeHtml(log.member)}</a></div>
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

function problemPageHtml(html, log, related) {
  const canonical = absoluteUrl(problemSegments(log));
  const description = truncate(log.takeaway !== "未填写" ? log.takeaway : log.description)
    || `${log.member} 在 ${log.date} 记录的 ${log.problem} 训练题目、题解与代码。`;
  // 正文结构与浏览器端共用 lib/problem-detail.mjs 模板，避免两份维护
  const article = problemDetailHtml(log, { memberHref: routePath(memberSegments(log.member)) }) + relatedSectionHtml(related, log);
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
      dateModified: log.updatedAt ? toUtc8(log.updatedAt).slice(0, 10) : log.date,
      author: { "@type": "Person", name: log.member },
      mainEntityOfPage: canonical,
    },
  });
  const $ = cheerio.load(page);
  $("#problem-back-member").attr("href", routePath(memberSegments(log.member)));
  $("#problem-detail").attr("data-prerendered-path", routePath(problemSegments(log)));
  return replaceProblemArticle(addSelfClosingVoids($.html()), article);
}

function writeProblemPages(html, logs, problemIndex) {
  for (const log of logs) {
    const key = problemStableKey(log.platform, log.problemNumber);
    const related = key ? (problemIndex.get(key) || []) : [];
    writeRouteIndex(problemPageHtml(html, log, related), problemSegments(log));
  }
}

function writeCrawlerFiles(members, logs, extraEntries = []) {
  const entries = [
    { segments: [], lastmod: logs[0]?.date || new Date().toISOString().slice(0, 10) },
    ...members.map((member) => ({ segments: memberSegments(member), lastmod: logs.find((log) => log.member === member)?.date })),
    ...logs.map((log) => ({ segments: problemSegments(log), lastmod: log.date })),
    ...extraEntries,
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

function writeProblemDetails(logs, generatedAt, problemIndex) {
  for (const log of logs) {
    const key = problemStableKey(log.platform, log.problemNumber);
    const related = key
      ? (problemIndex.get(key) || [])
          .filter((r) => !(r.member === log.member && r.date === log.date && r.problemId === String(log.problemId || log.problemIndex || 0)))
      : [];
    writeJson(path.join("data", "problems", log.member, log.date, `${log.problemId || log.problemIndex || 0}.json`), {
      schemaVersion: 3,
      generatedAt,
      ...log,
      ...(related.length ? { related } : {}),
    });
  }
}

// 聚合全队同题记录（二刷关联）：key = 平台 + 归一化题号
// 独立运行时懒加载 problemStableKey（main() 会预置，直接 require 测试时自动 import）
async function buildProblemIndex(logs) {
  const stableKey = problemStableKey || (await import("../lib/log-schema.mjs")).problemStableKey;
  const index = new Map();
  for (const log of logs) {
    const key = stableKey(log.platform, log.problemNumber);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({
      member: log.member,
      date: log.date,
      problemId: String(log.problemId || log.problemIndex || 0),
      problem: log.problem,
      reviewStatus: log.reviewStatus || "none",
      difficulty: log.difficulty || "",
    });
  }
  return index;
}

// 全量待复习题（不受 30 天窗口限制），按复习日期升序，供首页"今日复习队列"
function buildReviewQueue(logs) {
  return logs
    .filter((log) => log.reviewStatus === "todo" && log.reviewDue)
    .map((log) => ({
      member: log.member,
      date: log.date,
      problemId: String(log.problemId || log.problemIndex || 0),
      problem: log.problem,
      problemNumber: log.problemNumber || "",
      platform: log.platform || "",
      difficulty: log.difficulty || "",
      reviewDue: log.reviewDue,
    }))
    .sort((a, b) => a.reviewDue.localeCompare(b.reviewDue) || a.member.localeCompare(b.member, "zh-CN"));
}

// ============================================================
// 学习路线（curriculum/ → site/data/roadmap*.json + /roadmap/ 预渲染页）
// ============================================================

// 读取 curriculum/，与日志交叉匹配计算进度，返回 { roadmapData, nodeDataById }；
// curriculum/ 缺失或校验失败时返回 null（不阻塞其余构建）。
async function generateRoadmapData(logs) {
  const curriculumDir = path.join(ROOT, "curriculum");
  if (!fs.existsSync(curriculumDir)) {
    console.warn("curriculum/ 不存在，跳过学习路线数据生成。");
    return null;
  }
  let curriculum;
  let problemKey;
  let buildMatchIndex;
  let computeNodeStats;
  let computePhaseStats;
  try {
    ({ readCurriculum, validateCurriculum, problemKey, buildMatchIndex, computeNodeStats, computePhaseStats } = await import("./curriculum.mjs"));
    curriculum = readCurriculum("curriculum");
    validateCurriculum(curriculum);
  } catch (error) {
    console.error(`学习路线数据读取/校验失败，跳过生成：${error.message}`);
    return null;
  }

  const { phases, nodes } = curriculum;
  const matchIndex = buildMatchIndex(logs);
  const members = [...new Set(logs.map((log) => log.member))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const generatedAt = new Date().toISOString();
  const nodeDataById = new Map();
  const nodeStatsById = new Map();

  // 全量日志标签计数（非近 30 天）：供节点 tagHits 与标签索引使用
  const logTagCounts = new Map();
  for (const log of logs) {
    for (const tag of new Set(log.tags || [])) {
      logTagCounts.set(tag, (logTagCounts.get(tag) || 0) + 1);
    }
  }

  // 节点 → 阶段（id/title）映射，供标签索引 nodes 元素取 phase 信息
  const phaseOfNode = new Map();
  for (const phase of phases) {
    for (const nodeId of phase.nodes || []) phaseOfNode.set(nodeId, { id: phase.id, title: phase.title });
  }

  for (const [id, node] of nodes) {
    const stats = computeNodeStats(node, matchIndex);
    nodeStatsById.set(id, stats);
    // 节点富化：tagHits = 节点标签去重后在日志中的命中数之和；
    // relatedRecords = 全量日志中带节点标签、但题目不在本节点题单内的记录摘要（date 降序，上限 50）
    const nodeTagSet = new Set(node.tags || []);
    const tagHits = [...nodeTagSet].reduce((sum, tag) => sum + (logTagCounts.get(tag) || 0), 0);
    const nodeProblemKeys = new Set(
      node.problems.map((problem) => problemKey(problem.platform, problem.number)).filter(Boolean),
    );
    const relatedRecords = logs
      .filter((log) => {
        if (!(log.tags || []).some((tag) => nodeTagSet.has(tag))) return false;
        const key = problemKey(log.platform, log.problemNumber);
        return !(key && nodeProblemKeys.has(key));
      })
      .map(recordSummary)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 50);
    const problems = node.problems.map((problem) => {
      const doneBy = (matchIndex.get(problemKey(problem.platform, problem.number)) || []).map((entry) => ({
        member: entry.member,
        date: entry.date,
        reviewStatus: entry.reviewStatus || "none",
        problemId: entry.problemId,
        problemName: entry.problem,
      }));
      return {
        platform: problem.platform,
        number: problem.number,
        name: problem.name || "",
        source: problem.source || "",
        role: problem.role || "",
        note: problem.note || "",
        ...(problem.rating != null ? { rating: problem.rating } : {}),
        ...(problem.difficulty ? { difficulty: problem.difficulty } : {}),
        ...(problem.tags && problem.tags.length ? { tags: problem.tags } : {}),
        url: originalProblemUrl ? originalProblemUrl(problem.platform, problem.number, problem.name) : "",
        doneBy,
      };
    });
    nodeDataById.set(id, {
      schemaVersion: 1,
      generatedAt,
      phase: { id: "", title: "" },
      node: {
        id,
        title: node.title,
        listId: node.listId || "",
        group: node.group || "",
        difficulty: node.difficulty,
        prerequisites: node.prerequisites || [],
        wiki: node.wiki || "",
        tags: node.tags || [],
        description: node.description || "",
        ref: node.ref || "",
        noiLevels: node.noiLevels || [],
        lanqiao: node.lanqiao || [],
        noiLabels: node.noiLabels || [],
        lanqiaoLabels: node.lanqiaoLabels || [],
        oiTree: node.oiTree || [],
        tagHits,
        relatedRecords,
      },
      stats,
      problems,
    });
  }

  const phaseData = phases.map((phase) => {
    const phaseNodes = phase.nodes.map((id) => nodes.get(id)).filter(Boolean);
    const nodeSummaries = phase.nodes
      .map((id) => {
        const data = nodeDataById.get(id);
        if (!data) return null;
        // 节点摘要只带 tagHits，不带 relatedRecords（避免 roadmap.json 膨胀）
        const { relatedRecords, ...nodeSummary } = data.node;
        return { ...nodeSummary, stats: data.stats };
      })
      .filter(Boolean);
    for (const id of phase.nodes) {
      const data = nodeDataById.get(id);
      if (data) data.phase = { id: phase.id, title: phase.title };
    }
    return {
      id: phase.id,
      index: phase.index,
      title: phase.title,
      subtitle: phase.subtitle || "",
      goal: phase.goal || "",
      milestone: phase.milestone || "",
      reference: phase.reference || "",
      difficulty: phase.difficulty || [],
      stats: computePhaseStats(phaseNodes, matchIndex),
      nodes: nodeSummaries,
    };
  });

  const overallStats = computePhaseStats([...nodes.values()], matchIndex);
  const roadmapData = {
    schemaVersion: 1,
    generatedAt,
    members,
    totalProblems: overallStats.totalProblems,
    totalDone: overallStats.done,
    totalMastered: overallStats.mastered,
    totalReview: overallStats.review,
    stats: overallStats,
    phases: phaseData,
  };
  // ---- 标签索引（tag-index.json + /tags/ 页数据源） ----
  // 标签全集：日志全部标签 ∪ 所有节点 node.tags ∪ 所有节点题目的 CF 标签经 cfTagToChinese 映射后的中文（去重）
  const tagSet = new Set();
  for (const log of logs) {
    for (const tag of log.tags || []) tagSet.add(tag);
  }
  for (const node of nodes.values()) {
    for (const tag of node.tags || []) tagSet.add(tag);
  }
  for (const node of nodes.values()) {
    for (const problem of node.problems || []) {
      for (const tag of problem.tags || []) {
        const mapped = cfTagToChinese(tag);
        if (mapped) tagSet.add(mapped);
      }
    }
  }

  // tag → 记录摘要（全量日志，date 降序，上限 300）
  const tagRecords = new Map();
  for (const tag of tagSet) tagRecords.set(tag, []);
  for (const log of logs) {
    for (const tag of new Set(log.tags || [])) {
      const list = tagRecords.get(tag);
      if (list) list.push(recordSummary(log));
    }
  }
  for (const list of tagRecords.values()) {
    list.sort((a, b) => b.date.localeCompare(a.date));
    if (list.length > 300) list.length = 300;
  }

  // tag → 覆盖节点（node.tags 含该标签，或该节点任一题目的任一 CF 标签映射后等于该标签）。
  // 同一节点对同一标签只记一次（先用 Set 收集节点命中的所有标签，再逐标签 push）。
  const tagNodes = new Map();
  for (const tag of tagSet) tagNodes.set(tag, []);
  for (const [id, node] of nodes) {
    const phase = phaseOfNode.get(id) || { id: "", title: "" };
    const stats = nodeStatsById.get(id) || { done: 0, totalProblems: 0, pct: 0 };
    const entry = {
      phaseId: phase.id,
      phaseTitle: phase.title,
      nodeId: id,
      nodeTitle: node.title,
      difficulty: node.difficulty,
      nodeTags: node.tags || [],
      done: stats.done,
      total: stats.totalProblems,
      pct: stats.pct,
    };
    const matched = new Set();
    for (const tag of node.tags || []) matched.add(tag);
    for (const problem of node.problems || []) {
      for (const tag of problem.tags || []) {
        const mapped = cfTagToChinese(tag);
        if (mapped) matched.add(mapped);
      }
    }
    for (const tag of matched) tagNodes.get(tag)?.push(entry);
  }

  const tagIndex = {
    schemaVersion: 1,
    generatedAt,
    tags: [...tagSet]
      .map((tag) => ({
        tag,
        recordCount: (tagRecords.get(tag) || []).length,
        records: tagRecords.get(tag) || [],
        nodes: tagNodes.get(tag) || [],
      }))
      .sort((a, b) => b.recordCount - a.recordCount || a.tag.localeCompare(b.tag, "zh-CN")),
  };

  return { roadmapData, nodeDataById, tagIndex };
}

// 写入 site/data/roadmap*.json（需在 site/ 清空重建之后调用）
function writeRoadmapData(roadmapData, nodeDataById) {
  writeJson(path.join("data", "roadmap.json"), roadmapData);
  for (const [id, nodeData] of nodeDataById) {
    writeJson(path.join("data", "roadmap", "nodes", `${id}.json`), nodeData);
  }
}

// 写入 site/data/tag-index.json（需在 site/ 清空重建之后调用）
function writeTagIndex(tagIndex) {
  writeJson(path.join("data", "tag-index.json"), tagIndex);
}

// 预渲染 /roadmap/ 三级页面
async function generateRoadmapPages(html, roadmapData, nodeDataById) {
  try {
    ({ roadmapOverviewHtml, roadmapPhaseHtml, roadmapNodeHtml, tagPageHtml, tagIndexHtml } = await import("../lib/roadmap.mjs"));
  } catch (error) {
    console.error(`lib/roadmap.mjs 不可用，跳过学习路线页面生成：${error.message}`);
    return;
  }

  function roadmapPage(title, description, segments, contentHtml) {
    const page = replaceHeadMetadata(showOnlyPage(html, "roadmap-page"), {
      title: `${title} · ${SITE_NAME}`,
      description,
      canonical: absoluteUrl(segments),
    });
    const $ = cheerio.load(page);
    // 预渲染标记：data-route 标识该页内容对应的路由，data-members 内嵌成员列表。
    // 前端首屏命中 data-route 时直接使用预渲染 HTML，不再拉取 roadmap.json / 节点 JSON。
    $("#roadmap-content").attr("data-route", segments.join("/"));
    $("#roadmap-content").attr("data-members", JSON.stringify(roadmapData.members));
    $("#roadmap-content").html(contentHtml);
    writeRouteIndex(addSelfClosingVoids($.html()), segments);
  }

  roadmapPage("学习路线", "算法知识树、分阶段训练路线与题单进度。", ["roadmap"], roadmapOverviewHtml(roadmapData, "all"));
  for (const phase of roadmapData.phases) {
    roadmapPage(phase.title, `学习路线 · ${phase.title}`, ["roadmap", phase.id], roadmapPhaseHtml(roadmapData, phase.id, "all"));
    for (const node of phase.nodes) {
      const nodeData = nodeDataById.get(node.id);
      if (!nodeData) continue;
      roadmapPage(node.title, `学习路线 · ${phase.title} · ${node.title}`, ["roadmap", phase.id, node.id], roadmapNodeHtml(nodeData, "all"));
    }
  }
}

// 预渲染 /tags/ 索引页与每个标签页（真实静态页面，SEO 待遇与题目页同等）。
// 磁盘目录用原始中文标签名（与 /member/<中文>/ 一致），href/canonical/sitemap 走 routePath/absoluteUrl 编码。
async function generateTagPages(html, tagIndex, roadmapData) {
  if (!tagPageHtml || !tagIndexHtml) {
    try {
      ({ tagPageHtml, tagIndexHtml } = await import("../lib/roadmap.mjs"));
    } catch (error) {
      console.error(`lib/roadmap.mjs 不可用，跳过标签页生成：${error.message}`);
      return;
    }
  }

  // /tags/ 索引页
  const indexDescription = "ICPC 算法训练日志的题目标签索引，每个标签聚合训练记录与知识树覆盖。";
  let indexPage = showOnlyPage(html, "tag-page");
  indexPage = replaceHeadMetadata(indexPage, {
    title: `标签索引 · ${SITE_NAME}`,
    description: indexDescription,
    canonical: absoluteUrl(["tags"]),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "标签索引",
      url: absoluteUrl(["tags"]),
      description: indexDescription,
    },
  });
  const $index = cheerio.load(indexPage);
  $index("#tag-content").attr("data-route", "tags");
  $index("#tag-content").html(tagIndexHtml(tagIndex));
  $index("#tag-page-title").text("标签索引");
  $index("#tag-page-subtitle").text(`共 ${tagIndex.tags.length} 个标签`);
  writeRouteIndex(addSelfClosingVoids($index.html()), ["tags"]);

  // 每个标签页（标签全集均生成，含 0 记录的知识树标签）
  for (const entry of tagIndex.tags) {
    const tag = entry.tag;
    const recordCount = entry.recordCount;
    const nodeCount = entry.nodes.length;
    const description = `${tag} 的训练记录与知识树覆盖：${recordCount} 条记录、${nodeCount} 个知识树节点。`;
    let page = showOnlyPage(html, "tag-page");
    page = replaceHeadMetadata(page, {
      title: `${tag} · 标签 · ${SITE_NAME}`,
      description,
      canonical: absoluteUrl(["tags", tag]),
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `${tag} · 标签`,
        url: absoluteUrl(["tags", tag]),
        description,
      },
    });
    const $ = cheerio.load(page);
    // data-tag 用原始中文，前端 decodeURIComponent 后比对
    $("#tag-content").attr("data-tag", tag);
    $("#tag-content").html(tagPageHtml(entry));
    $("#tag-page-title").text(tag);
    $("#tag-page-subtitle").text(`${recordCount} 条训练记录 · ${nodeCount} 个知识树节点覆盖`);
    writeRouteIndex(addSelfClosingVoids($.html()), ["tags", tag]);
  }
}

async function main() {
  ({ normalizeMeta, problemStableKey } = await import("../lib/log-schema.mjs"));
  ({ escapeHtml } = await import("../lib/render-safety.mjs"));
  ({ toDateString, toUtc8, SITE_ORIGIN: siteOrigin, SITE_NAME: siteName } = await import("../lib/constants.mjs"));
  ({ problemDetailHtml, originalProblemUrl, updatedLabel, relatedSectionHtml } = await import("../lib/problem-detail.mjs"));
  ({ cfTagToChinese } = await import("../lib/cf-tag-map.mjs"));
  SITE_ORIGIN = siteOrigin;
  SITE_NAME = siteName;
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
    reviewQueue: buildReviewQueue(logs),
    heatmap,
    recent30,
  };
  const problemIndex = await buildProblemIndex(logs);
  const roadmapResult = await generateRoadmapData(logs);
  const roadmapData = roadmapResult?.roadmapData || null;
  const roadmapNodeData = roadmapResult?.nodeDataById || new Map();
  const tagIndex = roadmapResult?.tagIndex || null;
  const dataVersion = crypto.createHash("sha256")
    .update(
      JSON.stringify(fullData)
        + (roadmapData ? JSON.stringify(roadmapData) : "")
        + (tagIndex ? JSON.stringify(tagIndex) : ""),
    )
    .digest("hex")
    .slice(0, 12);

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
  for (const moduleName of ["log-schema.mjs", "tag-catalog.mjs", "journal-api.js", "render-safety.mjs", "constants.mjs", "problem-detail.mjs", "roadmap.mjs", "cf-tag-map.mjs", "auth.mjs", "theme.mjs", "form.mjs", "renderer.mjs", "router.mjs"]) {
    writeVersionedModule(`lib/${moduleName}`);
  }
  writeVersionedDataModule();
  const html = writeVersionedIndex(dataVersion);
  writeServiceWorker(dataVersion);
  const homeHtml = writeHomePage(html, logs);
  writeRouteIndexes(homeHtml, members, logs);
  writeMemberPages(html, members, logs);
  writeProblemPages(html, logs, problemIndex);
  if (roadmapData) {
    writeRoadmapData(roadmapData, roadmapNodeData);
    writeTagIndex(tagIndex);
    await generateRoadmapPages(html, roadmapData, roadmapNodeData);
    await generateTagPages(html, tagIndex, roadmapData);
  }
  writeCrawlerFiles(members, logs, roadmapData ? [
    { segments: ["roadmap"], lastmod: roadmapData.generatedAt.slice(0, 10) },
    ...roadmapData.phases.flatMap((phase) => [
      { segments: ["roadmap", phase.id], lastmod: roadmapData.generatedAt.slice(0, 10) },
      ...phase.nodes.map((node) => ({ segments: ["roadmap", phase.id, node.id], lastmod: roadmapData.generatedAt.slice(0, 10) })),
    ]),
    { segments: ["tags"], lastmod: roadmapData.generatedAt.slice(0, 10) },
    ...tagIndex.tags.map((entry) => ({ segments: ["tags", entry.tag], lastmod: roadmapData.generatedAt.slice(0, 10) })),
  ] : []);
  if (fs.existsSync(path.join(ROOT, "CNAME"))) copyFile("CNAME");
  fs.writeFileSync(path.join(OUTPUT_DIR, ".nojekyll"), "", "utf8");
  writeJson(path.join("data", "overview.json"), overviewData);
  writeJson(path.join("data", "all.json"), fullData);
  writeProblemDetails(logs, generatedAt, problemIndex);
  console.log(`Generated ${logs.length} logs for ${members.length} members.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { replaceProblemArticle, resolveStatsEnd, buildProblemIndex, buildReviewQueue };
