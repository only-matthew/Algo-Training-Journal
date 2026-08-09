import { PLATFORMS, REVIEW_LABELS, toDateString, formatUpdateDate, formatUpdateTime } from "./constants.mjs";
import { escapeHtml, renderMarkdown } from "./render-safety.mjs";
import { loadProblemDetail, ensureOverviewJournal, ensureFullJournal, forceProblemDetailRefresh, clearForceRefresh, problemDetailSequence, nextProblemDetailSequence } from "./data.mjs";

let enhancementPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`资源加载失败：${src}`));
    document.head.appendChild(script);
  });
}

export function loadEnhancements() {
  enhancementPromise ??= (async () => {
    await Promise.all([
      (async () => {
        await loadScript("vendor/prism/prism.min.js");
        Prism.languages.c ??= Prism.languages.extend("clike", {
          keyword: /\b(?:auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while)\b/,
          macro: { pattern: /(^\s*)#\s*[a-z]+(?:.*\\(?:\r\n|\r|\n).+)*/m, lookbehind: true, alias: "property" },
        });
        await Promise.all([
          loadScript("vendor/prism/prism-cpp.min.js"),
          loadScript("vendor/prism/prism-line-numbers.min.js"),
        ]);
      })(),
      (async () => {
        await loadScript("vendor/katex/katex.min.js");
        await loadScript("vendor/katex/auto-render.min.js");
      })(),
    ]);
  })();
  return enhancementPromise;
}

async function renderEnhancements(root) {
  try { await loadEnhancements(); } catch (error) { console.error(error); }
  if (typeof Prism !== "undefined") Prism.highlightAllUnder(root);
  if (typeof renderMathInElement !== "undefined") {
    renderMathInElement(root, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });
  }
}

export function memberUrl(member) {
  return `/member/${encodeURIComponent(member)}/`;
}

export function problemUrl(log) {
  return `/problem/${encodeURIComponent(log.member)}/${encodeURIComponent(log.date)}/${encodeURIComponent(log.problemId || log.problemIndex || 0)}/`;
}

export function originalProblemUrl(platform, problemNumber, title = "") {
  let number = String(problemNumber || "").trim();
  if (!number && platform === PLATFORMS.LUOGU) {
    number = String(title).match(/\b([A-Za-z]\d+[A-Za-z0-9_-]*)\b/)?.[1] || "";
  }
  if (!number && platform === PLATFORMS.CODEFORCES) {
    const match = String(title).match(/(?:codeforces\s+round\s+)?(\d+)\s*(?:\([^)]*\)\s*)?([A-Za-z]\d*)\s*$/i);
    number = match ? `${match[1]}${match[2]}` : "";
  }
  if (!number) return "";
  if (platform === PLATFORMS.LUOGU && /^[A-Za-z][A-Za-z0-9_-]*$/.test(number)) {
    return `https://www.luogu.com.cn/problem/${encodeURIComponent(number)}`;
  }
  if (platform === PLATFORMS.CODEFORCES) {
    const match = number.match(/^(\d+)\s*(?:\/|-|\s)?\s*([A-Za-z][A-Za-z0-9]*)$/);
    if (match) return `https://codeforces.com/problemset/problem/${match[1]}/${match[2].toUpperCase()}`;
  }
  return "";
}

