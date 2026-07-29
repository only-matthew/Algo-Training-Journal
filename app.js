import { createProblemId, LOG_LIMITS, logInputBytes, validateLogInput } from "./lib/log-schema.mjs";
import { apiRequest, deleteDateLog, loadDateLog, loadSession, loginWithGitHub, logoutSession, saveDateLog } from "./lib/journal-api.js";
import { escapeHtml, renderMarkdown } from "./lib/render-safety.mjs";

// ============================================================
// OAuth & Auth Module
// ============================================================

function login() {
  loginWithGitHub();
}

async function logout() {
  await logoutSession().catch(console.error);
  currentUser = null;
  updateAuthUI(null);
}

function updateAuthUI(user) {
  const statusEl = document.getElementById("auth-status");
  const btnLogin = document.getElementById("btn-login");
  const btnLogout = document.getElementById("btn-logout");
  const btnSubmit = document.getElementById("btn-submit");

  if (user) {
    statusEl.innerHTML = `<img src="${user.avatar_url}" class="avatar" width="28" height="28" alt="" /> ${user.login}`;
    btnLogin.style.display = "none";
    btnLogout.style.display = "";
    btnSubmit.style.display = "";
  } else {
    statusEl.textContent = "未登录";
    btnLogin.style.display = "";
    btnLogout.style.display = "none";
    btnSubmit.style.display = "none";
  }
}

// ============================================================
// Submit Modal
// ============================================================

let currentUser = null;
let activeFormDate = "";
let activeFormExists = false;
let activeFormInitialized = false;
let activeFormLoadState = "idle";
let dateLoadSequence = 0;
const dateDrafts = new Map();

function openModal() {
  dateDrafts.clear();
  activeFormDate = "";
  activeFormExists = false;
  activeFormInitialized = false;
  activeFormLoadState = "idle";
  dateLoadSequence += 1;
  document.getElementById("submit-modal").style.display = "flex";
  document.getElementById("submit-date").value = toDateString(new Date());
  document.getElementById("submit-msg").textContent = "";
  resetProblems();
  onDateChange();
}

function closeModal(force = false) {
  if (!force) {
    const problems = collectProblems();
    const hasContent = problems.length > 0;
    if (!hasContent) {
      const blocks = document.querySelectorAll(".problem-block");
      for (const block of blocks) {
        const takeaway = block.querySelector(".problem-takeaway")?.value?.trim();
        const code = block.querySelector(".problem-code")?.value?.trim();
        const desc = block.querySelector(".problem-description")?.value?.trim();
        if (takeaway || code || desc) {
          if (confirm("表单中有未保存的数据，确定要关闭吗？")) {
            break;
          } else {
            return;
          }
        }
      }
    } else {
      if (!confirm("表单中有未保存的数据，确定要关闭吗？")) {
        return;
      }
    }
  }
  document.getElementById("submit-modal").style.display = "none";
  dateDrafts.clear();
  activeFormDate = "";
  activeFormExists = false;
  activeFormInitialized = false;
  activeFormLoadState = "idle";
  dateLoadSequence += 1;
}

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function memberUrl(member) {
  return `/member/${encodeURIComponent(member)}/`;
}

function problemUrl(log) {
  return `/problem/${encodeURIComponent(log.member)}/${encodeURIComponent(log.date)}/${encodeURIComponent(log.problemId || log.problemIndex || 0)}/`;
}

function originalProblemUrl(platform, problemNumber, title = "") {
  let number = String(problemNumber || "").trim();
  if (!number && platform === "洛谷") {
    number = String(title).match(/\b([A-Za-z]\d+[A-Za-z0-9_-]*)\b/)?.[1] || "";
  }
  if (!number && platform === "Codeforces") {
    const match = String(title).match(/(?:codeforces\s+round\s+)?(\d+)\s*(?:\([^)]*\)\s*)?([A-Za-z]\d*)\s*$/i);
    number = match ? `${match[1]}${match[2]}` : "";
  }
  if (!number) return "";
  if (platform === "洛谷" && /^[A-Za-z][A-Za-z0-9_-]*$/.test(number)) {
    return `https://www.luogu.com.cn/problem/${encodeURIComponent(number)}`;
  }
  if (platform === "Codeforces") {
    const match = number.match(/^(\d+)\s*(?:\/|-|\s)?\s*([A-Za-z][A-Za-z0-9]*)$/);
    if (match) return `https://codeforces.com/problemset/problem/${match[1]}/${match[2].toUpperCase()}`;
  }
  return "";
}

function currentRoute() {
  return window.location.pathname.replace(/^\/+|\/+$/g, "");
}

