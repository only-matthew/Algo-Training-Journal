import { createProblemId, LOG_LIMITS, REVIEW_STATUSES, logInputBytes, validateLogInput } from "./log-schema.mjs";
import { apiRequest, deleteDateLog, loadDateLog, saveDateLog, importCodeforces, importLuogu, importAtCoder } from "./journal-api.js";
import { PLATFORMS, toDateString, formatUpdateTime } from "./constants.mjs";
import { currentUser } from "./auth.mjs";
import { CANONICAL_TAGS, normalizeTagList } from "./tag-catalog.mjs";

export let activeFormDate = "";
export let activeFormExists = false;
export let activeFormInitialized = false;
export let activeFormLoadState = "idle";
export let dateLoadSequence = 0;
export const dateDrafts = new Map();

let submitting = false;
let focusTrapHandler = null;
let lastFocusedElement = null;

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const debouncedUpdateSummary = debounce(updateSubmissionSummary, 300);

function extractProblemFields(block) {
  return {
    id: block.dataset.problemId,
    name: block.querySelector(".problem-name").value,
    platform: block.querySelector(".problem-platform").value,
    problemNumber: block.querySelector(".problem-number").value,
    difficulty: block.querySelector(".problem-difficulty").value,
    tags: block.querySelector(".problem-tags").value,
    reviewStatus: block.querySelector(".problem-review-status").value,
    reviewDue: block.querySelector(".problem-review-due").value,
    description: block.querySelector(".problem-description").value,
    takeaway: block.querySelector(".problem-takeaway").value,
    code: block.querySelector(".problem-code").value,
  };
}

export function collectProblems() {
  const blocks = document.querySelectorAll(".problem-block");
  const problems = [];
  for (const block of blocks) {
    const f = extractProblemFields(block);
    const name = f.name.trim();
    if (!name) continue;
    problems.push({
      id: f.id,
      problem: name,
      name,
      platform: f.platform,
      problemNumber: f.problemNumber.trim(),
      difficulty: f.difficulty,
      tags: f.tags,
      reviewStatus: f.reviewStatus,
      reviewDue: f.reviewDue,
      description: f.description.trim(),
      takeaway: f.takeaway.trim(),
      code: f.code.trim(),
    });
  }
  return problems;
}

export function captureProblemDrafts() {
  return [...document.querySelectorAll(".problem-block")].map((block) => {
    const f = extractProblemFields(block);
    return {
      id: f.id,
      problem: f.name,
      platform: f.platform,
      problemNumber: f.problemNumber,
      difficulty: f.difficulty,
      tags: f.tags,
      reviewStatus: f.reviewStatus,
      reviewDue: f.reviewDue,
      description: f.description,
      takeaway: f.takeaway,
      code: f.code,
    };
  });
}

export function openModal() {
  dateDrafts.clear();
  activeFormDate = "";
  activeFormExists = false;
  activeFormInitialized = false;
  activeFormLoadState = "idle";
  dateLoadSequence += 1;
  submitting = false;
  const modal = document.getElementById("submit-modal");
  modal.style.display = "flex";
  document.getElementById("submit-date").value = toDateString(new Date());
  document.getElementById("submit-msg").textContent = "";
  resetProblems();
  onDateChange();
  lastFocusedElement = document.activeElement;
  const focusable = modal.querySelectorAll('input, select, textarea, button, [tabindex]:not([tabindex="-1"])');
  const firstFocusable = focusable[0];
  const lastFocusable = focusable[focusable.length - 1];
  if (firstFocusable) firstFocusable.focus();
  focusTrapHandler = (e) => {
    if (e.key !== "Tab") return;
    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  };
  modal.addEventListener("keydown", focusTrapHandler);
}

