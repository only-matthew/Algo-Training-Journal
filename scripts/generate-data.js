let trainingCardHtml;
let expandTrainingInterval;
let mergeTrainingDates;
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cheerio = require("cheerio");
const { transformSync } = require("esbuild");
const { buildBrowser } = require("./build-browser.js");
const { execFileSync } = require("child_process");

function addSelfClosingVoids(html) {
  return html.replace(/<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b([^>]*?)>/gi, "<$1$2 />");
}

const ROOT = path.join(__dirname, "..");
const LOGS_DIR = path.join(ROOT, "logs");
const OUTPUT_DIR = path.join(ROOT, "site");
const BUILD_STATE_PATH = path.join(ROOT, ".build-cache", "site-state.json");
let browserAssets;
let previousBuildState = { entries: {} };
let nextBuildState = { schemaVersion: 1, entries: {} };
let buildShellHash = "";
let problemShellHash = "";
let incrementalHits = 0;
let incrementalMisses = 0;
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
let assessMastery;
let buildVitality;
let vitalityRecordKey;
let vitalityChartHtml;
let memberVitalityDetailsHtml;
let SITE_ORIGIN;
let SITE_NAME;
let normalizeLearningState;
function learningState(record) {
  return normalizeLearningState ? normalizeLearningState(record) : {
    outcome: record?.outcome,
    masteryStatus: record?.masteryStatus || (record?.reviewStatus === "mastered" ? "mastered" : "unknown"),
    isMistake: record?.isMistake === true,
    reviewStatus: ["none", "todo", "archived"].includes(record?.reviewStatus) ? record.reviewStatus : "none",
  };
}

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
    const slot = Number.isInteger(p.fileIndex) && p.fileIndex >= 0 ? p.fileIndex : i;
    logs.push({
      member,
      date,
      startedOn: meta.startedOn,
      solvedOn: meta.solvedOn,
      updatedAt: meta.updatedAt,
      problemIndex: i,
      problemId: p.id,
      problem: p.name || "未填写",
      platform: p.platform || "未填写",
      problemNumber: p.problemNumber || "",
      description: readProblemFile(dateDir, `${slot}-desc.md`),
      takeaway: readProblemFile(dateDir, `${slot}-takeaway.md`) || "未填写",
      difficulty: p.difficulty || "未标注",
      difficultyRating: Number.isFinite(Number(p.difficultyRating)) ? Number(p.difficultyRating) : 0,
      tags: p.tags || [],
      ...learningState(p),
      ...(p.reviewDue ? { reviewDue: p.reviewDue } : {}),
      code: readProblemFile(dateDir, `${slot}-solution.cpp`),
      ...(p.statementAttachment ? { statementAttachment: p.statementAttachment, statementPath: path.join(dateDir, `${slot}-statement-${p.statementAttachment.sha256}.pdf`) } : {}),
      ...(Array.isArray(p.statementImages) && p.statementImages.length ? { statementImages: p.statementImages, statementImagePaths: new Map(p.statementImages.map((image) => [image.fileName, path.join(dateDir, image.fileName)])) } : {}),
      ...(p.statementSource ? { statementSource: p.statementSource } : {}),
      ...(p.metadataSources ? { metadataSources: p.metadataSources } : {}),
      ...(p.aiAnalysis ? { aiAnalysis: p.aiAnalysis } : {}),
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
// 热力图两套口径：
//   count —— 当天做了几道题（保留原口径，供“题数”展示对照）
//   value —— 当天的活力指数合计（做 1 道提高题 = 深色，做 3 道入门题 = 浅色）
function buildHeatmapCounts(logs) {
  const all = {};
  const byMember = {};
  const valueAll = {};
  const valueByMember = {};

  for (const log of logs) {
    const dates = expandTrainingInterval(log, log.date);
    for (const day of dates) {
      all[day] = (all[day] || 0) + 1;
      byMember[log.member] ??= {};
      byMember[log.member][day] = (byMember[log.member][day] || 0) + 1;
      const vitality = Number(log.vitality) || 0;
      valueAll[day] = Number(((valueAll[day] || 0) + vitality / dates.length).toFixed(3));
      valueByMember[log.member] ??= {};
      valueByMember[log.member][day] = Number(((valueByMember[log.member][day] || 0) + vitality / dates.length).toFixed(3));
    }
  }

  return { all, byMember, valueAll, valueByMember };
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
      // 难度统计统一按 CF Rating 展示（历史记录可能缺 difficultyRating，归入「未标注」）
      const rating = Number(item.difficultyRating) || 0;
      const key = rating > 0 ? `★ ${rating}` : (item.difficulty || "未标注");
      byDifficulty[key] = (byDifficulty[key] || 0) + 1;
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
function writeStylesheet() {
  // Preserve the cascade while serving one compressed, versioned stylesheet.
  const source = ["style.css", "assets/final.css", "assets/details.css"]
    .map((name) => fs.readFileSync(path.join(ROOT, name), "utf8"))
    .join("\n")
    .replaceAll("/assets/ink-mountains.webp", `/assets/ink-mountains.webp?v=${assetVersion("assets/ink-mountains.webp")}`);
  const { code } = transformSync(source, { loader: "css", minify: true, legalComments: "eof" });
  fs.writeFileSync(path.join(OUTPUT_DIR, "style.css"), code, "utf8");
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

// 附件与图片的本地路径是构建期的中间量，不能出现在站点数据里（Map 还会序列化成 {}）。
function logSummary({ description, takeaway, code, statementPath, statementImagePaths, ...summary }) {
  return { ...summary, summary: truncate(description || takeaway || "", 96) };
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateString(date);
}

function appVersion() {
  return browserAssets.version;
}

function writeVersionedIndex(dataVersion) {
  const raw = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const $ = cheerio.load(raw);
  $('meta[name="journal-data-version"]').attr("content", dataVersion);
  const styleVersion = crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(OUTPUT_DIR, "style.css"))).digest("hex").slice(0, 12);
  $('link[rel="stylesheet"][href^="style.css"]').attr("href", `style.css?v=${styleVersion}`);
  $('link[rel="stylesheet"][href^="assets/final.css"], link[rel="stylesheet"][href^="assets/details.css"]').remove();
  $('link[rel="preload"][as="image"]').attr("href", `assets/ink-mountains.webp?v=${assetVersion("assets/ink-mountains.webp")}`);
  $('script[src^="app.js"]').attr("src", `assets/js/${browserAssets.entry}`);
  for (const dependency of browserAssets.preloads) {
    $("<link>").attr({ rel: "modulepreload", href: `assets/js/${dependency}` }).appendTo("head");
  }
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
    difficultyRating: Number(log.difficultyRating) || 0,
    vitality: Number(log.vitality) || 0,
    vitalityStatus: log.vitalityStatus,
    vitalityOutcome: log.vitalityOutcome,
    tags: log.tags || [],
    ...learningState(log),
  };
}

function recordCardHtml(log) { return `<article class="record">${trainingCardHtml(log)}</article>`; }

function writeHomePage(html, logs, totalVitality = 0) {
  const recentLogs = logs.filter((log) => log.date >= daysAgo(29));
  // 首页运行时与 renderLogs 保持同一分页大小，避免把全部近 30 天记录
  // 先塞进首屏 HTML，再由脚本立即替换成 4 张卡片。
  const initialLogs = recentLogs.slice(0, 4);
  const cards = recentLogs.length ? initialLogs.map(recordCardHtml).join("\n") : "<p>近 30 天暂无训练记录。</p>";
  const description = "ICPC 算法训练日志，汇总队员的刷题记录、原创题解、复盘收获和代码。";
  const withMeta = replaceHeadMetadata(html, {
    title: SITE_NAME,
    description,
    canonical: absoluteUrl(),
    jsonLd: { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: absoluteUrl(), description },
  });
  const $ = cheerio.load(withMeta);
  $("#records").html(cards);
  $("#record-count").text(recentLogs.length ? `近 30 天共 ${recentLogs.length} 条记录` : "");
  $("#site-total-badge").text(String(logs.length)).removeClass("loading-value");
  // 活力指数：与累计题数并排展示，题数口径保持原样不动
  const vitalityBadge = $("#site-vitality-badge");
  if (vitalityBadge.length) vitalityBadge.text(totalVitality.toFixed(1)).removeClass("loading-value");
  const output = addSelfClosingVoids($.html());
  fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), output, "utf8");
  return output;
}

