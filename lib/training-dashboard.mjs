import { currentUser } from "./auth.mjs";
import { trainingApi } from "./training-api.mjs";
import { ensureFullJournal } from "./data.mjs";
import { trainingHistory } from "./training-history.mjs";
import { toUtc8 } from "./constants.mjs";
import { problemSubjectKey } from "./problem-identity.mjs";
import { problemUrl, RECOMMENDATION_REASONS } from "./recommendations.mjs";
import { createTrainingController } from "./training-controller.mjs";

const today = () => toUtc8(new Date().toISOString()).slice(0, 10);
const el = (id) => document.getElementById(id);
const text = (value) => value == null || value === "" ? "—" : String(value);
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const set = (id, value) => { if (el(id)) el(id).textContent = value; };
const hint = (id, message) => { if (el(id)) el(id).innerHTML = `<p class="hint">${esc(message)}</p>`; };
const statuses = { queued: "待开始", started: "进行中", completed: "已完成", deferred: "已延期", removed: "已移除" };
let sequence = 0, owner = null, controller = null, workbench = null;
let recommendations = [], excluded = [], profileDirty = false, loading = false;

function controls() {
  const unavailable = loading || !currentUser || !workbench || controller?.busy || Boolean(controller?.pending);
  for (const selector of ["#training-profile-form", "#training-manual-form", "#training-plan-list", "#training-recommendations"]) {
    document.querySelectorAll?.(`${selector} button, ${selector} input, ${selector} select`).forEach((node) => { node.disabled = unavailable; });
  }
  if (el("training-change")) el("training-change").disabled = unavailable;
  if (el("training-retry")) { el("training-retry").hidden = !controller?.pending; el("training-retry").disabled = loading || controller?.busy; }
  if (el("training-refresh")) el("training-refresh").disabled = loading || controller?.busy;
  if (el("training-date")) el("training-date").disabled = loading || controller?.busy || Boolean(controller?.pending);
}

function resetAccount() {
  const login = currentUser?.login || null;
  if (owner === login && controller) return;
  owner = login; workbench = null; profileDirty = false; excluded = []; recommendations = [];
  let storage;
  try { storage = globalThis.localStorage; } catch { /* storage disabled */ }
  controller = login ? createTrainingController({ api: trainingApi, login, storage }) : null;
  el("training-profile-form")?.reset?.(); el("training-manual-form")?.reset?.();
  if (el("training-focus")) el("training-focus").innerHTML = "";
  if (el("training-date")) el("training-date").value = today();
  set("training-save-status", controller?.pending ? "上次保存尚未确认，请重试确认。原请求已保留。" : "");
}

function heading(item) {
  const problem = item.problem || { name: item.title || item.subjectKey };
  const url = problemUrl(problem);
  return `<strong>${esc(problem.name || item.subjectKey)}</strong>${url ? ` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">原题 ↗</a>` : ""}`;
}

function renderPlan() {
  const items = workbench?.plan?.items || [];
  set("training-plan-count", items.filter((item) => ["queued", "started", "completed"].includes(item.status)).length);
  if (!items.length) { hint("training-plan-list", "这一天还没有计划。选择下方候选或手动加入一道题。"); return; }
  el("training-plan-list").innerHTML = items.map((item) => {
    const active = ["queued", "started"].includes(item.status);
    const button = (action, label) => `<button class="btn btn-outline btn-sm" type="button" data-plan-action="${action}" data-item-id="${esc(item.id)}">${label}</button>`;
    return `<div class="training-row"><div>${heading(item)}<p class="hint">${statuses[item.status] || ""}${item.deferredTo ? ` · 延至 ${esc(item.deferredTo)}` : ""}</p></div><div class="training-actions">${active ? `${item.status === "queued" ? button("start", "开始训练") : ""}${button("remove", "移除")}<input type="date" aria-label="延期日期">${button("defer", "延期")}` : button("reopen", "重新加入")}</div></div>`;
  }).join("");
}

function renderRecommendations(message) {
  if (!recommendations.length) { hint("training-recommendations", message || RECOMMENDATION_REASONS.NO_CANDIDATES); return; }
  el("training-recommendations").innerHTML = recommendations.map((item, index) => `<div class="training-row"><div>${heading(item)}<p class="hint">${esc((item.reasonCodes || []).map((code) => RECOMMENDATION_REASONS[code] || "").filter(Boolean).join("；"))}</p></div><button class="btn btn-outline btn-sm" type="button" data-add-candidate="${index}">加入计划</button></div>`).join("");
}