export function closeModal(force = false) {
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
  if (focusTrapHandler) {
    document.getElementById("submit-modal").removeEventListener("keydown", focusTrapHandler);
    focusTrapHandler = null;
  }
  if (lastFocusedElement) lastFocusedElement.focus();
  submitting = false;
  document.getElementById("submit-modal").style.display = "none";
  dateDrafts.clear();
  activeFormDate = "";
  activeFormExists = false;
  activeFormInitialized = false;
  activeFormLoadState = "idle";
  dateLoadSequence += 1;
}

export function createProblemRow(index) {
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
        <label for="prob-${index}-name">题目名称</label>
        <input id="prob-${index}-name" type="text" class="form-input problem-name" maxlength="${LOG_LIMITS.name}" placeholder="如 排序" />
      </div>
      <div class="form-group">
        <label for="prob-${index}-number">题号（洛谷 / Codeforces）</label>
        <input id="prob-${index}-number" type="text" class="form-input problem-number" maxlength="${LOG_LIMITS.problemNumber}" placeholder="如 P1104 或 4A" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label for="prob-${index}-platform">平台</label>
        <select id="prob-${index}-platform" class="form-input problem-platform">
          <option value="${PLATFORMS.LUOGU}">${PLATFORMS.LUOGU}</option>
          <option value="${PLATFORMS.CODEFORCES}">${PLATFORMS.CODEFORCES}</option>
          <option value="${PLATFORMS.ATCODER}">${PLATFORMS.ATCODER}</option>
          <option value="${PLATFORMS.OTHER}">${PLATFORMS.OTHER}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="prob-${index}-difficulty">难度</label>
        <select id="prob-${index}-difficulty" class="form-input problem-difficulty">
          <optgroup label="洛谷难度分级">
            <option value="未标注">未标注</option>
            <option value="暂无评定">暂无评定</option>
            <option value="入门">入门</option>
            <option value="普及-">普及-</option>
            <option value="普及">普及</option>
            <option value="普及+/提高-">普及+/提高-</option>
            <option value="提高">提高</option>
            <option value="提高+/省选-">提高+/省选-</option>
            <option value="省选/NOI-">省选/NOI-</option>
            <option value="NOI/NOI+/CTS">NOI/NOI+/CTS</option>
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
        <label for="prob-${index}-tags">题目标签</label>
        <input id="prob-${index}-tags" type="text" class="form-input problem-tags" maxlength="${LOG_LIMITS.tags * (LOG_LIMITS.tag + 2)}" placeholder="如 DP、图论、二分（可使用逗号或顿号分隔，最多 ${LOG_LIMITS.tags} 个）" list="tag-suggestions-${index}" autocomplete="off" />
        <datalist id="tag-suggestions-${index}">${CANONICAL_TAGS.map((t) => `<option value="${t}">`).join("")}</datalist>
      </div>
      <div class="form-group">
        <label for="prob-${index}-review">错题状态</label>
        <select id="prob-${index}-review" class="form-input problem-review-status">
          <option value="${REVIEW_STATUSES.NONE}">非错题</option>
          <option value="${REVIEW_STATUSES.TODO}">待复习</option>
          <option value="${REVIEW_STATUSES.MASTERED}">已掌握</option>
        </select>
      </div>
      <div class="form-group review-due-group" hidden>
        <label for="prob-${index}-due">复习日期</label>
        <input id="prob-${index}-due" type="date" class="form-input problem-review-due" title="到期后该题会出现在首页「今日复习队列」中" />
      </div>
    </div>
    <div class="form-group">
      <div class="form-label-row">
        <label for="prob-${index}-desc">题目描述（选填，强烈建议使用 AI 概括）</label>
        <button type="button" class="btn-summarize" title="强烈建议用 AI 概括题目描述，减少篇幅">AI 概括</button>
      </div>
      <textarea id="prob-${index}-desc" class="form-input problem-description" rows="2" maxlength="${LOG_LIMITS.description}" placeholder="粘贴题面后点击「AI 概括」，建议只保留题意、目标和关键约束"></textarea>
      <p class="summarize-status" role="status" aria-live="polite"></p>
    </div>
    <div class="form-group">
      <label for="prob-${index}-takeaway">收获 / 题解</label>
      <textarea id="prob-${index}-takeaway" class="form-input problem-takeaway" rows="4" maxlength="${LOG_LIMITS.takeaway}" placeholder="今天学到的内容、踩的坑，或题解..."></textarea>
    </div>
    <div class="form-group">
      <label for="prob-${index}-code">代码（选填，直接粘贴）</label>
      <textarea id="prob-${index}-code" class="form-input problem-code" rows="6" maxlength="${LOG_LIMITS.code}" placeholder="粘贴代码即可，自动高亮显示" spellcheck="false"></textarea>
    </div>
  `;

  // 「待复习」时显示复习日期输入，默认 +3 天
  const reviewSelect = div.querySelector(".problem-review-status");
  const dueGroup = div.querySelector(".review-due-group");
  const dueInput = div.querySelector(".problem-review-due");
  function syncDueVisibility() {
    const isTodo = reviewSelect.value === REVIEW_STATUSES.TODO;
    dueGroup.hidden = !isTodo;
    if (isTodo && !dueInput.value) {
      const due = new Date();
      due.setDate(due.getDate() + 3);
      dueInput.value = toDateString(due);
    }
  }
  reviewSelect.addEventListener("change", syncDueVisibility);
  syncDueVisibility();
  return div;
}

export function resetProblems() {
  const list = document.getElementById("problem-list");
  list.innerHTML = "";
  list.appendChild(createProblemRow(0));
  updateSubmissionSummary();
}

export function addProblem() {
  const list = document.getElementById("problem-list");
  if (list.children.length >= LOG_LIMITS.maxProblems) {
    document.getElementById("submit-msg").textContent = `每个日期最多记录 ${LOG_LIMITS.maxProblems} 道题`;
    return;
  }
  const idx = list.children.length;
  list.appendChild(createProblemRow(idx));
  markFormEdited();
}

export function markFormEdited() {
  activeFormInitialized = true;
  dateLoadSequence += 1;
  debouncedUpdateSummary();
}

export function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function updateSubmissionSummary() {
  const summary = document.getElementById("submission-summary");
  if (!summary) return;
  const problems = captureProblemDrafts();
  const bytes = logInputBytes({ problems });
  summary.textContent = `${problems.length}/${LOG_LIMITS.maxProblems} 题 · 约 ${formatBytes(bytes)} / ${formatBytes(LOG_LIMITS.maxRequestBytes)}`;
  summary.classList.toggle("limit-warning", bytes > LOG_LIMITS.maxRequestBytes || problems.length > LOG_LIMITS.maxProblems);
}

export function setDateFormState(date, exists) {
  const btnSave = document.getElementById("btn-save");
  const btnDelete = document.getElementById("btn-delete");
  btnSave.textContent = exists ? "更新记录" : "提交到 GitHub";
  btnDelete.style.display = exists ? "" : "none";
  btnDelete.onclick = exists ? () => handleDelete(date) : null;
  activeFormExists = exists;
}

export function setDateLoadState(state) {
  activeFormLoadState = state;
  const blocked = state !== "ready";
  document.getElementById("btn-save").disabled = blocked;
  document.getElementById("btn-add-problem").disabled = blocked;
  for (const control of document.querySelectorAll("#problem-list input, #problem-list select, #problem-list textarea, #problem-list button")) {
    control.disabled = blocked;
  }
  document.getElementById("btn-retry-date").hidden = state !== "error";
}

export async function onDateChange() {
  if (!currentUser) {
    const msgEl = document.getElementById("submit-msg");
    if (msgEl) msgEl.textContent = "请先登录 GitHub，再加载或修改已有记录。";
    return;
  }

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
      msgEl.textContent = loaded.updatedAt
        ? `📝 加载已有记录，最后更新于 ${formatUpdateTime(loaded.updatedAt)}，修改后点击「更新记录」即可覆盖`
        : "📝 加载已有记录，修改后点击「更新记录」即可覆盖";
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

export function populateProblems(parsed) {
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
    row.querySelector(".problem-platform").value = p.platform || PLATFORMS.LUOGU;
    row.querySelector(".problem-number").value = p.problemNumber || "";
    row.querySelector(".problem-difficulty").value = p.difficulty || "未标注";
    row.querySelector(".problem-tags").value = Array.isArray(p.tags) ? p.tags.join(", ") : (p.tags || "");
    row.querySelector(".problem-review-status").value = p.reviewStatus || REVIEW_STATUSES.NONE;
    row.querySelector(".problem-review-due").value = p.reviewDue || "";
    row.querySelector(".problem-review-status").dispatchEvent(new Event("change"));
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

export { handleDelete };

// ── 快速导入（Codeforces / AtCoder AC 记录、洛谷题号补全）──

let importPlatform = "codeforces";
let importResults = [];
let importChecked = new Set();

// Codeforces 与 AtCoder（AtCoder Problems 难度，与 CF Rating 同尺度）共用同一套 Rating 区间
function ratingToDifficulty(rating) {
  const r = Number(rating);
  if (!r) return "未标注";
  if (r <= 1199) return "≤1199";
  if (r <= 1399) return "1200-1399";
  if (r <= 1599) return "1400-1599";
  if (r <= 1899) return "1600-1899";
  if (r <= 2199) return "1900-2199";
  return "≥2200";
}

export function openImportPanel(platform) {
  importPlatform = platform;
  importResults = [];
  importChecked = new Set();
  const panel = document.getElementById("import-panel");
  const input = document.getElementById("import-input");
  input.placeholder = platform === "codeforces"
    ? "输入 Codeforces 用户名"
    : platform === "atcoder"
      ? "输入 AtCoder 用户名"
      : "粘贴洛谷题号，空格分隔（如 P1001 P3376）";
  // 预填队员预置的 Codeforces 用户名（可在输入框内修改）；AtCoder 暂无预置
  input.value = platform === "codeforces" && currentUser?.cfHandle ? currentUser.cfHandle : "";
  document.getElementById("import-status").textContent = "";
  document.getElementById("import-list").innerHTML = "";
  document.getElementById("btn-import-add").hidden = true;
  panel.hidden = false;
  input.focus();
  input.select();
}

export function closeImportPanel() {
  document.getElementById("import-panel").hidden = true;
  document.getElementById("import-list").innerHTML = "";
  document.getElementById("btn-import-add").hidden = true;
}

export async function runImport() {
  const input = document.getElementById("import-input");
  const status = document.getElementById("import-status");
  const addBtn = document.getElementById("btn-import-add");
  const value = input.value.trim();
  if (!value) {
    status.textContent = "请先输入内容。";
    return;
  }
  status.textContent = "查询中...";
  try {
    const result = importPlatform === "codeforces"
      ? await importCodeforces(value)
      : importPlatform === "atcoder"
        ? await importAtCoder(value)
        : await importLuogu(value);
    importResults = result.problems || [];
    importChecked = new Set(importResults.map((_, i) => i));
    renderImportList();
    status.textContent = importResults.length
      ? `共找到 ${importResults.length} 题，勾选后点击「添加到表单」。${importPlatform !== "codeforces" ? "（AtCoder 与洛谷不提供标签接口，标签需在表单中手动补充）" : ""}`
      : "没有找到可导入的题目。";
    addBtn.hidden = !importResults.length;
  } catch (err) {
    status.textContent = `导入失败：${err.message}`;
  }
}

function renderImportList() {
  const listEl = document.getElementById("import-list");
  listEl.innerHTML = "";
  importResults.forEach((p, i) => {
    const label = document.createElement("label");
    label.className = "import-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = importChecked.has(i);
    cb.addEventListener("change", () => {
      if (importChecked.has(i)) importChecked.delete(i);
      else importChecked.add(i);
    });
    const span = document.createElement("span");
    const diff = (p.platform === "Codeforces" || p.platform === "AtCoder") && p.rating
      ? ` · ${ratingToDifficulty(p.rating)}`
      : p.platform === "洛谷" && p.difficulty && p.difficulty !== "未标注"
        ? ` · ${p.difficulty}`
        : "";
    const hasDesc = p.description ? " · 含题面" : "";
    span.textContent = `${p.platform} ${p.problemNumber || ""} · ${p.name}${diff}${hasDesc}`;
    // CF 提交页源码公开可看但受反爬保护（无法服务端自动抓取），提供直达链接供复制
    if (p.platform === "Codeforces" && p.submissionUrl) {
      const link = document.createElement("a");
      link.href = p.submissionUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "import-submission-link";
      link.title = "在新标签页打开该 AC 提交（可复制源码）";
      link.textContent = "📄 提交";
      label.append(cb, span, link);
    } else {
      label.append(cb, span);
    }
    listEl.appendChild(label);
  });
}

// 将导入项填入指定题目块（含标签中英合并、洛谷难度/题面回填）
function fillProblemRow(row, p) {
  row.querySelector(".problem-name").value = p.name || "";
  row.querySelector(".problem-platform").value = p.platform || PLATFORMS.OTHER;
  row.querySelector(".problem-number").value = p.problemNumber || "";
  if ((p.platform === "Codeforces" || p.platform === "AtCoder") && p.rating) {
    row.querySelector(".problem-difficulty").value = ratingToDifficulty(p.rating);
  } else if (p.platform === "洛谷" && p.difficulty && p.difficulty !== "未标注") {
    const select = row.querySelector(".problem-difficulty");
    // 洛谷官方难度（如「普及/提高-」）不在预设选项时动态追加，保持准确
    if (![...select.options].some((option) => option.value === p.difficulty)) {
      select.add(new Option(p.difficulty, p.difficulty));
    }
    select.value = p.difficulty;
  }
  if (Array.isArray(p.tags) && p.tags.length) {
    // CF 英文标签经 normalizeTagList 自动合并为中文标签
    row.querySelector(".problem-tags").value = [...new Set(normalizeTagList(p.tags))].join(", ");
  }
  if (p.description) {
    row.querySelector(".problem-description").value = p.description;
  }
}

function appendImportedProblem(p) {
  const list = document.getElementById("problem-list");
  // 优先填补第一个未填写名称的空题目块，而不是盲目追加到末尾
  const emptyBlock = [...list.querySelectorAll(".problem-block")].find(
    (block) => !block.querySelector(".problem-name").value.trim(),
  );
  if (emptyBlock) {
    fillProblemRow(emptyBlock, p);
    markFormEdited();
    return;
  }
  if (list.children.length >= LOG_LIMITS.maxProblems) {
    document.getElementById("submit-msg").textContent = `每个日期最多记录 ${LOG_LIMITS.maxProblems} 道题`;
    return;
  }
  const row = createProblemRow(list.children.length);
  fillProblemRow(row, p);
  list.appendChild(row);
  markFormEdited();
}

export function addImportedToForm() {
  const selected = importResults.filter((_, i) => importChecked.has(i));
  if (!selected.length) return;
  for (const p of selected) appendImportedProblem(p);
  closeImportPanel();
  markFormEdited();
}

export function isModalOpen() {
  return document.getElementById("submit-modal").style.display === "flex";
}

export async function handleSubmit() {
  if (submitting) return;
  submitting = true;

  try {
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
      const msgEl = document.getElementById("submit-msg");
      msgEl.textContent = error.message;
      const firstInput = document.querySelector(".problem-name");
      if (firstInput) {
        firstInput.setAttribute("aria-describedby", "submit-msg");
        firstInput.focus();
      }
      return;
    }

    document.querySelectorAll("[aria-describedby='submit-msg']").forEach(el => el.removeAttribute("aria-describedby"));

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
  } finally {
    submitting = false;
  }
}