function writeMemberPages(html, members, logs, vitality) {
  for (const member of members) {
    const memberLogs = logs.filter((log) => log.member === member);
    const outputPath = path.join("member", member, "index.html");
    const stateKey = `member:${member}`;
    const stateHash = contentHash({ shell: buildShellHash, logs: memberLogs.map(logSummary), vitality: vitality.byMember[member] });
    if (reuseGenerated(stateKey, stateHash, outputPath)) continue;
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
    const scope = vitality.byMember[member];
    $("#member-vitality-total").text((scope?.total || 0).toFixed(1));
    $("#member-vitality-chart").html(vitalityChartHtml(scope?.daily, { total: scope?.total }));
    $("#member-vitality-details").html(memberVitalityDetailsHtml(scope));
    $("#member-days").removeClass("loading-value").text(activeDays);
    $("#member-recent").removeClass("loading-value").text(recentCount);
    $("#member-record-count").text(`共 ${memberLogs.length} 道题，每道题均可单独打开和分享`);
    $("#member-records").html(memberLogs.slice(0, 40).map(recordCardHtml).join("\n") || "<p>暂无训练记录。</p>");
    writeRouteIndex(addSelfClosingVoids($.html()), memberSegments(member));
    rememberGenerated(stateKey, stateHash, outputPath);
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
  const article = problemDetailHtml({ ...log, related }, { memberHref: routePath(memberSegments(log.member)) });
  const $source = cheerio.load(html);
  const dataVersion = $source('meta[name="journal-data-version"]').attr("content") || "";
  const stylesheet = $source('link[rel="stylesheet"][href^="style.css"]').attr("href") || "/style.css";
  const title = `${log.problem} · ${log.member} · ${SITE_NAME}`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: log.problem,
    description,
    datePublished: log.date,
    dateModified: log.updatedAt ? toUtc8(log.updatedAt).slice(0, 10) : log.date,
    author: { "@type": "Person", name: log.member },
    mainEntityOfPage: canonical,
  }).replace(/</g, "\\u003c");
  const memberHref = routePath(memberSegments(log.member));
  const iconSvg = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/></svg>';
  return addSelfClosingVoids(`<!doctype html><html lang="zh-CN"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="journal-data-version" content="${escapeHtml(dataVersion)}"><meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow"><meta property="og:type" content="article"><meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}">
  <meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://algo-oauth.xialiao.org; img-src 'self' https://avatars.githubusercontent.com data:;">
  <base href="/"><title>${escapeHtml(title)}</title><link rel="canonical" href="${escapeHtml(canonical)}"><link rel="sitemap" type="application/xml" href="${SITE_ORIGIN}/sitemap.xml">
  <link rel="stylesheet" href="/${escapeHtml(stylesheet.replace(/^\/+/, ""))}"><script type="application/ld+json">${jsonLd}</script>
</head><body class="problem-standalone"><a class="skip-link" href="#main-content">跳到内容</a>
<header class="app-header"><div class="header-inner"><a class="brand" href="/"><svg class="mountain-logo" viewBox="0 0 64 40" aria-hidden="true"><path fill="currentColor" d="m2 35 13-19 9 13-9-5-5 11zm14 0L34 3l28 32H49L34 17l8 18H30l-7-10 4 10z"/></svg><span>ACM 训练日志<small>记录 · 思考 · 成长</small></span></a>
<nav class="desktop-nav" aria-label="主导航"><a href="/">首页</a><a href="/analysis/">训练档案</a><a href="/review/">复习</a><a href="/roadmap/">知识地图</a><a href="/tags/">标签</a></nav>
<div class="header-actions"><button id="btn-theme" class="icon-btn" type="button" aria-label="切换主题"></button><span id="auth-status" class="auth-status" aria-hidden="true"></span><span id="account-label" class="account-label">公开浏览</span><button id="btn-login" class="btn btn-outline btn-sm" type="button">登录</button><button id="btn-logout" class="btn btn-outline btn-sm" type="button" style="display:none">退出</button><a id="btn-submit" class="btn btn-primary btn-sm" href="/submit/">提交记录</a></div></div></header>
<main id="main-content" class="main"><section id="problem-page" class="page-view active"><div class="detail-toolbar"><a id="problem-back-member" href="${escapeHtml(memberHref)}">${escapeHtml(log.member)} / 题目列表</a><a href="/analysis/">训练档案</a><details id="export-bar" class="problem-export-menu"><summary class="btn btn-outline">导出</summary><div class="problem-export-options"><button type="button" id="btn-export-pdf" class="btn btn-outline">${iconSvg}导出 PDF</button><button type="button" id="btn-export-md" class="btn btn-outline">${iconSvg}导出 Markdown</button><button type="button" id="btn-export-latex" class="btn btn-outline">${iconSvg}导出 LaTeX</button></div></details></div><article id="problem-detail" class="problem-detail" data-prerendered-path="${escapeHtml(routePath(problemSegments(log)))}">${article}</article></section></main>
<footer class="footer"><span>ACM 训练日志 · 记录 · 思考 · 成长</span><a href="https://xialiao.org/" target="_blank" rel="noopener noreferrer">© 2026 Xia Liao</a></footer>
<script type="module" src="/assets/js/${escapeHtml(browserAssets.problemEntry)}"></script></body></html>`);
}

