import { createProblemId } from "./lib/log-schema.mjs";
import { deleteDateLog, loadDateLog, loadSession, loginWithGitHub, logoutSession, saveDateLog } from "./lib/journal-api.js";

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

function openModal() {
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
    <div class="form-group">
      <label>题目名称</label>
      <input type="text" class="form-input problem-name" placeholder="如 P1104 或 CF 4A" />
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
        <input type="text" class="form-input problem-tags" placeholder="如 DP, 图论, 二分（逗号分隔）" />
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
      <label>题目描述（选填）</label>
      <textarea class="form-input problem-description" rows="2" placeholder="简要描述题目大意..."></textarea>
    </div>
    <div class="form-group">
      <label>收获 / 题解</label>
      <textarea class="form-input problem-takeaway" rows="4" placeholder="今天学到的内容、踩的坑，或题解..."></textarea>
    </div>
    <div class="form-group">
      <label>代码（选填，直接粘贴）</label>
      <textarea class="form-input problem-code" rows="6" placeholder="粘贴代码即可，自动高亮显示" spellcheck="false"></textarea>
    </div>
  `;
  return div;
}

function resetProblems() {
  const list = document.getElementById("problem-list");
  list.innerHTML = "";
  list.appendChild(createProblemRow(0));
}

function addProblem() {
  const list = document.getElementById("problem-list");
  const idx = list.children.length;
  list.appendChild(createProblemRow(idx));
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

async function onDateChange() {
  if (!currentUser) return;

  const date = document.getElementById("submit-date").value;
  if (!date) return;

  const btnSave = document.getElementById("btn-save");
  const msgEl = document.getElementById("submit-msg");

  try {
    const loaded = await loadDateLog(date);
    const metaContent = loaded.problems.length ? "present" : null;

    const btnDelete = document.getElementById("btn-delete");
    if (metaContent) {
      const problems = loaded.problems.map((p) => ({ ...p, problem: p.name }));
      populateProblems(problems);
      btnSave.textContent = "更新记录";
      msgEl.textContent = "📝 加载已有记录，修改后点击「更新记录」即可覆盖";
      btnDelete.style.display = "";
      btnDelete.onclick = () => handleDelete(date);
    } else {
      resetProblems();
      btnSave.textContent = "提交到 GitHub";
      msgEl.textContent = "";
      btnDelete.style.display = "none";
    }
  } catch {
    resetProblems();
    btnSave.textContent = "提交到 GitHub";
    msgEl.textContent = "";
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
    row.querySelector(".problem-difficulty").value = p.difficulty || "未标注";
    row.querySelector(".problem-tags").value = (p.tags || []).join(", ");
    row.querySelector(".problem-review-status").value = p.reviewStatus || "none";
    row.querySelector(".problem-description").value = p.description || "";
    row.querySelector(".problem-takeaway").value = p.takeaway || "";
    row.querySelector(".problem-code").value = p.code || "";
    list.appendChild(row);
  });
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

  const msgEl = document.getElementById("submit-msg");
  msgEl.textContent = "提交中...";
  const btnSave = document.getElementById("btn-save");
  btnSave.disabled = true;

  try {
    const isEdit = document.getElementById("btn-save").textContent === "更新记录";

    await saveDateLog(date, problems);

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

function renderJournal(journal) {
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

  function renderEnhancements(root) {
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

  function logCardHtml(log, { expandable = false } = {}) {
    const title = escapeHtml(log.problem);
    const titleHtml = expandable
      ? `<button class="record-title-clickable" type="button" aria-expanded="false">${title} <span class="expand-icon">▼</span></button>`
      : `<h3 class="record-title">${title}</h3>`;
    const details = expandable
      ? `<div class="record-takeaway">
          ${log.description ? `<div class="record-section record-desc">${renderMarkdown(log.description)}</div>` : ""}
          ${log.takeaway ? `<div class="record-section record-takeaway-text">${renderMarkdown(log.takeaway)}</div>` : ""}
          ${log.code ? `<div class="record-section record-code"><pre class="line-numbers"><code class="language-cpp">${escapeHtml(log.code)}</code></pre></div>` : ""}
        </div>`
      : "";

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
      ${titleHtml}
      <p class="meta">平台：${escapeHtml(log.platform)} ｜ 难度：${escapeHtml(log.difficulty)}</p>
      ${badges ? `<div class="record-badges">${badges}</div>` : ""}
      ${details}
      <a class="record-detail-link" href="${problemUrl(log)}">查看题目详情 →</a>
    `;
  }

  function createLogCard(log, options) {
    const card = document.createElement("article");
    card.className = `record${options?.className ? ` ${options.className}` : ""}`;
    card.innerHTML = logCardHtml(log, options);
    const toggle = card.querySelector(".record-title-clickable");
    if (toggle) {
      toggle.onclick = () => {
        const expanded = card.classList.toggle("expanded");
        toggle.setAttribute("aria-expanded", String(expanded));
      };
    }
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
        item.innerHTML = `<span>${name}</span><strong>${count}</strong>`;
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
    const tag = document.getElementById("tag-filter").value;
    const reviewStatus = document.getElementById("review-filter").value;
    const filtered = logs.filter((log) =>
      (member === "all" || log.member === member) &&
      (tag === "all" || log.tags.includes(tag)) &&
      (reviewStatus === "all" || log.reviewStatus === reviewStatus)
    );
    document.getElementById("record-count").textContent = `${recent30.start} ~ ${recent30.end} 统计窗口，当前筛选共 ${filtered.length} 条记录`;

    const recordsRoot = document.getElementById("records");
    recordsRoot.innerHTML = "";

    if (!filtered.length) {
      recordsRoot.textContent = "暂无记录。";
      return;
    }

    for (const log of filtered) recordsRoot.appendChild(createLogCard(log, { expandable: true }));
    renderEnhancements(recordsRoot);
  }

  // Markdown 渲染器（支持代码块 + 行内代码 + LaTeX 公式）
  function renderMarkdown(text) {
    if (!text) return "";

    // 将所有"特殊片段"提取为占位符，然后再对剩余纯文本做 escapeHtml，
    // 最后还原。这样特殊片段内部的 < > & " ' 不会被二次转义。
    const preserved = [];

    // 1. 代码块 ```...```
    let processed = text.replace(/```(\w*)\s*\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = preserved.length;
      const languageClass = lang ? `language-${lang}` : "language-text";
      preserved.push(`<pre class="line-numbers"><code class="${languageClass}">${escapeHtml(code.trim())}</code></pre>`);
      return `\x00P${idx}\x00`;
    });

    // 2. 行间公式 $$...$$
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
      const idx = preserved.length;
      preserved.push(`$$${formula.trim()}$$`);
      return `\x00P${idx}\x00`;
    });

    // 3. 行内公式 $...$（排除 $$）
    processed = processed.replace(/(?<!\$)\$(?!\$)([^$]+?)\$(?!\$)/g, (_, formula) => {
      const idx = preserved.length;
      preserved.push(`$${formula.trim()}$`);
      return `\x00P${idx}\x00`;
    });

    // 4. 行内代码 `...` —— 必须在 escapeHtml 之前提取，否则反引号会被转义成 &#96;
    processed = processed.replace(/`([^`]+)`/g, (_, codeContent) => {
      const idx = preserved.length;
      preserved.push(`<code class="language-text">${escapeHtml(codeContent)}</code>`);
      return `\x00P${idx}\x00`;
    });

    // 5. Markdown 标题。标题内容先转义，避免用户输入被当成 HTML 执行。
    processed = processed.replace(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*#*$/gm, (_, marks, heading) => {
      const idx = preserved.length;
      const level = marks.length;
      preserved.push(`<h${level}>${escapeHtml(heading.trim())}</h${level}>`);
      return `\x00P${idx}\x00`;
    });

    // 6. 对剩余内容 escape HTML
    processed = escapeHtml(processed);

    // 7. 只给普通文本换行，避免把代码块中的换行变成 <br>
    processed = processed.replace(/\n/g, "<br>");

    // 8. 还原所有保留片段
    processed = processed.replace(/\x00P(\d+)\x00/g, (_, idx) => preserved[parseInt(idx)]);

    return processed;
  }

  function escapeHtml(str) {
    const el = document.createElement("div");
    el.appendChild(document.createTextNode(str));
    return el.innerHTML;
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
  function populateSelect(select, values) {
    while (select.options.length > 1) select.remove(1);
    for (const value of values) select.add(new Option(value, value));
  }
  populateSelect(document.getElementById("review-member"), uniqueMembers);
  for (const id of ["tag-filter", "review-tag"]) populateSelect(document.getElementById(id), allTags);

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

  function renderProblemPage(member, date, index) {
    const problemIndex = Number(index);
    const log = logs.find((item) => item.member === member && item.date === date && (item.problemId === decodeURIComponent(index) || (Number.isFinite(problemIndex) && (item.problemIndex ?? 0) === problemIndex)));
    const root = document.getElementById("problem-detail");
    document.getElementById("problem-back-member").href = memberUrl(member);
    if (!log) {
      root.innerHTML = `<p class="eyebrow">题目详情</p><h1>未找到该题目</h1><p class="hint">链接可能已失效，或训练记录已被修改。</p>`;
      return;
    }

    root.innerHTML = `
      <div class="problem-detail-head">
        <div>
          <p class="eyebrow">${escapeHtml(log.date)} · 第 ${(log.problemIndex ?? 0) + 1} 题</p>
          <h1>${escapeHtml(log.problem)}</h1>
        </div>
        <a class="member-chip" href="${memberUrl(log.member)}">${escapeHtml(log.member)} 的主页</a>
      </div>
      <p class="problem-meta">平台：${escapeHtml(log.platform)} <span>难度：${escapeHtml(log.difficulty)}</span></p>
      ${(log.tags.length || log.reviewStatus !== "none") ? `<div class="record-badges">${log.tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")}${log.reviewStatus !== "none" ? `<span class="review-chip ${log.reviewStatus}">${log.reviewStatus === "todo" ? "待复习" : "已掌握"}</span>` : ""}</div>` : ""}
      <div class="problem-content">
        ${log.description ? `<section class="problem-section"><h2>题目描述</h2>${renderMarkdown(log.description)}</section>` : ""}
        ${log.takeaway ? `<section class="problem-section"><h2>收获 / 题解</h2>${renderMarkdown(log.takeaway)}</section>` : ""}
        ${log.code ? `<section class="problem-section"><h2>代码</h2><div class="record-takeaway problem-code-expanded"><pre class="line-numbers"><code class="language-cpp">${escapeHtml(log.code)}</code></pre></div></section>` : ""}
      </div>
    `;
    renderEnhancements(root);
    document.title = `${log.problem} · ${log.member} · ICPC 算法训练日志`;
  }

  function renderRoute() {
    const parts = currentRoute().split("/");
    document.title = "ICPC 算法训练日志";
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
  renderAnalysis();
  for (const id of ["review-member", "review-status", "review-tag"]) document.getElementById(id).onchange = renderReviewBook;
  document.getElementById("tag-filter").onchange = () => renderLogs(memberSelect.value);
  document.getElementById("review-filter").onchange = () => renderLogs(memberSelect.value);
  renderReviewBook();

  function render(member) {
    renderStats(member);
    renderHeatmap(member);
    renderLogs(member);
    renderAnalysis();
    renderReviewBook();
  }

  render("all");
  renderRoute();
  window.journalRouteRenderer = renderRoute;
  memberSelect.onchange = (e) => render(e.target.value);

  return { render };
}

// ============================================================
// Data Refresh & Cache Busting
// ============================================================

const REFRESH_INTERVAL = 5 * 60 * 1000;
let journalPromise = null;

async function loadJournal() {
  if (journalPromise) {
    return await journalPromise;
  }
  journalPromise = fetch(`data.json?ts=${Date.now()}`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .finally(() => {
      journalPromise = null;
    });
  return await journalPromise;
}

function startRefreshTimer(renderFn, getCurrentMember) {
  // 静默后台刷新，每 5 分钟更新一次数据
  setInterval(async () => {
    await doRefresh(renderFn, getCurrentMember);
  }, REFRESH_INTERVAL);
}

async function doRefresh(renderFn, getCurrentMember) {
  const btnRefresh = document.getElementById("btn-refresh");
  if (btnRefresh) {
    btnRefresh.disabled = true;
    btnRefresh.textContent = "⏳ 刷新中...";
  }

  try {
    const journal = await loadJournal();
    if (journal) {
      const member = getCurrentMember ? getCurrentMember() : "all";
      const result = renderJournal(journal);
      if (result && result.render) {
        result.render(member);
      }
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
  document.getElementById("problem-list").addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-remove")) {
      e.target.closest(".problem-block").remove();
    }
  });

  // 3. Load journal
  let journalRenderer = null;
  try {
    const journal = await loadJournal();
    if (journal) {
      journalRenderer = renderJournal(journal);
    }
  } catch {
    document.getElementById("records").textContent = "数据加载失败，请稍后刷新重试。";
  }

  // 4. Setup refresh timer
  if (journalRenderer) {
    const getCurrentMember = () => {
      const select = document.getElementById("member-select");
      return select ? select.value : "all";
    };
    startRefreshTimer(journalRenderer.render, getCurrentMember);
  }

  // 5. Manual refresh
  document.getElementById("btn-refresh").addEventListener("click", async () => {
    const getCurrentMember = () => {
      const select = document.getElementById("member-select");
      return select ? select.value : "all";
    };
    await doRefresh(journalRenderer ? journalRenderer.render : null, getCurrentMember);
  });
})();