function navigateTo(path) {
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function migrateLegacyHashRoute() {
  const route = window.location.hash.slice(1);
  if (!route) return;
  const path = route === "overview" ? "/" : `/${route}/`;
  window.history.replaceState(null, "", `${path}${window.location.search}`);
}

function createProblemRow(index) {
  const div = document.createElement("div");
  div.className = "problem-block";
  div.dataset.index = index;
  div.dataset.problemId = createProblemId();
  div.innerHTML = `
    <div class="problem-header">
      <span>第 ${index + 1} 题</span>
      ${index > 0 ? `<button type="button" class="btn-icon btn-remove" data-idx="${index}">&times;</button>` : ""}
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>题目名称</label>
        <input type="text" class="form-input problem-name" maxlength="${LOG_LIMITS.name}" placeholder="如 排序" />
      </div>
      <div class="form-group">
        <label>题号（洛谷 / Codeforces）</label>
        <input type="text" class="form-input problem-number" maxlength="${LOG_LIMITS.problemNumber}" placeholder="如 P1104 或 4A" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>平台</label>
        <select class="form-input problem-platform">
          <option value="洛谷">洛谷</option>
          <option value="Codeforces">Codeforces</option>
          <option value="AtCoder">AtCoder</option>
          <option value="其他">其他</option>
        </select>
      </div>
      <div class="form-group">
        <label>难度</label>
        <select class="form-input problem-difficulty">
          <optgroup label="洛谷难度分级">
            <option value="未标注">未标注</option>
            <option value="入门">入门</option>
            <option value="普及-">普及-</option>
            <option value="普及/提高-">普及/提高-</option>
            <option value="提高+/省选-">提高+/省选-</option>
          </optgroup>
          <optgroup label="Codeforces Rating 范围">
            <option value="≤1199">≤1199</option>
            <option value="1200-1399">1200-1399</option>
            <option value="1400-1599">1400-1599</option>
            <option value="1600-1899">1600-1899</option>
            <option value="1900-2199">1900-2199</option>
            <option value="≥2200">≥2200</option>
          </optgroup>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>题目标签</label>
        <input type="text" class="form-input problem-tags" maxlength="${LOG_LIMITS.tags * (LOG_LIMITS.tag + 2)}" placeholder="如 DP, 图论, 二分（最多 ${LOG_LIMITS.tags} 个）" />
      </div>
      <div class="form-group">
        <label>错题状态</label>
        <select class="form-input problem-review-status">
          <option value="none">非错题</option>
          <option value="todo">待复习</option>
          <option value="mastered">已掌握</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>题目描述（选填）<button type="button" class="btn-summarize" title="用 AI 概括题目描述">✨ 概括</button></label>
      <textarea class="form-input problem-description" rows="2" maxlength="${LOG_LIMITS.description}" placeholder="简要描述题目大意..."></textarea>
    </div>
    <div class="form-group">
      <label>收获 / 题解</label>
      <textarea class="form-input problem-takeaway" rows="4" maxlength="${LOG_LIMITS.takeaway}" placeholder="今天学到的内容、踩的坑，或题解..."></textarea>
    </div>
    <div class="form-group">
      <label>代码（选填，直接粘贴）</label>
      <textarea class="form-input problem-code" rows="6" maxlength="${LOG_LIMITS.code}" placeholder="粘贴代码即可，自动高亮显示" spellcheck="false"></textarea>
    </div>
  `;
  return div;
}

function resetProblems() {
  const list = document.getElementById("problem-list");
  list.innerHTML = "";
  list.appendChild(createProblemRow(0));
  updateSubmissionSummary();
}

function addProblem() {
  const list = document.getElementById("problem-list");
  if (list.children.length >= LOG_LIMITS.maxProblems) {
    document.getElementById("submit-msg").textContent = `每个日期最多记录 ${LOG_LIMITS.maxProblems} 道题`;
    return;
  }
  const idx = list.children.length;
  list.appendChild(createProblemRow(idx));
  markFormEdited();
}

function markFormEdited() {
  activeFormInitialized = true;
  dateLoadSequence += 1;
  updateSubmissionSummary();
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function updateSubmissionSummary() {
  const summary = document.getElementById("submission-summary");
  if (!summary) return;
  const problems = captureProblemDrafts();
  const bytes = logInputBytes({ problems });
  summary.textContent = `${problems.length}/${LOG_LIMITS.maxProblems} 题 · 约 ${formatBytes(bytes)} / ${formatBytes(LOG_LIMITS.maxRequestBytes)}`;
  summary.classList.toggle("limit-warning", bytes > LOG_LIMITS.maxRequestBytes || problems.length > LOG_LIMITS.maxProblems);
}

function collectProblems() {
  const blocks = document.querySelectorAll(".problem-block");
  const problems = [];
  for (const block of blocks) {
    const name = block.querySelector(".problem-name").value.trim();
    if (!name) continue;
    problems.push({
      id: block.dataset.problemId,
      problem: name,
      name,
      platform: block.querySelector(".problem-platform").value,
      problemNumber: block.querySelector(".problem-number").value.trim(),
      difficulty: block.querySelector(".problem-difficulty").value,
      tags: block.querySelector(".problem-tags").value,
      reviewStatus: block.querySelector(".problem-review-status").value,
      description: block.querySelector(".problem-description").value.trim(),
      takeaway: block.querySelector(".problem-takeaway").value.trim(),
      code: block.querySelector(".problem-code").value.trim(),
    });
  }
  return problems;
}

function captureProblemDrafts() {
  return [...document.querySelectorAll(".problem-block")].map((block) => ({
    id: block.dataset.problemId,
    problem: block.querySelector(".problem-name").value,
    platform: block.querySelector(".problem-platform").value,
    problemNumber: block.querySelector(".problem-number").value,
    difficulty: block.querySelector(".problem-difficulty").value,
    tags: block.querySelector(".problem-tags").value,
    reviewStatus: block.querySelector(".problem-review-status").value,
    description: block.querySelector(".problem-description").value,
    takeaway: block.querySelector(".problem-takeaway").value,
    code: block.querySelector(".problem-code").value,
  }));
}

function setDateFormState(date, exists) {
  const btnSave = document.getElementById("btn-save");
  const btnDelete = document.getElementById("btn-delete");
  btnSave.textContent = exists ? "更新记录" : "提交到 GitHub";
  btnDelete.style.display = exists ? "" : "none";
  btnDelete.onclick = exists ? () => handleDelete(date) : null;
  activeFormExists = exists;
}

function setDateLoadState(state) {
  activeFormLoadState = state;
  const blocked = state !== "ready";
  document.getElementById("btn-save").disabled = blocked;
  document.getElementById("btn-add-problem").disabled = blocked;
  for (const control of document.querySelectorAll("#problem-list input, #problem-list select, #problem-list textarea, #problem-list button")) {
    control.disabled = blocked;
  }
  document.getElementById("btn-retry-date").hidden = state !== "error";
}

async function onDateChange() {
  if (!currentUser) return;

  if (activeFormDate && activeFormInitialized) {
    dateDrafts.set(activeFormDate, {
      problems: captureProblemDrafts(),
      exists: activeFormExists,
    });
  }

  const date = document.getElementById("submit-date").value;
  if (!date) return;
  activeFormDate = date;

  const msgEl = document.getElementById("submit-msg");
  const draft = dateDrafts.get(date);
  if (draft) {
    populateProblems(draft.problems);
    setDateFormState(date, draft.exists);
    activeFormInitialized = true;
    setDateLoadState("ready");
    msgEl.textContent = "已恢复该日期尚未提交的内容";
    return;
  }

  const sequence = ++dateLoadSequence;
  setDateFormState(date, false);
  activeFormInitialized = false;
  resetProblems();
  setDateLoadState("loading");
  msgEl.textContent = "正在加载该日期的记录...";

  try {
    const loaded = await loadDateLog(date);
    if (sequence !== dateLoadSequence || date !== activeFormDate) return;
    const exists = loaded.problems.length > 0;

    if (exists) {
      const problems = loaded.problems.map((p) => ({ ...p, problem: p.name }));
      populateProblems(problems);
      msgEl.textContent = "📝 加载已有记录，修改后点击「更新记录」即可覆盖";
    } else {
      resetProblems();
      msgEl.textContent = "";
    }
    setDateFormState(date, exists);
    dateDrafts.set(date, { problems: captureProblemDrafts(), exists });
    activeFormInitialized = true;
    setDateLoadState("ready");
  } catch (error) {
    if (sequence !== dateLoadSequence || date !== activeFormDate) return;
    setDateFormState(date, false);
    setDateLoadState("error");
    msgEl.textContent = `加载失败，尚未确认该日期是否有记录：${error.message}`;
  }
}

function populateProblems(parsed) {
  const list = document.getElementById("problem-list");
  list.innerHTML = "";
  if (!parsed.length) {
    list.appendChild(createProblemRow(0));
    return;
  }
  parsed.forEach((p, i) => {
    const row = createProblemRow(i);
    row.dataset.problemId = p.id || createProblemId();
    row.querySelector(".problem-name").value = p.problem || "";
    row.querySelector(".problem-platform").value = p.platform || "洛谷";
    row.querySelector(".problem-number").value = p.problemNumber || "";
    row.querySelector(".problem-difficulty").value = p.difficulty || "未标注";
    row.querySelector(".problem-tags").value = Array.isArray(p.tags) ? p.tags.join(", ") : (p.tags || "");
    row.querySelector(".problem-review-status").value = p.reviewStatus || "none";
    row.querySelector(".problem-description").value = p.description || "";
    row.querySelector(".problem-takeaway").value = p.takeaway || "";
    row.querySelector(".problem-code").value = p.code || "";
    list.appendChild(row);
  });
  updateSubmissionSummary();
}

async function handleDelete(date) {
  if (!currentUser) {
    alert("请先登录 GitHub");
    return;
  }
  if (!confirm(`确定要删除 ${date} 的训练记录吗？此操作不可撤销。`)) return;

  const msgEl = document.getElementById("submit-msg");
  msgEl.textContent = "删除中...";
  const btnDelete = document.getElementById("btn-delete");
  if (btnDelete) btnDelete.disabled = true;

  try {
    await deleteDateLog(date);

    dateDrafts.delete(date);
    msgEl.textContent = "✅ 删除成功！等待自动部署（约 1 分钟）";
    setTimeout(() => closeModal(true), 2000);
  } catch (err) {
    msgEl.textContent = `❌ 删除失败：${err.message}`;
  } finally {
    if (btnDelete) btnDelete.disabled = false;
  }
}

async function handleSubmit() {
  if (!currentUser) {
    alert("请先登录 GitHub");
    return;
  }

  const date = document.getElementById("submit-date").value;
  if (!date) {
    document.getElementById("submit-msg").textContent = "请选择日期";
    return;
  }

  const problems = collectProblems();
  if (!problems.length) {
    document.getElementById("submit-msg").textContent = "请至少填写一道题";
    return;
  }

  try {
    validateLogInput({ problems });
  } catch (error) {
    document.getElementById("submit-msg").textContent = error.message;
    return;
  }

  const msgEl = document.getElementById("submit-msg");
  msgEl.textContent = "提交中...";
  const btnSave = document.getElementById("btn-save");
  btnSave.disabled = true;

  try {
    const isEdit = document.getElementById("btn-save").textContent === "更新记录";

    await saveDateLog(date, problems);

    dateDrafts.delete(date);
    msgEl.textContent = isEdit
     ? "✅ 更新成功！等待自动部署（约 1 分钟）"
      : "✅ 提交成功！等待自动部署（约 1 分钟）";
    setTimeout(() => closeModal(true), 2000);
  } catch (err) {
    msgEl.textContent = `❌ 提交失败：${err.message}`;
  } finally {
    btnSave.disabled = false;
  }
}

// ============================================================
// Journal Rendering
// ============================================================

let journalRenderer = null;
let overviewJournal = null;
let fullJournal = null;
let fullJournalPromise = null;
let problemDetailSequence = 0;
let forceProblemDetailRefresh = false;
const dataVersion = document.querySelector('meta[name="journal-data-version"]')?.content || "dev";
let enhancementPromise = null;

function dataUrl(path, force = false) {
  return `${path}?v=${force ? Date.now() : dataVersion}`;
}

async function fetchJson(path, force = false) {
  const response = await fetch(dataUrl(path, force));
  if (!response.ok) throw new Error(`数据加载失败（HTTP ${response.status}）`);
  return response.json();
}

async function loadProblemDetail(member, date, problemId, force = false) {
  const segments = [member, date, problemId].map(encodeURIComponent).join("/");
  return fetchJson(`data/problems/${segments}.json`, force);
}

async function ensureOverviewJournal(force = false) {
  if (overviewJournal && !force) return overviewJournal;
  const journal = await loadOverview(force);
  overviewJournal = journal;
  journalRenderer = renderJournal(journal, "overview");
  return journal;
}

async function ensureFullJournal(force = false) {
  if (fullJournal && !force) return fullJournal;
  if (fullJournalPromise) return fullJournalPromise;
  showFullDataLoading();
  fullJournalPromise = fetchJson("data/all.json", force)
    .then((journal) => {
      fullJournal = journal;
      journalRenderer = renderJournal(journal, "all");
      return journal;
    })
    .catch((error) => {
      showFullDataError(error);
      throw error;
    })
    .finally(() => {
      fullJournalPromise = null;
    });
  return fullJournalPromise;
}

function showFullDataLoading() {
  const route = currentRoute();
  if (route === "analysis" || route === "report") document.getElementById("analysis-summary").textContent = "正在加载全量训练数据...";
  if (route === "review") document.getElementById("review-summary").textContent = "正在加载全量错题数据...";
  if (route.startsWith("member/")) document.getElementById("member-record-count").textContent = "正在加载该队员的全部训练数据...";
}

function showFullDataError(error) {
  const message = `加载失败：${error.message}`;
  const route = currentRoute();
  if (route === "analysis" || route === "report") document.getElementById("analysis-summary").textContent = message;
  if (route === "review") document.getElementById("review-summary").textContent = message;
  if (route.startsWith("member/")) document.getElementById("member-record-count").textContent = message;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`资源加载失败：${src}`));
    document.head.appendChild(script);
  });
}