function writeProblemPages(html, logs, problemIndex) {
  for (const log of logs) {
    const key = problemStableKey(log.platform, log.problemNumber);
    const related = key ? (problemIndex.get(key) || []) : [];
    const segments = problemSegments(log);
    const output = path.join(...segments, "index.html");
    const stateKey = `problem-page:${segments.join("/")}`;
    const stateHash = problemDependencyHash(log, related, problemShellHash);
    if (reuseGenerated(stateKey, stateHash, output)) continue;
    writeRouteIndex(problemPageHtml(html, log, related), problemSegments(log));
    rememberGenerated(stateKey, stateHash, output);
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

function writeRouteIndex(html, segments) {
  const routeDir = path.join(OUTPUT_DIR, ...segments);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, "index.html"), html, "utf8");
}

function writeRouteIndexes(html, members, logs) {
  const routeTitles = { analysis: "训练档案", review: "错题本", submit: "提交训练日志" };
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
  const content = JSON.stringify(value);
  if (fs.existsSync(outputPath) && fs.readFileSync(outputPath, "utf8") === content) return false;
  fs.writeFileSync(outputPath, content, "utf8");
  return true;
}

function contentHash(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function problemDependencyHash(log, related, shell = "") {
  return contentHash({ shell, log, related });
}

function tagDependencyHash(entry, shell = "") {
  return contentHash({ shell, entry });
}

function rememberGenerated(key, hash, output) {
  nextBuildState.entries[key] = { hash, outputs: [output.split(path.sep).join("/")] };
}

function reuseGenerated(key, hash, output) {
  const entry = previousBuildState.entries?.[key];
  const exists = fs.existsSync(path.join(OUTPUT_DIR, output));
  if (entry?.hash === hash && exists) {
    nextBuildState.entries[key] = entry;
    incrementalHits += 1;
    return true;
  }
  incrementalMisses += 1;
  return false;
}

function loadBuildState() {
  try { return JSON.parse(fs.readFileSync(BUILD_STATE_PATH, "utf8")); } catch { return { entries: {} }; }
}

function finalizeBuildState() {
  const keep = new Set(Object.values(nextBuildState.entries).flatMap((entry) => entry.outputs || []));
  for (const [key, entry] of Object.entries(previousBuildState.entries || {})) {
    for (const relative of entry.outputs || []) {
      if (keep.has(relative)) continue;
      const target = path.resolve(OUTPUT_DIR, relative);
      if (!target.startsWith(path.resolve(OUTPUT_DIR) + path.sep)) throw new Error(`拒绝清理站点目录外文件：${target}`);
      if (key.startsWith("problem-page:") && path.basename(target) === "index.html") {
        fs.rmSync(path.dirname(target), { recursive: true, force: true });
      } else {
        fs.rmSync(target, { force: true });
      }
    }
  }
  fs.mkdirSync(path.dirname(BUILD_STATE_PATH), { recursive: true });
  fs.writeFileSync(BUILD_STATE_PATH, JSON.stringify(nextBuildState), "utf8");
}

function removeUnlistedFiles(relativeRoot, keepRelativePaths) {
  const root = path.resolve(OUTPUT_DIR, relativeRoot);
  if (!fs.existsSync(root)) return;
  const keep = new Set(keepRelativePaths.map((item) => path.resolve(OUTPUT_DIR, item)));
  for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const target = path.resolve(entry.parentPath, entry.name);
    if (!target.startsWith(root + path.sep) || keep.has(target)) continue;
    fs.rmSync(target, { force: true });
  }
}