function levelOf(count) {
  if (!count) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

function updatedLabel(log) {
  if (!log.updatedAt) return "";
  return `<span class="updated-at" title="最后更新时间 ${escapeHtml(formatUpdateTime(log.updatedAt))}">最后更新 ${escapeHtml(formatUpdateDate(log.updatedAt))}</span>`;
}

function logCardHtml(log) {
  const title = escapeHtml(log.problem);
  const sourceUrl = originalProblemUrl(log.platform, log.problemNumber, log.problem);

  const reviewLabel = REVIEW_LABELS[log.reviewStatus] || "";
  const badges = [
    ...log.tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`),
    ...(reviewLabel ? [`<span class="review-chip ${log.reviewStatus}">${reviewLabel}</span>`] : []),
  ].join("");
  return `
    <div class="record-head">
      <span class="record-date-wrap">
        <time>${escapeHtml(log.date)}</time>
        ${updatedLabel(log)}
      </span>
      <a class="member-link" href="${memberUrl(log.member)}">${escapeHtml(log.member)}</a>
    </div>
    <h3 class="record-title">${title}</h3>
    <p class="meta">平台：${escapeHtml(log.platform)} ｜ 难度：${escapeHtml(log.difficulty)}</p>
    ${badges ? `<div class="record-badges">${badges}</div>` : ""}
    <div class="record-links">
      ${sourceUrl ? `<a class="btn btn-outline btn-sm record-source-link" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">前往原题 ↗</a>` : ""}
      <a class="record-detail-link" href="${problemUrl(log)}">查看题目详情 →</a>
    </div>
  `;
}

function createLogCard(log, options) {
  const card = document.createElement("article");
  card.className = `record${options?.className ? ` ${options.className}` : ""}`;
  card.innerHTML = logCardHtml(log);
  return card;
}

export function renderCountMap(root, map, emptyText) {
  const entries = Object.entries(map).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
  root.innerHTML = "";
  if (!entries.length) { root.textContent = emptyText; return; }
  const list = document.createElement("ul");
  list.className = "stat-list";
  for (const [name, count] of entries) list.insertAdjacentHTML("beforeend", `<li><span>${escapeHtml(name)}</span><strong>${count}</strong></li>`);
  root.appendChild(list);
}

export function renderStats(member, recent30, heatmapCounts) {
  const stats = recent30.byMember[member];
  if (!stats) return;
  document.getElementById("metric-total").textContent = String(stats.totalLogs);
  document.getElementById("metric-days").textContent = String(stats.activeDays);
  document.getElementById("metric-weekly").textContent = `${stats.avgPerWeek} 题/周`;

  if (heatmapCounts) {
    const streakRoot = document.getElementById("metric-streak");
    if (streakRoot) {
      let streak = 0;
      const checkDate = new Date();
      if (!heatmapCounts[toDateString(checkDate)]) {
        checkDate.setDate(checkDate.getDate() - 1);
      }
      while (heatmapCounts[toDateString(checkDate)]) {
        streak += 1;
        checkDate.setDate(checkDate.getDate() - 1);
      }
      streakRoot.textContent = `${streak} 天`;
    }
  }

  const platformRoot = document.getElementById("platform-stats");
  const difficultyRoot = document.getElementById("difficulty-stats");
  platformRoot.innerHTML = "";
  difficultyRoot.innerHTML = "";

  function renderMap(root, map, emptyText) {
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
    if (!entries.length) {
      root.textContent = emptyText;
      return;
    }
    const list = document.createElement("ul");
    list.className = "stat-list";
    for (const [name, count] of entries) {
      const item = document.createElement("li");
      const label = document.createElement("span");
      const value = document.createElement("strong");
      label.textContent = name;
      value.textContent = String(count);
      item.append(label, value);
      list.appendChild(item);
    }
    root.appendChild(list);
  }

  renderMap(platformRoot, stats.byPlatform, "近 30 天暂无来源数据。");
  renderMap(difficultyRoot, stats.byDifficulty, "近 30 天暂无难度数据。");
}

export function renderHeatmap(root, counts, member, members, byMember) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 364);

  root.innerHTML = "";

  const legend = document.createElement("div");
  legend.className = "sr-only";
  legend.textContent = "热力图：颜色越深表示当日训练题数越多。白色=0题，浅绿=1题，中绿=2题，深绿=3-4题，墨绿=5题以上。";
  root.appendChild(legend);

  for (let i = 0; i < 365; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dateText = toDateString(date);
    const count = counts[dateText] || 0;

    let tooltip = `${dateText} · ${count} 题`;
    if (member === "all" && count > 0) {
      const contributions = members
        .map((m) => ({
          name: m,
          cnt: (byMember[m] && byMember[m][dateText]) || 0,
        }))
        .filter((c) => c.cnt > 0)
        .sort((a, b) => b.cnt - a.cnt || a.name.localeCompare(b.name, "zh-CN"));
      const lines = contributions.map((c) => `${c.name}: ${c.cnt} 题`);
      tooltip = [tooltip, ...lines].join("\n");
    }

    const cell = document.createElement("span");
    cell.className = `cell lv${levelOf(count)}`;
    cell.title = tooltip;
    cell.setAttribute("aria-label", `${dateText}：${count} 题`);
    cell.setAttribute("role", "img");
    if (count > 0) cell.setAttribute("tabindex", "0");
    root.appendChild(cell);
  }
}

export { levelOf };

export function renderLogs(recordsRoot, logs, member, activeTagFilter, createLogCard) {
  const reviewStatus = document.getElementById("review-filter").value;
  const searchTerm = document.getElementById("search-input")?.value?.trim().toLowerCase() || "";
  const filtered = logs.filter((log) =>
    (member === "all" || log.member === member) &&
    (activeTagFilter === "all" || log.tags.includes(activeTagFilter)) &&
    (reviewStatus === "all" || log.reviewStatus === reviewStatus) &&
    (searchTerm === "" ||
      log.problem.toLowerCase().includes(searchTerm) ||
      log.tags.some(t => t.toLowerCase().includes(searchTerm)) ||
      log.platform.toLowerCase().includes(searchTerm) ||
      (log.problemNumber && log.problemNumber.toLowerCase().includes(searchTerm)) ||
      log.difficulty.toLowerCase().includes(searchTerm))
  );

  const recordCount = document.getElementById("record-count");
  if (recordCount) recordCount.textContent = `近 30 天当前筛选共 ${filtered.length} 条记录`;

  if (!filtered.length) {
    recordsRoot.replaceChildren(document.createTextNode("暂无记录。"));
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const log of filtered) fragment.appendChild(createLogCard(log));
  recordsRoot.replaceChildren(fragment);
}

export function renderTagFilterBar(bar, sortedTags, activeTagFilter) {
  bar.innerHTML = `<span class="tag-chip tag-filter-chip${activeTagFilter === "all" ? " active" : ""}" data-tag="all">全部</span>`;
  for (const [tag, count] of sortedTags) {
    const chip = document.createElement("span");
    chip.className = `tag-chip tag-filter-chip${activeTagFilter === tag ? " active" : ""}`;
    chip.dataset.tag = tag;
    chip.textContent = `${tag} (${count})`;
    bar.appendChild(chip);
  }
}

export function renderTagCloud(root, sortedTags) {
  root.innerHTML = "";
  if (!sortedTags.length) { root.innerHTML = `<p class="hint">近 30 天暂无标签数据，提交记录时添加标签即可在此查看。</p>`; return; }

  const maxCount = sortedTags[0]?.[1] || 1;
  for (const [tag, count] of sortedTags) {
    const size = 0.75 + (count / maxCount) * 1.25;
    const chip = document.createElement("span");
    chip.className = "tag-chip tag-cloud-chip";
    chip.style.cssText = `font-size:${size.toFixed(2)}em;`;
    chip.dataset.tag = tag;
    chip.textContent = `${tag} (${count})`;
    chip.title = `点击筛选「${tag}」· ${count} 题`;
    root.appendChild(chip);
  }
}

export function renderReviewBook(logs, member, status, tag, createLogCard) {
  const reviewLogs = logs.filter((log) => log.reviewStatus !== "none" && (member === "all" || log.member === member));
  const filtered = reviewLogs.filter((log) => (status === "all" || log.reviewStatus === status) && (tag === "all" || log.tags.includes(tag)));
  document.getElementById("review-todo-count").textContent = String(reviewLogs.filter((log) => log.reviewStatus === "todo").length);
  document.getElementById("review-mastered-count").textContent = String(reviewLogs.filter((log) => log.reviewStatus === "mastered").length);
  document.getElementById("review-tag-count").textContent = String(new Set(reviewLogs.flatMap((log) => log.tags)).size);
  document.getElementById("review-summary").textContent = `${member === "all" ? "全队" : member} · 当前筛选 ${filtered.length} 题`;
  const root = document.getElementById("review-records");
  root.innerHTML = "";
  if (!filtered.length) root.textContent = "当前筛选下暂无错题。";
  for (const log of filtered) root.appendChild(createLogCard(log));
}

export function renderTrendChart(root, logs, start, end) {
  if (!logs.length || !start || !end) {
    root.innerHTML = '<p class="hint">请先选择时间范围。</p>';
    return;
  }
  if (start === end) {
    root.innerHTML = `<p class="hint">单日训练（${start}）不显示周趋势图，请选择更大的时间范围。</p>`;
    return;
  }

  const weeks = [];
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  let currentStart = new Date(startDate);
  const dayOfWeek = currentStart.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  currentStart.setDate(currentStart.getDate() + diff);

  while (currentStart <= endDate) {
    const weekEnd = new Date(currentStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekLogs = logs.filter(l => l.date >= toDateString(currentStart) && l.date <= toDateString(weekEnd));
    weeks.push({ start: toDateString(currentStart), count: weekLogs.length });
    currentStart.setDate(currentStart.getDate() + 7);
  }

  if (!weeks.length) {
    root.innerHTML = '<p class="hint">该时间范围暂无数据。</p>';
    return;
  }

  const maxCount = Math.max(...weeks.map(w => w.count), 1);
  const barWidth = Math.max(8, Math.floor(600 / weeks.length) - 4);
  const chartHeight = 160;

  let svg = `<svg width="100%" height="${chartHeight + 40}" viewBox="0 0 ${weeks.length * (barWidth + 4) + 40} ${chartHeight + 40}" role="img" aria-label="周题量趋势图">`;

  svg += `<text x="0" y="15" font-size="10" fill="var(--muted)">${maxCount}</text>`;
  svg += `<text x="0" y="${chartHeight - 5}" font-size="10" fill="var(--muted)">0</text>`;

  weeks.forEach((week, i) => {
    const barHeight = week.count > 0 ? Math.max(3, (week.count / maxCount) * chartHeight) : 0;
    const x = 30 + i * (barWidth + 4);
    const y = chartHeight - barHeight;
    const title = `${week.start.slice(5)} · ${week.count} 题`;
    svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="var(--brand)" rx="2" role="img"><title>${title}</title></rect>`;
    if (i % Math.ceil(weeks.length / 8) === 0 || i === weeks.length - 1) {
      svg += `<text x="${x}" y="${chartHeight + 16}" font-size="9" fill="var(--muted)" text-anchor="start">${week.start.slice(5)}</text>`;
    }
  });

  svg += '</svg>';
  root.innerHTML = svg;
}