function renderProfile() {
  if (profileDirty) return;
  const profile = workbench?.profile || {};
  const focus = new Set(profile.focusNodeIds || []);
  if (el("training-focus")) el("training-focus").innerHTML = (workbench?.nodes || []).map((node) => `<option value="${esc(node.id)}"${focus.has(node.id) ? " selected" : ""}>${esc(node.title)}</option>`).join("");
  for (const [id, value] of [["training-budget", profile.dailyBudgetMinutes ?? 60], ["training-limit", profile.dailyItemLimit ?? 3], ["training-goal", profile.goalNote || ""]]) if (el(id)) el(id).value = value;
}

async function load(force = false) {
  const requestSequence = ++sequence;
  resetAccount();
  const login = owner;
  for (const id of ["training-plan-count", "training-review-count", "training-problem-count", "training-last-practiced"]) set(id, "—");
  if (!login) {
    for (const id of ["training-plan-list", "training-review-list", "training-evidence", "training-recommendations"]) hint(id, "请先使用 GitHub 登录，再查看自己的训练数据。");
    loading = false; controls(); return;
  }
  loading = true; controls();
  const date = el("training-date")?.value || today();
  try {
    const [result, journal] = await Promise.all([
      trainingApi.getWorkbench({ date }),
      ensureFullJournal(force).catch(() => null),
    ]);
    if (requestSequence !== sequence || currentUser?.login !== login) return;
    workbench = result;
    if (el("training-date")) el("training-date").value = result.date || date;
    renderPlan(); renderProfile();
    const history = journal ? trainingHistory(journal.logs, currentUser.member, date) : null;
    const evidence = (result.evidence?.attempts || 0) > 0 ? result.evidence : history?.evidence || result.evidence || {};
    set("training-problem-count", text(evidence.distinctProblems)); set("training-last-practiced", text(evidence.lastPracticedOn));
    const reviews = result.dueReviews || [];
    set("training-review-count", reviews.length);
    if (!reviews.length) hint("training-review-list", "今天没有待安排的复习。");
    else el("training-review-list").innerHTML = reviews.map((item) => `<div class="training-row"><div>${heading(item)}${item.href?.startsWith("/problem/") ? ` <a href="${esc(item.href)}">历史记录</a>` : ""}<p class="hint">${esc(item.dueOn || "尚未安排日期")}</p></div></div>`).join("");
    hint("training-evidence", `已发布历史：${history?.records?.length || 0} 条记录、${evidence.distinctProblems ?? 0} 道题。训练过 ${evidence.distinctProblems ?? 0} 道题，记录了 ${evidence.attempts ?? 0} 次新增尝试；${evidence.independentProblems ?? 0} 道有独立完成证据。另有 ${evidence.legacyUnknownRecords ?? 0} 条历史记录的独立完成情况未知。`);
    recommendations = result.recommendations?.items || []; excluded = [];
    renderRecommendations(result.recommendations ? undefined : "推荐加载失败，可先刷新或从学习路线自选题目。");
  } catch (error) {
    if (requestSequence !== sequence || currentUser?.login !== login) return;
    workbench = null;
    for (const id of ["training-plan-list", "training-recommendations", "training-review-list"]) hint(id, error.code === "AUTH_REQUIRED" ? "登录已过期，请重新登录。" : "实时训练数据加载失败，请刷新重试。");
    if (error.code !== "AUTH_REQUIRED") {
      try {
        const journal = await ensureFullJournal(force);
        if (requestSequence !== sequence || currentUser?.login !== login) return;
        const history = trainingHistory(journal.logs, currentUser.member, today());
        set("training-problem-count", text(history.evidence.distinctProblems)); set("training-last-practiced", text(history.evidence.lastPracticedOn));
        hint("training-evidence", `当前显示已发布历史：${history.records.length} 条记录、${history.evidence.distinctProblems} 道题。实时服务恢复后可编辑计划。`);
      } catch { hint("training-evidence", "历史训练数据也暂不可用，请稍后重试。"); }
    } else hint("training-evidence", "请重新登录以查看训练数据。");
  } finally { if (requestSequence === sequence) { loading = false; controls(); } }
}