function cleanupBrowserAssets() {
  const keep = Object.keys(browserAssets.metafile.outputs).map((name) => path.relative(OUTPUT_DIR, path.resolve(ROOT, name)));
  removeUnlistedFiles(path.join("assets", "js"), keep);
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function writeJournalShards(summaryLogs, generatedAt, members) {
  const months = [];
  for (const [month, logs] of groupBy(summaryLogs, (log) => log.date.slice(0, 7))) {
    const relativePath = path.join("data", "logs", `${month}.json`);
    writeJson(relativePath, { schemaVersion: 1, generatedAt, logs });
    months.push({ id: month, url: relativePath.split(path.sep).join("/"), count: logs.length });
  }
  months.sort((a, b) => b.id.localeCompare(a.id));

  const memberIndex = {};
  for (const member of members) {
    const memberLogs = summaryLogs.filter((log) => log.member === member);
    const years = [];
    for (const [year, logs] of groupBy(memberLogs, (log) => log.date.slice(0, 4))) {
      const relativePath = path.join("data", "members", member, `${year}.json`);
      writeJson(relativePath, { schemaVersion: 1, generatedAt, member, logs });
      years.push({ id: year, url: `data/members/${encodeURIComponent(member)}/${year}.json`, count: logs.length });
    }
    years.sort((a, b) => b.id.localeCompare(a.id));
    memberIndex[member] = { count: memberLogs.length, years };
  }

  const reviewLogs = summaryLogs.filter((log) => log.reviewStatus !== "none" || log.isMistake === true);
  const reviewUrl = path.join("data", "review.json");
  writeJson(reviewUrl, { schemaVersion: 1, generatedAt, logs: reviewLogs });
  const manifest = {
    schemaVersion: 1,
    generatedAt,
    totalLogs: summaryLogs.length,
    months,
    members: memberIndex,
    review: { url: reviewUrl.split(path.sep).join("/"), count: reviewLogs.length },
  };
  writeJson(path.join("data", "manifest.json"), manifest);
  removeUnlistedFiles(path.join("data", "logs"), months.map((entry) => entry.url));
  removeUnlistedFiles(path.join("data", "members"), Object.values(memberIndex).flatMap((entry) => entry.years.map((year) => decodeURIComponent(year.url))));
  return manifest;
}

function writeProblemDetails(logs, generatedAt, problemIndex) {
  for (const log of logs) {
    const key = problemStableKey(log.platform, log.problemNumber);
    const related = key
      ? (problemIndex.get(key) || [])
          .filter((r) => !(r.member === log.member && r.date === log.date && r.problemId === String(log.problemId || log.problemIndex || 0)))
      : [];
    const detailOutput = path.join("data", "problems", log.member, log.date, `${log.problemId || log.problemIndex || 0}.json`);
    const detailKey = `problem-data:${log.member}/${log.date}/${log.problemId || log.problemIndex || 0}`;
    const detailHash = problemDependencyHash(log, related);
    if (reuseGenerated(detailKey, detailHash, detailOutput)) continue;
    let attachmentUrl = "";
    if (log.statementAttachment) {
      if (!log.statementPath || !fs.existsSync(log.statementPath)) throw new Error(`缺少题面附件：${log.member}/${log.date}/${log.problemId}`);
      const bytes = fs.readFileSync(log.statementPath);
      const actual = crypto.createHash("sha256").update(bytes).digest("hex");
      if (actual !== log.statementAttachment.sha256 || bytes.length !== log.statementAttachment.bytes) throw new Error(`题面附件校验失败：${log.member}/${log.date}/${log.problemId}`);
      const fileName = `statement-${actual}.pdf`;
      const target = path.join(OUTPUT_DIR, "problem", log.member, log.date, String(log.problemId || log.problemIndex || 0), fileName);
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(log.statementPath, target);
      attachmentUrl = `/${["problem", log.member, log.date, String(log.problemId || log.problemIndex || 0), fileName].map(encodeURIComponent).join("/")}`;
    }
    // 题面图片：与 PDF 同样校验哈希后发布；正文里的相对文件名改写成站点地址。
    // 描述在仓库里保持相对路径（GitHub 能直接渲染），站内靠这一步变成绝对地址。
    const description = publishStatementImages(log);
    const { statementPath, statementImagePaths, ...detailLog } = log;
    writeJson(detailOutput, {
      schemaVersion: 3,
      generatedAt,
      ...detailLog,
      description,
      ...(attachmentUrl ? { statementUrl: attachmentUrl } : {}),
      ...(related.length ? { related } : {}),
    });
    rememberGenerated(detailKey, detailHash, detailOutput);
  }
}

/**
 * 发布某条记录引用的题面图片，并返回把相对文件名换成站点地址后的描述。
 *
 * 正文里出现 `statement-<sha256>.<ext>` 却不在归档清单里，说明记录与仓库不一致
 * （服务端保存时会校验，只有手工改仓库才会出现）——构建期直接报错，不发布坏链接。
 */
function publishStatementImages(log, outputDir = OUTPUT_DIR) {
  const description = String(log.description || "");
  const images = Array.isArray(log.statementImages) ? log.statementImages : [];
  if (!images.length) {
    const dangling = /statement-[a-f0-9]{64}\.(?:png|jpg|gif|webp)/.exec(description);
    if (dangling) throw new Error(`题面图片未归档：${log.member}/${log.date}/${log.problemId} 引用了 ${dangling[0]}`);
    return description;
  }
  const problemId = String(log.problemId || log.problemIndex || 0);
  let next = description;
  for (const image of images) {
    const source = log.statementImagePaths?.get(image.fileName);
    if (!source || !fs.existsSync(source)) throw new Error(`缺少题面图片：${log.member}/${log.date}/${problemId} 的 ${image.fileName}`);
    const bytes = fs.readFileSync(source);
    const actual = crypto.createHash("sha256").update(bytes).digest("hex");
    if (actual !== image.sha256 || bytes.length !== image.bytes) throw new Error(`题面图片校验失败：${log.member}/${log.date}/${problemId} 的 ${image.fileName}`);
    const target = path.join(outputDir, "problem", log.member, log.date, problemId, image.fileName);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target);
    const url = `/${["problem", log.member, log.date, problemId, image.fileName].map(encodeURIComponent).join("/")}`;
    // 抓取写入的是 `./statement-<sha>.<ext>`；手工补的引用可能没有 `./` 前缀，两种都换。
    // 一次替换到位：分两步做会把结果里的文件名再换一遍（URL 里也含该文件名）。
    next = next.replace(new RegExp(`(?:\\./)?${image.fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), url);
  }
  return next;
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
      ...learningState(log),
      difficulty: log.difficulty || "",
      difficultyRating: Number(log.difficultyRating) || 0,
    });
  }
  return index;
}

// 全量待复习题（不受 30 天窗口限制），按复习日期升序，供首页"今日复习队列"
function buildReviewQueue(logs) {
  return logs
    .filter((log) => learningState(log).reviewStatus === "todo" && log.reviewDue)
    .map((log) => ({
      member: log.member,
      date: log.date,
      problemId: String(log.problemId || log.problemIndex || 0),
      problem: log.problem,
      problemNumber: log.problemNumber || "",
      platform: log.platform || "",
      difficulty: log.difficulty || "",
      difficultyRating: Number(log.difficultyRating) || 0,
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
  let buildNodeTrainingEvidence;
  let computeNodeStats;
  let computePhaseStats;
  try {
    ({ readCurriculum, validateCurriculum, problemKey, buildMatchIndex, buildNodeTrainingEvidence, computeNodeStats, computePhaseStats } = await import("./curriculum.mjs"));
    curriculum = readCurriculum("curriculum");
    validateCurriculum(curriculum);
  } catch (error) {
    console.error(`学习路线数据读取/校验失败，跳过生成：${error.message}`);
    return null;
  }

  const { phases, nodes } = curriculum;
  const matchIndex = buildMatchIndex(logs);
  const members = [...new Set(logs.map((log) => log.member))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const generatedAt = logs.map((log) => log.updatedAt).filter(Boolean).sort().at(-1) || new Date().toISOString();
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
    // 节点富化：tagHits 是标签命中热度；trainingEvidence 同时统计题单内和题单外训练，
    // relatedRecords 保留题单外记录详情以供节点页追溯。
    const nodeTagSet = new Set(node.tags || []);
    const tagHits = [...nodeTagSet].reduce((sum, tag) => sum + (logTagCounts.get(tag) || 0), 0);
    const evidence = buildNodeTrainingEvidence(node, logs);
    // 掌握度：整体 evidence 与 byMember 每项分别评估，referenceDate 用构建当天保证产物稳定
    const refDate = toDateString(new Date());
    const overallMastery = assessMastery(evidence, refDate);
    const trainingEvidence = {
      state: overallMastery.state,
      confidence: overallMastery.confidence,
      reason: overallMastery.reason,
      action: overallMastery.action,
      ...(overallMastery.daysSinceTraining != null ? { daysSinceTraining: overallMastery.daysSinceTraining } : {}),
      totalRecords: evidence.totalRecords,
      relatedRecords: evidence.relatedRecords,
      masteredRecords: evidence.masteredRecords,
      todoRecords: evidence.todoRecords,
      lastTrainedAt: evidence.lastTrainedAt,
      byMember: evidence.byMember.map((entry) => {
        const memberMastery = assessMastery(entry, refDate);
        return {
          member: entry.member,
          totalRecords: entry.totalRecords,
          relatedRecords: entry.relatedRecords,
          masteredRecords: entry.masteredRecords,
          todoRecords: entry.todoRecords,
          lastTrainedAt: entry.lastTrainedAt,
          state: memberMastery.state,
          confidence: memberMastery.confidence,
          reason: memberMastery.reason,
          action: memberMastery.action,
          ...(memberMastery.daysSinceTraining != null ? { daysSinceTraining: memberMastery.daysSinceTraining } : {}),
        };
      }),
    };
    const relatedRecords = evidence.related
      .map(recordSummary)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 50);
    const problems = node.problems.map((problem) => {
      const doneBy = (matchIndex.get(problemKey(problem.platform, problem.number)) || []).map((entry) => ({
        member: entry.member,
        date: entry.date,
        ...learningState(entry),
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
        trainingEvidence,
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
        // 节点摘要带紧凑的 trainingEvidence，不带可追溯记录正文（避免 roadmap.json 膨胀）
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
  const tags = tagIndex.tags.map(({ records, ...summary }) => summary);
  writeJson(path.join("data", "tag-index.json"), { ...tagIndex, tags });
  const outputs = [];
  for (const entry of tagIndex.tags) {
    const relativePath = path.join("data", "tags", `${entry.tag}.json`);
    writeJson(relativePath, entry);
    outputs.push(relativePath);
  }
  removeUnlistedFiles(path.join("data", "tags"), outputs);
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
    $("#roadmap-toolbar").attr("hidden", segments.length === 1 ? "" : null);
    writeRouteIndex(addSelfClosingVoids($.html()), segments);
  }

  roadmapPage("知识地图", "按主题查阅算法参考题、关联标签与队内训练记录。", ["roadmap"], roadmapOverviewHtml(roadmapData, "all"));
  for (const phase of roadmapData.phases) {
    roadmapPage(phase.title, `知识地图 · ${phase.title}`, ["roadmap", phase.id], roadmapPhaseHtml(roadmapData, phase.id, "all"));
    for (const node of phase.nodes) {
      const nodeData = nodeDataById.get(node.id);
      if (!nodeData) continue;
      roadmapPage(node.title, `知识地图 · ${phase.title} · ${node.title}`, ["roadmap", phase.id, node.id], roadmapNodeHtml(nodeData, "all"));
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
  $index("#tag-toolbar").attr("hidden", "");
  $index("#tag-page-title").text("标签索引");
  $index("#tag-page-subtitle").text(`共 ${tagIndex.tags.length} 个标签`);
  writeRouteIndex(addSelfClosingVoids($index.html()), ["tags"]);

  // 每个标签页（标签全集均生成，含 0 记录的知识树标签）
  for (const entry of tagIndex.tags) {
    const tag = entry.tag;
    const outputPath = path.join("tags", tag, "index.html");
    const stateKey = `tag-page:${tag}`;
    const stateHash = tagDependencyHash(entry, buildShellHash);
    if (reuseGenerated(stateKey, stateHash, outputPath)) continue;
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
    $("#tag-page-subtitle").text(`${recordCount} 条训练记录 · ${nodeCount} 个知识主题关联`);
    $("#tag-toolbar").removeAttr("hidden");
    writeRouteIndex(addSelfClosingVoids($.html()), ["tags", tag]);
    rememberGenerated(stateKey, stateHash, outputPath);
  }
}

async function main() {
  ({ normalizeMeta, problemStableKey } = await import("../lib/log-schema.mjs"));
  ({ normalizeLearningState } = await import("../lib/learning-state.mjs"));
  ({ escapeHtml } = await import("../lib/render-safety.mjs"));
  ({ toDateString, toUtc8, SITE_ORIGIN: siteOrigin, SITE_NAME: siteName } = await import("../lib/constants.mjs"));
  ({ problemDetailHtml, originalProblemUrl, updatedLabel, relatedSectionHtml } = await import("../lib/problem-detail.mjs"));
  ({ cfTagToChinese } = await import("../lib/cf-tag-map.mjs"));
  ({ assessMastery } = await import("../lib/mastery.mjs"));
  ({ buildVitality } = await import("../lib/vitality-summary.mjs"));
  ({ expandTrainingInterval, mergeTrainingDates } = await import("../lib/training-interval.mjs"));
  ({ vitalityRecordKey } = await import("../lib/vitality.mjs"));
  ({ vitalityChartHtml } = await import("../lib/vitality-chart.mjs"));
  ({ memberVitalityDetailsHtml } = await import("../lib/member-vitality.mjs"));
  SITE_ORIGIN = siteOrigin;
  SITE_NAME = siteName;
  const { members, logs } = readLogs();
  // 活力指数按「题目 Rating + 当时水平」折算；结果写回每条记录，供卡片与统计使用
  const vitality = buildVitality(logs);
  for (const log of logs) Object.assign(log, vitality.byRecord.get(vitalityRecordKey(log)));
  const totalVitality = vitality.total;
  const vitalityAllDaily = vitality.allDaily;
  const heatmap = buildHeatmapCounts(logs);
  const recent30 = buildRecentStats(logs, members);
  const generatedAt = logs.map((log) => log.updatedAt).filter(Boolean).sort().at(-1) || new Date().toISOString();
  const summaryLogs = logs.map(logSummary);
  const allReviewQueue = buildReviewQueue(logs);
  const today = toDateString(new Date());
  const dueReviewQueue = allReviewQueue.filter((item) => item.reviewDue <= today);
  const heatmapData = { ...heatmap, vitalityByMember: vitality.byMember };
  const overviewData = {
    schemaVersion: 3,
    generatedAt,
    members,
    totalLogs: logs.length, // 全队自建站以来的总刷题数（首页标题徽标）
    logs: summaryLogs.filter((log) => log.date >= daysAgo(29)),
    reviewQueue: dueReviewQueue.slice(0, 100),
    reviewQueueTotalDue: dueReviewQueue.length,
    heatmap: heatmapData,
    recent30,
    vitality: vitality.byMember,
    vitalityAllDaily,
    totalVitality,
    vitalityVersion: vitality.algorithmVersion,
  };  const problemIndex = await buildProblemIndex(logs);
  const roadmapResult = await generateRoadmapData(logs);
  const roadmapData = roadmapResult?.roadmapData || null;
  const roadmapNodeData = roadmapResult?.nodeDataById || new Map();
  const tagIndex = roadmapResult?.tagIndex || null;
  const versionJson = (value) => JSON.stringify(value, (key, item) => key === "generatedAt" ? undefined : item);
  const dataVersion = crypto.createHash("sha256")
    .update(
      versionJson(overviewData)
        + (roadmapData ? versionJson(roadmapData) : "")
        + (tagIndex ? versionJson(tagIndex) : ""),
    )
    .digest("hex")
    .slice(0, 12);

  const resolved = path.resolve(OUTPUT_DIR);
  const expected = path.resolve(path.join(ROOT, "site"));
  if (resolved !== expected) {
    console.error(`Refusing to delete unexpected directory: ${resolved} (expected ${expected})`);
    process.exit(1);
  }

  previousBuildState = loadBuildState();
  nextBuildState = { schemaVersion: 1, entries: {} };
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  copyDirRecursive("vendor", path.join(OUTPUT_DIR, "vendor"));
  ({ trainingCardHtml } = await import("../lib/ui.mjs"));
  writeStylesheet();
  copyDirRecursive("assets", path.join(OUTPUT_DIR, "assets"));
  browserAssets = buildBrowser(ROOT, path.join(OUTPUT_DIR, "assets", "js"));
  cleanupBrowserAssets();
  const html = writeVersionedIndex(dataVersion);
  const $shellFingerprint = cheerio.load(html);
  $shellFingerprint('meta[name="journal-data-version"]').attr("content", "dataset-version");
  buildShellHash = contentHash($shellFingerprint.html());
  problemShellHash = contentHash({
    template: "standalone-problem-v1",
    stylesheet: assetVersion("site/style.css"),
    script: browserAssets.problemEntry,
  });
  writeServiceWorker(dataVersion);
  const homeHtml = writeHomePage(html, logs, totalVitality);
  writeRouteIndexes(homeHtml, members, logs);
  writeMemberPages(html, members, logs, vitality);
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
  writeJournalShards(summaryLogs, generatedAt, members);
  writeProblemDetails(logs, generatedAt, problemIndex);
  fs.rmSync(path.join(OUTPUT_DIR, "data", "all.json"), { force: true });
  fs.rmSync(path.join(OUTPUT_DIR, ".build-state.json"), { force: true });
  finalizeBuildState();
  console.log(`Generated ${logs.length} logs for ${members.length} members (${incrementalHits} reused, ${incrementalMisses} rebuilt).`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { replaceProblemArticle, resolveStatsEnd, buildProblemIndex, buildReviewQueue, publishStatementImages, writeJournalShards, problemDependencyHash, tagDependencyHash };