// ── 分析页导出（模块级变量，避免 _wired 闭包捕获过期 filtered）──
let _analysisFiltered = [];
let _analysisWired = false;

export function renderAnalysis(logs, member, start, end, recent30, createLogCard) {
  const periodLabel = start && end
    ? `${start} 至 ${end}`
    : "请选择开始和结束日期";

  const filtered = logs.filter((log) => {
    const memberMatches = member === "all" || log.member === member;
    return memberMatches && start && end && log.date >= start && log.date <= end;
  });

  const tagCounts = {};
  for (const log of filtered) {
    for (const tag of log.tags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }
  const todo = filtered.filter((log) => log.reviewStatus === "todo").length;
  const mastered = filtered.filter((log) => log.reviewStatus === "mastered").length;

  document.getElementById("analysis-total").textContent = String(filtered.length);
  document.getElementById("analysis-days").textContent = String(new Set(filtered.map((log) => log.date)).size);
  document.getElementById("analysis-members").textContent = String(new Set(filtered.map((log) => log.member)).size);
  document.getElementById("analysis-review").textContent = String(todo);
  document.getElementById("analysis-summary").textContent = `${member === "all" ? "全队" : member} · ${periodLabel} · 共 ${filtered.length} 题`;
  renderCountMap(document.getElementById("analysis-tags"), tagCounts, "该时间范围暂无标签数据。");
  renderCountMap(document.getElementById("analysis-review-stats"), { "待复习": todo, "已掌握": mastered }, "该时间范围暂无错题记录。");

  const recordsRoot = document.getElementById("analysis-records");
  recordsRoot.innerHTML = "";
  if (!filtered.length) {
    recordsRoot.textContent = start && end ? "该时间范围暂无记录。" : "请选择开始和结束日期。";
    return;
  }

  for (const log of filtered) {
    const wrapper = document.createElement("div");
    wrapper.className = "analysis-record-wrapper";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "analysis-record-checkbox";
    checkbox.dataset.id = log.problemId || `${log.member}-${log.date}-${log.problemIndex}`;
    wrapper.appendChild(checkbox);
    wrapper.appendChild(createLogCard(log, { className: "analysis-record" }));
    recordsRoot.appendChild(wrapper);
  }

  const selectAll = document.getElementById("analysis-select-all");
  if (selectAll) {
    selectAll.checked = false;
    selectAll.onchange = () => {
      for (const cb of recordsRoot.querySelectorAll(".analysis-record-checkbox")) {
        cb.checked = selectAll.checked;
      }
    };
  }

  // 更新模块级引用，供导出按钮使用
  _analysisFiltered = filtered;

  const exportMdBtn = document.getElementById("btn-analysis-export-md");
  const exportPdfBtn = document.getElementById("btn-analysis-export-pdf");
  const exportLatexBtn = document.getElementById("btn-analysis-export-latex");
  if (exportMdBtn && !_analysisWired) {
    _analysisWired = true;
    exportMdBtn.addEventListener("click", () => {
      const selected = getSelectedLogs(_analysisFiltered);
      if (!selected.length) { alert("请先勾选要导出的题目"); return; }
      exportSelectedToMD(selected);
    });
    exportPdfBtn.addEventListener("click", () => {
      const selected = getSelectedLogs(_analysisFiltered);
      if (!selected.length) { alert("请先勾选要导出的题目"); return; }
      exportSelectedToPDF(selected);
    });
    exportLatexBtn.addEventListener("click", () => {
      const selected = getSelectedLogs(_analysisFiltered);
      if (!selected.length) { alert("请先勾选要导出的题目"); return; }
      exportSelectedToLatex(selected);
    });
  }

  const trendRoot = document.getElementById("trend-chart");
  if (trendRoot) renderTrendChart(trendRoot, filtered, start, end);
}

function getSelectedLogs(filtered) {
  const ids = new Set();
  for (const cb of document.querySelectorAll(".analysis-record-checkbox:checked")) {
    ids.add(cb.dataset.id);
  }
  return filtered.filter((log) => ids.has(log.problemId || `${log.member}-${log.date}-${log.problemIndex}`));
}

export function renderMemberPage(logs, member, heatmap, recent30, createLogCard) {
  const root = document.getElementById("member-records");
  const memberLogs = logs.filter((log) => log.member === member);
  document.getElementById("member-page-title").textContent = member || "未找到队员";
  document.getElementById("member-page-subtitle").textContent = memberLogs.length
    ? `从 ${memberLogs[memberLogs.length - 1].date} 到 ${memberLogs[0].date} 的训练记录`
    : "该队员暂无训练记录";
  document.getElementById("member-total").textContent = String(memberLogs.length);
  document.getElementById("member-days").textContent = String(new Set(memberLogs.map((log) => log.date)).size);
  document.getElementById("member-recent").textContent = String(recent30.byMember[member]?.totalLogs || 0);
  document.getElementById("member-record-count").textContent = `共 ${memberLogs.length} 道题，每道题均可单独打开和分享`;
  document.title = `${member} 的训练主页 · ICPC 算法训练日志`;

  const heatmapRoot = document.getElementById("member-heatmap");
  const counts = heatmap.byMember[member] || {};
  renderHeatmap(heatmapRoot, counts, member, [member], heatmap.byMember);

  root.innerHTML = "";
  for (const log of memberLogs) root.appendChild(createLogCard(log));
}

export function renderProblemPageFromLog(log, memberUrl, renderEnhancements) {
  const root = document.getElementById("problem-detail");
  root.dataset.prerenderedPath = window.location.pathname;
  
  const sourceUrl = originalProblemUrl(log.platform, log.problemNumber, log.problem);

  const updated = updatedLabel(log);
  root.innerHTML = `
    <div class="problem-detail-head">
      <div>
        <p class="eyebrow">${escapeHtml(log.date)} · 第 ${(log.problemIndex ?? 0) + 1} 题${updated ? ` · ${updated}` : ""}</p>
        <h1>${escapeHtml(log.problem)}</h1>
      </div>
      <div class="problem-detail-actions">
        ${sourceUrl ? `<a class="btn btn-primary problem-source-link" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">前往原题 ↗</a>` : ""}
        <a class="member-chip" href="${memberUrl(log.member)}">${escapeHtml(log.member)} 的主页</a>
      </div>
    </div>
    <p class="problem-meta">平台：${escapeHtml(log.platform)} ${log.problemNumber ? `<span>题号：${escapeHtml(log.problemNumber)}</span>` : ""} <span>难度：${escapeHtml(log.difficulty)}</span></p>
    ${(log.tags.length || log.reviewStatus !== "none") ? `<div class="record-badges">${log.tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")}${log.reviewStatus !== "none" ? `<span class="review-chip ${log.reviewStatus}">${log.reviewStatus === "todo" ? "待复习" : "已掌握"}</span>` : ""}</div>` : ""}
    <div class="problem-content">
      ${log.description ? `<section class="problem-section"><h2>题目描述</h2>${renderMarkdown(log.description)}</section>` : ""}
      ${log.takeaway ? `<section class="problem-section"><h2>收获 / 题解</h2>${renderMarkdown(log.takeaway)}</section>` : ""}
      ${log.code ? `<section class="problem-section"><h2>代码</h2><div class="record-takeaway problem-code-expanded"><pre class="line-numbers"><code class="language-cpp">${escapeHtml(log.code)}</code></pre></div></section>` : ""}
    </div>
  `;
  
  return renderEnhancements(root).then(() => {
    document.title = `${log.problem} · ${log.member} · ICPC 算法训练日志`;
  });
}

export function renderJournal(journal, dataScope = "overview") {
  const { members, logs, heatmap, recent30 } = journal;
  for (const log of logs) {
    log.tags = Array.isArray(log.tags) ? log.tags : [];
    log.reviewStatus = ["none", "todo", "mastered"].includes(log.reviewStatus) ? log.reviewStatus : "none";
  }
  const analysisState = {
    member: document.getElementById("analysis-member").value || "all",
    start: document.getElementById("analysis-start").value,
    end: document.getElementById("analysis-end").value,
  };

  async function renderProblemPage(member, date, index) {
    const root = document.getElementById("problem-detail");
    document.getElementById("problem-back-member").href = memberUrl(member);
    if (!forceProblemDetailRefresh && root.dataset.prerenderedPath === window.location.pathname) {
      delete root.dataset.prerenderedPath;
      await renderEnhancements(root);
      return;
    }
    const sequence = nextProblemDetailSequence();
    root.innerHTML = `<p class="eyebrow">题目详情</p><h1>加载中</h1><p class="hint">正在加载题目描述、题解和代码...</p>`;
    let log;
    try {
      const force = forceProblemDetailRefresh;
      clearForceRefresh();
      log = await loadProblemDetail(member, date, decodeURIComponent(index), force);
    } catch (error) {
      if (sequence !== problemDetailSequence) return;
      root.innerHTML = `<p class="eyebrow">题目详情</p><h1>未找到该题目</h1><p class="hint">${escapeHtml(error.message)}</p>`;
      return;
    }
    const route = window.location.pathname.replace(/^\/+|\/+$/g, "");
    if (sequence !== problemDetailSequence || !route.startsWith("problem/")) return;

    const sourceUrl = originalProblemUrl(log.platform, log.problemNumber, log.problem);

    const updated = updatedLabel(log);
    root.innerHTML = `
      <div class="problem-detail-head">
        <div>
          <p class="eyebrow">${escapeHtml(log.date)} · 第 ${(log.problemIndex ?? 0) + 1} 题${updated ? ` · ${updated}` : ""}</p>
          <h1>${escapeHtml(log.problem)}</h1>
        </div>
        <div class="problem-detail-actions">
          ${sourceUrl ? `<a class="btn btn-primary problem-source-link" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">前往原题 ↗</a>` : ""}
          <a class="member-chip" href="${memberUrl(log.member)}">${escapeHtml(log.member)} 的主页</a>
        </div>
      </div>
      <p class="problem-meta">平台：${escapeHtml(log.platform)} ${log.problemNumber ? `<span>题号：${escapeHtml(log.problemNumber)}</span>` : ""} <span>难度：${escapeHtml(log.difficulty)}</span></p>
      ${(log.tags.length || log.reviewStatus !== "none") ? `<div class="record-badges">${log.tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")}${log.reviewStatus !== "none" ? `<span class="review-chip ${log.reviewStatus}">${log.reviewStatus === "todo" ? "待复习" : "已掌握"}</span>` : ""}</div>` : ""}
      <div class="problem-content">
        ${log.description ? `<section class="problem-section"><h2>题目描述</h2>${renderMarkdown(log.description)}</section>` : ""}
        ${log.takeaway ? `<section class="problem-section"><h2>收获 / 题解</h2>${renderMarkdown(log.takeaway)}</section>` : ""}
        ${log.code ? `<section class="problem-section"><h2>代码</h2><div class="record-takeaway problem-code-expanded"><pre class="line-numbers"><code class="language-cpp">${escapeHtml(log.code)}</code></pre></div></section>` : ""}
      </div>
    `;
    await renderEnhancements(root);
    document.title = `${log.problem} · ${log.member} · ICPC 算法训练日志`;

    const exportBar = document.getElementById("export-bar");
    if (exportBar) exportBar.hidden = false;

    const btnPdf = document.getElementById("btn-export-pdf");
    const btnMd = document.getElementById("btn-export-md");
    const btnLatex = document.getElementById("btn-export-latex");
    if (btnPdf) btnPdf.onclick = () => exportToPDF(log);
    if (btnPdf && !btnPdf._wired) {
      btnPdf._wired = true;
      btnMd.addEventListener("click", () => {
        const routeParts = window.location.pathname.replace(/^\/+|\/+$/g, "").split("/");
        if (routeParts.length >= 4) {
          loadProblemDetail(decodeURIComponent(routeParts[1]), decodeURIComponent(routeParts[2]), routeParts[3]).then(log => exportToMD(log));
        }
      });
      btnLatex.addEventListener("click", () => {
        const routeParts = window.location.pathname.replace(/^\/+|\/+$/g, "").split("/");
        if (routeParts.length >= 4) {
          loadProblemDetail(decodeURIComponent(routeParts[1]), decodeURIComponent(routeParts[2]), routeParts[3]).then(log => exportToLatex(log));
        }
      });
    }
  }

  function render(member) {
    renderStats(member, recent30, member === "all" ? heatmap.all : (heatmap.byMember[member] || {}));
    renderHeatmap(document.getElementById("heatmap"), member === "all" ? heatmap.all : (heatmap.byMember[member] || {}), member, members, heatmap.byMember);
    renderLogs(document.getElementById("records"), logs, member, activeTagFilter, createLogCard);
    if (dataScope === "all") {
      const analysisMember = document.getElementById("analysis-member");
      renderAnalysis(logs, analysisMember.value, document.getElementById("analysis-start").value, document.getElementById("analysis-end").value, recent30, createLogCard);
      const reviewMember = document.getElementById("review-member");
      const reviewStatus = document.getElementById("review-status");
      const reviewTag = document.getElementById("review-tag");
      renderReviewBook(logs, reviewMember.value, reviewStatus.value, reviewTag.value, createLogCard);
    }
  }

  function setTagFilter(tag) {
    activeTagFilter = tag;
    renderTagFilterBar(document.getElementById("tag-filter-bar"), sortedTags, activeTagFilter);
    renderLogs(document.getElementById("records"), logs, memberSelect.value, activeTagFilter, createLogCard);
  }

  const memberSelect = document.getElementById("member-select");
  while (memberSelect.options.length > 1) memberSelect.remove(1);
  const uniqueMembers = [...new Set(members)];
  for (const member of uniqueMembers) {
    const option = document.createElement("option");
    option.value = member;
    option.textContent = member;
    memberSelect.appendChild(option);
  }

  const analysisMember = document.getElementById("analysis-member");
  while (analysisMember.options.length > 1) analysisMember.remove(1);
  for (const member of uniqueMembers) {
    const option = document.createElement("option");
    option.value = member;
    option.textContent = member;
    analysisMember.appendChild(option);
  }
  analysisMember.value = uniqueMembers.includes(analysisState.member)
    ? analysisState.member
    : "all";

  const allTags = [...new Set(logs.flatMap((log) => log.tags))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const tagCounts = {};
  for (const log of logs) {
    for (const tag of log.tags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }
  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));

  let activeTagFilter = "all";

  function populateSelect(select, values) {
    while (select.options.length > 1) select.remove(1);
    for (const value of values) select.add(new Option(value, value));
  }
  populateSelect(document.getElementById("review-member"), uniqueMembers);
  populateSelect(document.getElementById("review-tag"), allTags);

  async function renderRoute() {
    const parts = window.location.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (!parts[0]) document.title = "ICPC 算法训练日志";
    if (dataScope === "shell" && !parts[0]) {
      try { await ensureOverviewJournal(); } catch (error) { document.getElementById("records").textContent = `数据加载失败：${error.message}`; }
      return;
    }
    if (dataScope !== "all" && (parts[0] === "analysis" || parts[0] === "report" || parts[0] === "review" || parts[0] === "member")) {
      try { await ensureFullJournal(); } catch { /* Error state is rendered by ensureFullJournal. */ }
      return;
    }
    if (parts[0] === "member" && parts[1]) {
      renderMemberPage(logs, decodeURIComponent(parts[1]), heatmap, recent30, createLogCard);
    }
    if (parts[0] === "problem" && parts.length >= 4) {
      renderProblemPage(decodeURIComponent(parts[1]), decodeURIComponent(parts[2]), parts[3]);
    }
  }

  analysisMember.onchange = () => {
    renderAnalysis(logs, analysisMember.value, document.getElementById("analysis-start").value, document.getElementById("analysis-end").value, recent30, createLogCard);
  };
  const analysisStart = document.getElementById("analysis-start");
  const analysisEnd = document.getElementById("analysis-end");
  const presetButtons = document.querySelectorAll(".analysis-preset");
  const calendarTriggers = document.querySelectorAll(".analysis-calendar-trigger");

  function startOfToday() {
    return new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  }

  function presetRange(range) {
    let end = startOfToday();
    const start = new Date(end);

    if (range === "week") {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else if (range === "month") {
      start.setDate(1);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    }

    return { start: toDateString(start), end: toDateString(end) };
  }

  function updateRangePresetState() {
    for (const button of presetButtons) {
      const range = presetRange(button.dataset.range);
      const isActive = analysisStart.value === range.start && analysisEnd.value === range.end;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
  }

  function syncAnalysisDateRange(changedInput) {
    if (analysisStart.value && analysisEnd.value && analysisStart.value > analysisEnd.value) {
      if (changedInput === analysisStart) {
        analysisEnd.value = analysisStart.value;
      } else {
        analysisStart.value = analysisEnd.value;
      }
    }
    analysisStart.max = analysisEnd.value || "";
    analysisEnd.min = analysisStart.value || "";
  }

  for (const input of [analysisStart, analysisEnd]) {
    input.onchange = () => {
      syncAnalysisDateRange(input);
      updateRangePresetState();
      renderAnalysis(logs, analysisMember.value, analysisStart.value, analysisEnd.value, recent30, createLogCard);
    };
  }
  for (const button of presetButtons) {
    button.onclick = () => {
      const range = presetRange(button.dataset.range);
      analysisStart.value = range.start;
      analysisEnd.value = range.end;
      syncAnalysisDateRange();
      updateRangePresetState();
      renderAnalysis(logs, analysisMember.value, analysisStart.value, analysisEnd.value, recent30, createLogCard);
    };
  }
  for (const button of calendarTriggers) {
    button.onclick = () => {
      const input = document.getElementById(button.dataset.dateTarget);
      if (typeof input.showPicker === "function") {
        input.showPicker();
      } else {
        input.focus();
      }
    };
  }
  const today = toDateString(new Date());
  analysisStart.value = analysisState.start || today;
  analysisEnd.value = analysisState.end || today;
  syncAnalysisDateRange();
  updateRangePresetState();
  if (dataScope === "all") {
    renderAnalysis(logs, analysisMember.value, analysisStart.value, analysisEnd.value, recent30, createLogCard);
  }
  for (const id of ["review-member", "review-status", "review-tag"]) {
    document.getElementById(id).onchange = () => {
      const reviewMember = document.getElementById("review-member");
      const reviewStatus = document.getElementById("review-status");
      const reviewTag = document.getElementById("review-tag");
      renderReviewBook(logs, reviewMember.value, reviewStatus.value, reviewTag.value, createLogCard);
    };
  }
  document.getElementById("review-filter").onchange = () => renderLogs(document.getElementById("records"), logs, memberSelect.value, activeTagFilter, createLogCard);
  if (dataScope === "all") {
    const reviewMember = document.getElementById("review-member");
    const reviewStatus = document.getElementById("review-status");
    const reviewTag = document.getElementById("review-tag");
    renderReviewBook(logs, reviewMember.value, reviewStatus.value, reviewTag.value, createLogCard);
  }

  // Tag chip click handlers via event delegation
  document.getElementById("tag-filter-bar").onclick = (e) => {
    const chip = e.target.closest(".tag-filter-chip");
    if (!chip) return;
    setTagFilter(chip.dataset.tag);
  };
  document.getElementById("tag-cloud").onclick = (e) => {
    const chip = e.target.closest(".tag-cloud-chip");
    if (!chip) return;
    setTagFilter(chip.dataset.tag);
  };
  document.getElementById("records").addEventListener("click", (e) => {
    const chip = e.target.closest(".record-badges .tag-chip");
    if (!chip) return;
    e.preventDefault();
    e.stopPropagation();
    setTagFilter(chip.textContent.trim());
  });

  render("all");
  renderRoute();
  renderTagCloud(document.getElementById("tag-cloud"), sortedTags);
  renderTagFilterBar(document.getElementById("tag-filter-bar"), sortedTags, activeTagFilter);
  window.journalRouteRenderer = renderRoute;
  memberSelect.onchange = (e) => render(e.target.value);

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    let searchTimer;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        renderLogs(document.getElementById("records"), logs, memberSelect.value, activeTagFilter, createLogCard);
      }, 300);
    });
  }

  return { render, renderRoute };
}

const BATCH_MAX_MD = 500;
const BATCH_MAX_PDF = 100;
const FETCH_CONCURRENCY = 10;

async function fetchFullLogs(selectedLogs, maxCount) {
  if (selectedLogs.length > maxCount) {
    alert(`单次最多导出 ${maxCount} 题，当前选中 ${selectedLogs.length} 题。请缩小时间范围。`);
    return [];
  }
  const results = new Array(selectedLogs.length);
  let completed = 0;
  const statusEl = () => document.getElementById("export-status");

  async function fetchOne(index) {
    const s = selectedLogs[index];
    try {
      const full = await loadProblemDetail(s.member, s.date, s.problemId || s.problemIndex || 0);
      results[index] = { ...s, ...full };
    } catch {
      results[index] = s;
    }
    completed += 1;
    const el = statusEl();
    if (el) el.textContent = `正在获取题目详情 ${completed}/${selectedLogs.length}...`;
  }

  const workers = [];
  for (let i = 0; i < Math.min(FETCH_CONCURRENCY, selectedLogs.length); i++) {
    workers.push((async () => {
      for (let j = i; j < selectedLogs.length; j += FETCH_CONCURRENCY) {
        await fetchOne(j);
      }
    })());
  }
  await Promise.all(workers);

  const el = statusEl();
  if (el) el.textContent = "正在生成文件...";
  return results;
}

function buildMDContent(log) {
  if (!log) return "";
  const reviewLabel = { none: "非错题", todo: "待复习", mastered: "已掌握" }[log.reviewStatus] || "";

  const tableHeader = "| 字段 | 内容 |\n|------|------|\n";
  const tableRows = [
    `| 题目 | ${log.problem || ""} |`,
    `| 队员 | ${log.member || ""} |`,
    `| 日期 | ${log.date || ""} |`,
    `| 平台 | ${log.platform || ""} |`,
    `| 题号 | ${log.problemNumber || ""} |`,
    `| 难度 | ${log.difficulty || ""} |`,
    `| 标签 | ${(log.tags || []).join(", ") || ""} |`,
    `| 错题状态 | ${reviewLabel} |`,
  ].join("\n");

  const parts = [
    `# ${log.problem || "题目"}`,
    "",
    tableHeader + tableRows,
    "",
  ];
  if (log.description) parts.push("## 题目描述", "", log.description, "");
  if (log.takeaway) parts.push("## 收获 / 题解", "", log.takeaway, "");
  if (log.code) parts.push("## 代码", "", "```cpp", log.code, "```", "");
  return parts.join("\n");
}