async function save(operation, onSuccess) {
  if (!currentUser || currentUser.login !== owner) return;
  const login = owner;
  set("training-save-status", "正在保存，请稍候…");
  try {
    const promise = operation(); controls();
    const result = await promise;
    if (currentUser?.login !== login) return;
    onSuccess?.();
    set("training-save-status", "已保存。公开页面将在部署完成后更新，你的计划已立即生效。");
    await load(); return result;
  } catch (error) {
    if (currentUser?.login !== login) return;
    set("training-save-status", controller?.pending ? "保存结果尚未确认。请点击重试确认；不要重复新建，原请求已保留。" : error.code === "VERSION_CONFLICT" ? "内容已在其他页面变化。请先刷新，再重新操作；表单输入已保留。" : `未保存：${error.message}`);
  } finally { controls(); }
}

function addItem(candidate) {
  if (!workbench || !candidate) return;
  const { dueOn, ...item } = candidate;
  const date = workbench.date || el("training-date")?.value || today();
  const items = [...(workbench.plan?.items || []), { ...item, id: crypto.randomUUID(), status: "queued" }];
  return save(() => controller.save("plan", { items }, { date, revision: workbench.resourceVersions?.[`plan:${date}`] ?? null }));
}

export async function initTrainingPage() {
  document.title = "我的训练 · ICPC 算法训练日志";
  if (el("training-refresh")) el("training-refresh").onclick = () => load(true);
  if (el("training-date")) el("training-date").onchange = () => load();
  if (el("training-retry")) el("training-retry").onclick = () => save(() => controller.retry(), () => { profileDirty = false; });
  if (el("training-profile-form")) {
    el("training-profile-form").oninput = () => { profileDirty = true; };
    el("training-profile-form").onsubmit = (event) => {
      event.preventDefault(); if (!workbench || !controller) return;
      const focusNodeIds = Array.from(el("training-focus").selectedOptions).map((option) => option.value);
      if (focusNodeIds.length > 3) { set("training-save-status", "最多选择 3 个专题。"); return; }
      const profile = { dailyBudgetMinutes: Number(el("training-budget").value), dailyItemLimit: Number(el("training-limit").value), focusNodeIds, goalNote: el("training-goal").value };
      for (const field of ["cfHandle", "atcoderHandle"]) if (workbench.profile?.[field] !== undefined) profile[field] = workbench.profile[field];
      return save(() => controller.save("profile", profile, { revision: workbench.resourceVersions?.profile ?? null }), () => { profileDirty = false; });
    };
  }
  if (el("training-manual-form")) el("training-manual-form").onsubmit = async (event) => {
    event.preventDefault();
    const problem = { name: el("training-name").value.trim(), platform: el("training-platform").value, problemNumber: el("training-number").value.trim() };
    const result = await addItem({ problem, subjectKey: problemSubjectKey(problem.platform, problem.problemNumber), kind: "manual", plannedMinutes: 20 });
    if (result) el("training-manual-form").reset();
  };
  if (el("training-recommendations")) el("training-recommendations").onclick = (event) => {
    const button = event.target.closest("[data-add-candidate]");
    if (button) return addItem(recommendations[Number(button.dataset.addCandidate)]);
  };
  if (el("training-plan-list")) el("training-plan-list").onclick = async (event) => {
    const button = event.target.closest("[data-plan-action]");
    if (!button || !workbench || !controller || controller.pending) return;
    const date = workbench.date, action = button.dataset.planAction;
    const body = { date, itemId: button.dataset.itemId, action, preconditions: { [`plan:${date}`]: workbench.resourceVersions[`plan:${date}`] } };
    if (action === "defer") {
      body.targetDate = button.parentElement.querySelector("input[type=date]").value;
      if (!body.targetDate || body.targetDate <= date) { set("training-save-status", "请选择晚于原计划的延期日期。"); return; }
      try { body.preconditions[`plan:${body.targetDate}`] = (await trainingApi.getPlan(body.targetDate)).revision; }
      catch (error) { set("training-save-status", `无法读取目标计划：${error.message}`); return; }
    }
    return save(() => controller.save("action", body));
  };
  if (el("training-change")) el("training-change").onclick = async () => {
    if (!workbench || loading) return;
    const login = owner;
    excluded = [...new Set([...excluded, ...recommendations.map((item) => item.subjectKey)])].slice(-50);
    loading = true; controls();
    try {
      const result = await trainingApi.getRecommendations({ date: workbench.date, exclude: excluded });
      if (currentUser?.login !== login) return;
      recommendations = result.items || []; renderRecommendations();
    } catch (error) { set("training-save-status", `换题失败：${error.message}`); }
    finally { loading = false; controls(); }
  };
  await load();
}