function loadEnhancements() {
  enhancementPromise ??= (async () => {
    await loadScript("vendor/prism/prism.min.js");
    Prism.languages.c ??= Prism.languages.extend("clike", {
      keyword: /\b(?:auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while)\b/,
      macro: { pattern: /(^\s*)#\s*[a-z]+(?:.*\\(?:\r\n|\r|\n).+)*/m, lookbehind: true, alias: "property" },
    });
    await Promise.all([
      loadScript("vendor/prism/prism-cpp.min.js"),
      loadScript("vendor/prism/prism-line-numbers.min.js"),
      loadScript("vendor/katex/katex.min.js"),
    ]);
    await loadScript("vendor/katex/auto-render.min.js");
  })();
  return enhancementPromise;
}

function renderJournal(journal, dataScope = "overview") {
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

  function levelOf(count) {
    if (!count) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count <= 4) return 3;
    return 4;
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

  function logCardHtml(log) {
    const title = escapeHtml(log.problem);
    const sourceUrl = originalProblemUrl(log.platform, log.problemNumber, log.problem);

    const reviewLabel = log.reviewStatus === "todo" ? "待复习" : log.reviewStatus === "mastered" ? "已掌握" : "";
    const badges = [
      ...log.tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`),
      ...(reviewLabel ? [`<span class="review-chip ${log.reviewStatus}">${reviewLabel}</span>`] : []),
    ].join("");
    return `
      <div class="record-head">
        <time>${escapeHtml(log.date)}</time>
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

  function renderStats(member) {
    const stats = recent30.byMember[member];
    if (!stats) return;
    document.getElementById("metric-total").textContent = String(stats.totalLogs);
    document.getElementById("metric-days").textContent = String(stats.activeDays);
    document.getElementById("metric-weekly").textContent = `${stats.avgPerWeek} 题/周`;

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

  function renderHeatmap(member) {
    const counts = member === "all" ? heatmap.all : (heatmap.byMember[member] || {});
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 364);

    const heatmapRoot = document.getElementById("heatmap");
    heatmapRoot.innerHTML = "";

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
            cnt: (heatmap.byMember[m] && heatmap.byMember[m][dateText]) || 0,
          }))
          .filter((c) => c.cnt > 0)
          .sort((a, b) => b.cnt - a.cnt || a.name.localeCompare(b.name, "zh-CN"));
        const lines = contributions.map((c) => `${c.name}: ${c.cnt} 题`);
        tooltip = [tooltip, ...lines].join("\n");
      }

      const cell = document.createElement("span");
      cell.className = `cell lv${levelOf(count)}`;
      cell.title = tooltip;
      heatmapRoot.appendChild(cell);
    }
  }

  function renderLogs(member) {
    const reviewStatus = document.getElementById("review-filter").value;
    const filtered = logs.filter((log) =>
      (member === "all" || log.member === member) &&
      (activeTagFilter === "all" || log.tags.includes(activeTagFilter)) &&
      (reviewStatus === "all" || log.reviewStatus === reviewStatus)
    );
    document.getElementById("record-count").textContent = `近 30 天当前筛选共 ${filtered.length} 条记录`;

    const recordsRoot = document.getElementById("records");
    recordsRoot.innerHTML = "";

    if (!filtered.length) {
      recordsRoot.textContent = "暂无记录。";
      return;
    }

    for (const log of filtered) recordsRoot.appendChild(createLogCard(log));
  }

  function setTagFilter(tag) {
    activeTagFilter = tag;
    renderTagFilterBar();
    renderLogs(memberSelect.value);
  }

  // 动态填充队员下拉框
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

  function renderTagFilterBar() {
    const bar = document.getElementById("tag-filter-bar");
    bar.innerHTML = `<span class="tag-chip tag-filter-chip${activeTagFilter === "all" ? " active" : ""}" data-tag="all">全部</span>`;
    for (const [tag, count] of sortedTags) {
      const chip = document.createElement("span");
      chip.className = `tag-chip tag-filter-chip${activeTagFilter === tag ? " active" : ""}`;
      chip.dataset.tag = tag;
      chip.textContent = `${tag} (${count})`;
      bar.appendChild(chip);
    }
  }

  function renderTagCloud() {
    const root = document.getElementById("tag-cloud");
    root.innerHTML = "";
    if (!sortedTags.length) { root.innerHTML = `<p class="hint">近 30 天暂无标签数据，提交记录时添加标签即可在此查看。</p>`; return; }

    const maxCount = sortedTags[0]?.[1] || 1;
    for (const [tag, count] of sortedTags) {
      const size = 0.75 + (count / maxCount) * 1.25; // Scale from 0.75em to 2em
      const chip = document.createElement("span");
      chip.className = "tag-chip tag-cloud-chip";
      chip.style.cssText = `font-size:${size.toFixed(2)}em;`;
      chip.dataset.tag = tag;
      chip.textContent = `${tag} (${count})`;
      chip.title = `点击筛选「${tag}」· ${count} 题`;
      root.appendChild(chip);
    }
  }

  function renderReviewBook() {
    const member = document.getElementById("review-member").value;
    const status = document.getElementById("review-status").value;
    const tag = document.getElementById("review-tag").value;
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

  function renderCountMap(root, map, emptyText) {
    const entries = Object.entries(map).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
    root.innerHTML = "";
    if (!entries.length) { root.textContent = emptyText; return; }
    const list = document.createElement("ul");
    list.className = "stat-list";
    for (const [name, count] of entries) list.insertAdjacentHTML("beforeend", `<li><span>${escapeHtml(name)}</span><strong>${count}</strong></li>`);
    root.appendChild(list);
  }

  function renderAnalysis() {
    const selectedMember = analysisMember.value;
    const startValue = document.getElementById("analysis-start").value;
    const endValue = document.getElementById("analysis-end").value;
    const periodLabel = startValue && endValue
      ? `${startValue} 至 ${endValue}`
      : "请选择开始和结束日期";

    const filtered = logs.filter((log) => {
      const memberMatches = selectedMember === "all" || log.member === selectedMember;
      return memberMatches && startValue && endValue && log.date >= startValue && log.date <= endValue;
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
    document.getElementById("analysis-summary").textContent = `${selectedMember === "all" ? "全队" : selectedMember} · ${periodLabel} · 共 ${filtered.length} 题`;
    renderCountMap(document.getElementById("analysis-tags"), tagCounts, "该时间范围暂无标签数据。");
    renderCountMap(document.getElementById("analysis-review-stats"), { 待复习: todo, 已掌握: mastered }, "该时间范围暂无错题记录。");

    const recordsRoot = document.getElementById("analysis-records");
    recordsRoot.innerHTML = "";
    if (!filtered.length) {
      recordsRoot.textContent = startValue && endValue ? "该时间范围暂无记录。" : "请选择开始和结束日期。";
      return;
    }

    for (const log of filtered) {
      recordsRoot.appendChild(createLogCard(log, { className: "analysis-record" }));
    }
  }

  function renderMemberPage(member) {
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
    heatmapRoot.innerHTML = "";
    const counts = heatmap.byMember[member] || {};
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 364);
    for (let i = 0; i < 365; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const dateText = toDateString(date);
      const count = counts[dateText] || 0;
      const cell = document.createElement("span");
      cell.className = `cell lv${levelOf(count)}`;
      cell.title = `${dateText} · ${count} 题`;
      heatmapRoot.appendChild(cell);
    }

    root.innerHTML = "";
    for (const log of memberLogs) root.appendChild(createLogCard(log));
  }

  async function renderProblemPage(member, date, index) {
    const root = document.getElementById("problem-detail");
    document.getElementById("problem-back-member").href = memberUrl(member);
    const sequence = ++problemDetailSequence;
    root.innerHTML = `<p class="eyebrow">题目详情</p><h1>加载中</h1><p class="hint">正在加载题目描述、题解和代码...</p>`;
    let log;
    try {
      const force = forceProblemDetailRefresh;
      forceProblemDetailRefresh = false;
      log = await loadProblemDetail(member, date, decodeURIComponent(index), force);
    } catch (error) {
      if (sequence !== problemDetailSequence) return;
      root.innerHTML = `<p class="eyebrow">题目详情</p><h1>未找到该题目</h1><p class="hint">${escapeHtml(error.message)}</p>`;
      return;
    }
    if (sequence !== problemDetailSequence || !currentRoute().startsWith("problem/")) return;

    const sourceUrl = originalProblemUrl(log.platform, log.problemNumber, log.problem);

    root.innerHTML = `
      <div class="problem-detail-head">
        <div>
          <p class="eyebrow">${escapeHtml(log.date)} · 第 ${(log.problemIndex ?? 0) + 1} 题</p>
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
  }

  async function renderRoute() {
    const parts = currentRoute().split("/");
    document.title = "ICPC 算法训练日志";
    if (dataScope === "shell" && !parts[0]) {
      try { await ensureOverviewJournal(); } catch (error) { document.getElementById("records").textContent = `数据加载失败：${error.message}`; }
      return;
    }
    if (dataScope !== "all" && (parts[0] === "analysis" || parts[0] === "report" || parts[0] === "review" || parts[0] === "member")) {
      try { await ensureFullJournal(); } catch { /* Error state is rendered by ensureFullJournal. */ }
      return;
    }
    if (parts[0] === "member" && parts[1]) renderMemberPage(decodeURIComponent(parts[1]));
    if (parts[0] === "problem" && parts.length >= 4) {
      renderProblemPage(decodeURIComponent(parts[1]), decodeURIComponent(parts[2]), parts[3]);
    }
  }

  analysisMember.onchange = renderAnalysis;
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
      renderAnalysis();
    };
  }
  for (const button of presetButtons) {
    button.onclick = () => {
      const range = presetRange(button.dataset.range);
      analysisStart.value = range.start;
      analysisEnd.value = range.end;
      syncAnalysisDateRange();
      updateRangePresetState();
      renderAnalysis();
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
  if (dataScope === "all") renderAnalysis();
  for (const id of ["review-member", "review-status", "review-tag"]) document.getElementById(id).onchange = renderReviewBook;
  document.getElementById("review-filter").onchange = () => renderLogs(memberSelect.value);
  if (dataScope === "all") renderReviewBook();

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
  // Clickable log card tag chips — delegate from records container
  document.getElementById("records").addEventListener("click", (e) => {
    const chip = e.target.closest(".record-badges .tag-chip");
    if (!chip) return;
    e.preventDefault();
    e.stopPropagation();
    setTagFilter(chip.textContent.trim());
  });

  function render(member) {
    renderStats(member);
    renderHeatmap(member);
    renderTagCloud();
    renderTagFilterBar();
    renderLogs(member);
    if (dataScope === "all") {
      renderAnalysis();
      renderReviewBook();
    }
  }

  render("all");
  renderRoute();
  // Initial tag UI setup
  renderTagCloud();
  renderTagFilterBar();
  window.journalRouteRenderer = renderRoute;
  memberSelect.onchange = (e) => render(e.target.value);

  return { render, renderRoute };
}

// ============================================================
// Data Refresh & Cache Busting
// ============================================================

const REFRESH_INTERVAL = 5 * 60 * 1000;
let overviewPromise = null;

async function loadOverview(force = false) {
  if (overviewPromise) {
    return await overviewPromise;
  }
  overviewPromise = fetchJson("data/overview.json", force)
    .finally(() => {
      overviewPromise = null;
    });
  return await overviewPromise;
}

function startRefreshTimer() {
  // 静默后台刷新，每 5 分钟更新一次数据
  setInterval(async () => {
    await doRefresh();
  }, REFRESH_INTERVAL);
}

async function doRefresh() {
  const btnRefresh = document.getElementById("btn-refresh");
  if (btnRefresh) {
    btnRefresh.disabled = true;
    btnRefresh.textContent = "⏳ 刷新中...";
  }

  try {
    const route = currentRoute();
    if (route.startsWith("problem/")) {
      forceProblemDetailRefresh = true;
      await journalRenderer?.renderRoute();
    } else if (route === "analysis" || route === "report" || route === "review" || route.startsWith("member/")) {
      fullJournal = null;
      await ensureFullJournal(true);
    } else {
      const overview = await loadOverview(true);
      overviewJournal = overview;
      const member = document.getElementById("member-select").value || "all";
      journalRenderer = renderJournal(overview, "overview");
      journalRenderer.render(member);
    }
  } catch (err) {
    console.error("刷新失败:", err);
  } finally {
    if (btnRefresh) {
      btnRefresh.disabled = false;
      btnRefresh.textContent = "🔄 刷新";
    }
  }
}

// ============================================================
// Theme Management
// ============================================================

const THEME_KEY = "theme";
const THEME_LIGHT = "light";
const THEME_DARK = "dark";

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? THEME_DARK : THEME_LIGHT;
}

function getTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved || getSystemTheme();
}

function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === THEME_DARK) {
    html.setAttribute("data-theme", THEME_DARK);
  } else {
    html.removeAttribute("data-theme");
  }
  updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById("btn-theme");
  if (!btn) return;
  btn.textContent = theme === THEME_DARK ? "☀️" : "🌙";
  btn.title = theme === THEME_DARK ? "切换为浅色模式" : "切换为暗色模式";
}

function toggleTheme() {
  const current = getTheme();
  const next = current === THEME_DARK ? THEME_LIGHT : THEME_DARK;
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

function initTheme() {
  applyTheme(getTheme());

  // Listen for system theme changes — only take effect when user hasn't manually chosen
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(getSystemTheme());
    }
  });
}

function initPageNavigation() {
  const buttons = document.querySelectorAll(".page-nav-btn");
  const pages = document.querySelectorAll(".page-view");

  function showRequestedPage() {
    const route = currentRoute();
    let pageId = "overview-page";
    if (route === "analysis" || route === "report") pageId = "analysis-page";
    if (route === "review") pageId = "review-page";
    if (route.startsWith("member/")) pageId = "member-page";
    if (route.startsWith("problem/")) pageId = "problem-page";
    for (const page of pages) page.hidden = page.id !== pageId;
    for (const button of buttons) button.classList.toggle("active", button.dataset.page === pageId);
    if (typeof window.journalRouteRenderer === "function") window.journalRouteRenderer();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const route = button.dataset.page.replace("-page", "");
      navigateTo(route === "overview" ? "/" : `/${route}/`);
    });
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || link.target || link.hasAttribute("download")) return;
    event.preventDefault();
    navigateTo(`${url.pathname}${url.search}${url.hash}`);
  });
  window.addEventListener("popstate", showRequestedPage);
  showRequestedPage();
}

// ============================================================
// Bootstrap
// ============================================================

(async function bootstrap() {
  // 0. Theme
  migrateLegacyHashRoute();
  initTheme();
  initPageNavigation();

  // 1. Auth
  try { currentUser = await loadSession(); } catch { currentUser = null; }
  updateAuthUI(currentUser);

  // 2. Event bindings
  document.getElementById("btn-theme").addEventListener("click", toggleTheme);
  document.getElementById("btn-login").addEventListener("click", login);
  document.getElementById("btn-logout").addEventListener("click", logout);
  document.getElementById("btn-submit").addEventListener("click", openModal);
  document.getElementById("btn-close-modal").addEventListener("click", () => closeModal());
  document.getElementById("btn-add-problem").addEventListener("click", addProblem);
  document.getElementById("btn-save").addEventListener("click", handleSubmit);
  document.getElementById("submit-date").addEventListener("change", onDateChange);
  document.getElementById("btn-retry-date").addEventListener("click", onDateChange);
  document.getElementById("problem-list").addEventListener("click", async (e) => {
    if (e.target.classList.contains("btn-remove")) {
      e.target.closest(".problem-block").remove();
      markFormEdited();
      return;
    }
    // AI summarize button
    const summarizeBtn = e.target.closest(".btn-summarize");
    if (summarizeBtn) {
      e.preventDefault();
      const block = summarizeBtn.closest(".problem-block");
      const desc = block.querySelector(".problem-description");
      if (!desc.value.trim() || desc.value.trim().length < 20) {
        document.getElementById("submit-msg").textContent = "请先输入至少 20 字的题目描述再概括";
        return;
      }
      if (summarizeBtn.disabled) return;
      summarizeBtn.disabled = true;
      summarizeBtn.textContent = "⏳ 概括中...";
      try {
        const res = await apiRequest("/api/summarize", { method: "POST", body: JSON.stringify({ description: desc.value.trim() }) });
        if (res.summary) {
          desc.value = res.summary;
          document.getElementById("submit-msg").textContent = "✅ 已生成概括，可手动修改";
          markFormEdited();
        }
      } catch (err) {
        document.getElementById("submit-msg").textContent = `概括失败：${err.message}`;
      } finally {
        summarizeBtn.disabled = false;
        summarizeBtn.textContent = "✨ 概括";
      }
    }
  });
  document.getElementById("problem-list").addEventListener("input", markFormEdited);
  document.getElementById("problem-list").addEventListener("change", markFormEdited);

  // 3. Load journal
  try {
    const route = currentRoute();
    if (route === "analysis" || route === "report" || route === "review" || route.startsWith("member/")) {
      await ensureFullJournal();
    } else if (route.startsWith("problem/")) {
      journalRenderer = renderJournal({ members: [], logs: [], heatmap: { all: {}, byMember: {} }, recent30: { start: "", end: "", byMember: {} } }, "shell");
    } else {
      await ensureOverviewJournal();
    }
  } catch {
    document.getElementById("records").textContent = "数据加载失败，请稍后刷新重试。";
    for (const id of ["metric-total", "metric-days", "metric-weekly"]) document.getElementById(id).textContent = "加载失败";
  }

  // 4. Setup refresh timer
  if (journalRenderer) startRefreshTimer();

  // 5. Manual refresh
  document.getElementById("btn-refresh").addEventListener("click", async () => {
    await doRefresh();
  });
})();