function buildLatexContent(log) {
  if (!log) return "";
  const esc = (s) => String(s || "").replace(/[\\_{}&#%$~]/g, (c) => "\\" + c).replace(/\^/g, "\\^{}");
  // 防止 \section{ 后紧跟 [ 被 LaTeX 解析为可选参数
  const secTitle = esc(log.problem || "题目").replace(/^\[/, "{}[");
  const reviewLabel = { none: "非错题", todo: "待复习", mastered: "已掌握" }[log.reviewStatus] || "";

  // 将 Markdown 文本转换为 LaTeX 安全的正文内容
  function latexProse(md) {
    if (!md) return "";
    const parts = [];
    // 按 ``` 围栏代码块拆分
    const segments = md.split(/(```[\s\S]*?```)/g);
    for (const seg of segments) {
      if (seg.startsWith("```") && seg.endsWith("```")) {
        // 代码块：提取语言标记和内容，转为 lstlisting
        const inner = seg.slice(3, -3).replace(/^\S*\n?/, "");  // 去掉 ```lang 行首
        parts.push("\\begin{lstlisting}[language=C++]");
        parts.push(inner.replace(/\\end\{lstlisting\}/g, "\\end{lstlisting\\}"));
        parts.push("\\end{lstlisting}");
      } else {
        // 普通文本：保护 $...$ 数学公式，转义其余字符
        let text = seg;
        const mathBlocks = [];
        // 先提取 $$...$$ 和 $...$ 数学块
        text = text.replace(/\$\$([\s\S]*?)\$\$|\$([^\s$](?:[^$]|\\\$)*?[^\s$\\])\$/g, (match) => {
          mathBlocks.push(match);
          return `\x00MATH${mathBlocks.length - 1}\x00`;
        });
        // 转义 LaTeX 特殊字符
        text = esc(text);
        // 将 `inline code` 转为 \texttt{...}
        text = text.replace(/`([^`]+)`/g, (_, code) => `\\texttt{${esc(code)}}`);
        // 还原数学块
        text = text.replace(/\x00MATH(\d+)\x00/g, (_, i) => mathBlocks[+i]);
        parts.push(text);
      }
    }
    return parts.join("\n");
  }

  const lines = [
    `\\section{${secTitle}}`,
    `\\begin{tabular}{|l|l|}`,
    `\\hline`,
    `队员 & ${esc(log.member)} \\\\ \\hline`,
    `日期 & ${esc(log.date)} \\\\ \\hline`,
    `平台 & ${esc(log.platform)} \\\\ \\hline`,
    `题号 & ${esc(log.problemNumber)} \\\\ \\hline`,
    `难度 & ${esc(log.difficulty)} \\\\ \\hline`,
    `标签 & ${esc((log.tags || []).join(", "))} \\\\ \\hline`,
    `错题状态 & ${esc(reviewLabel)} \\\\ \\hline`,
    `\\end{tabular}`,
    "",
  ];
  if (log.description) {
    lines.push("\\subsection{题目描述}");
    lines.push(latexProse(log.description));
    lines.push("");
  }
  if (log.takeaway) {
    lines.push("\\subsection{题解}");
    lines.push(latexProse(log.takeaway));
    lines.push("");
  }
  if (log.code) {
    lines.push("\\subsection{代码}");
    lines.push("\\begin{lstlisting}[language=C++]");
    // lstlisting 是 verbatim 环境，不应转义；仅需防御 \end{lstlisting} 出现在代码中
    lines.push(String(log.code).replace(/\\end\{lstlisting\}/g, "\\end{lstlisting\\}"));
    lines.push("\\end{lstlisting}");
    lines.push("");
  }
  return lines.join("\n");
}

function latexPreamble(title) {
  return `\\documentclass[12pt,a4paper]{ctexart}
\\usepackage[top=2cm,bottom=2cm,left=2.5cm,right=2.5cm]{geometry}
\\usepackage{listings}
\\usepackage{xcolor}
\\usepackage{hyperref}
\\lstset{
  basicstyle=\\ttfamily\\small,
  breaklines=true,
  frame=single,
  numbers=left,
  numberstyle=\\tiny,
  backgroundcolor=\\color{gray!5},
  keywordstyle=\\color{blue},
  commentstyle=\\color{green!40!black},
  stringstyle=\\color{red},
}
\\title{${escapeHtml(title)}}
\\date{\\today}
\\begin{document}
\\maketitle
\\tableofcontents
\\newpage
`;
}

function latexPostamble() {
  return "\\end{document}\n";
}

export function exportToMD(log) {
  if (!log) return;
  downloadBlob(buildMDContent(log), `${safeFilename(log)}.md`);
}

export function exportToPDF(log) {
  if (!log) return;
  const md = buildMDContent(log);
  const html = mdToPrintableHTML(md, log.problem || "题目");
  openPrintWindow(html, log.problem || "题目", true);
}

export function exportToLatex(log) {
  if (!log) return;
  const body = buildLatexContent(log);
  const tex = latexPreamble(log.problem || "题目") + body + "\n" + latexPostamble();
  downloadBlob(tex, `${safeFilename(log)}.tex`, "application/x-tex;charset=utf-8");
}

export async function exportSelectedToMD(logs) {
  if (!logs || !logs.length) return;
  const fullLogs = await fetchFullLogs(logs, BATCH_MAX_MD);
  if (!fullLogs.length) return;
  const parts = fullLogs.map((log, i) => {
    const md = buildMDContent(log);
    return i === 0 ? md : `\n---\n\n${md}`;
  });
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadBlob(parts.join("\n\n"), `训练记录-${timestamp}.md`);
  const el = document.getElementById("export-status");
  if (el) el.textContent = "";
}

export async function exportSelectedToPDF(logs) {
  if (!logs || !logs.length) return;
  const fullLogs = await fetchFullLogs(logs, BATCH_MAX_PDF);
  if (!fullLogs.length) return;
  const parts = fullLogs.map((log, i) => {
    const md = buildMDContent(log);
    const isFirst = log === fullLogs[0];
    return isFirst ? renderMarkdown(md) : `<div class="page-break"></div>${renderMarkdown(md)}`;
  });
  const title = `训练记录 · ${fullLogs.length} 题`;
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8" /><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head>
<body><h1>${escapeHtml(title)}</h1>${parts.join("\n")}</body></html>`;
  openPrintWindow(html, title, true);
  const el = document.getElementById("export-status");
  if (el) el.textContent = "";
}

export async function exportSelectedToLatex(logs) {
  if (!logs || !logs.length) return;
  const fullLogs = await fetchFullLogs(logs, BATCH_MAX_MD);
  if (!fullLogs.length) return;
  const body = fullLogs.map((log) => buildLatexContent(log)).join("\n\n");
  const timestamp = new Date().toISOString().slice(0, 10);
  const tex = latexPreamble(`训练记录 · ${fullLogs.length} 题`) + body + "\n" + latexPostamble();
  downloadBlob(tex, `训练记录-${timestamp}.tex`, "application/x-tex;charset=utf-8");
  const el = document.getElementById("export-status");
  if (el) el.textContent = "";
}

const PRINT_CSS = `
  body { font-family: "Microsoft YaHei", "Segoe UI", sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1f2a37; line-height: 1.7; }
  h1 { border-bottom: 2px solid #16a34a; padding-bottom: 8px; }
  h2 { margin-top: 28px; color: #16a34a; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #e4e8ef; padding: 8px 12px; text-align: left; }
  th { background: #f0fdf4; }
  pre { box-sizing: border-box; max-width: 100%; background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 6px; font-size: 0.8rem; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
  code { font-family: "Cascadia Code", "Fira Code", "Consolas", monospace; }
  .page-break { page-break-before: always; }
  @media print {
    body { margin: 0; padding: 20px; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    pre, pre[class*="language-"] { overflow: visible !important; max-height: none !important; max-width: 100% !important; white-space: pre-wrap !important; overflow-wrap: anywhere !important; }
    code, code[class*="language-"] { white-space: pre-wrap !important; overflow-wrap: anywhere !important; }
  }
`;

function openPrintWindow(html, title, loadPrism) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();

  if (!loadPrism) {
    win.print();
    return;
  }

  const assetUrl = (path) => new URL(path, window.location.origin + "/").href;
  const link = win.document.createElement("link");
  link.rel = "stylesheet";
  link.href = assetUrl("vendor/prism/prism-tomorrow.min.css");
  win.document.head.appendChild(link);

  const print = () => {
    if (win.Prism) win.Prism.highlightAll();
    win.print();
  };
  const prismJs = win.document.createElement("script");
  prismJs.src = assetUrl("vendor/prism/prism.min.js");
  prismJs.onerror = print;
  prismJs.onload = () => {
    const cppJs = win.document.createElement("script");
    cppJs.src = assetUrl("vendor/prism/prism-cpp.min.js");
    cppJs.onload = print;
    cppJs.onerror = print;
    win.document.head.appendChild(cppJs);
  };
  win.document.head.appendChild(prismJs);
}

function mdToPrintableHTML(md, title) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8" /><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head>
<body>${renderMarkdown(md)}</body></html>`;
}

function downloadBlob(content, filename, mimeType = "text/markdown;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeFilename(log) {
  return `${log.member || "unknown"}-${log.date || "unknown"}-${(log.problem || "problem").replace(/[\\/:*?"<>|]/g, "_")}`;
}
