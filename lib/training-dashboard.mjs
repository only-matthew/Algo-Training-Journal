import { currentUser } from "./auth.mjs";
import { trainingApi, TrainingApiError } from "./training-api.mjs";
import { ensureFullJournal } from "./data.mjs";
import { trainingHistory } from "./training-history.mjs";
import { toUtc8 } from "./constants.mjs";

const today = () => toUtc8(new Date().toISOString()).slice(0, 10);
let loadSequence = 0;
const text = (value) => value == null || value === "" ? "—" : String(value);

function set(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function renderList(id, items, empty) {
  const node = document.getElementById(id);
  if (!node) return;
  if (!items.length) { node.innerHTML = `<p class="hint">${escapeHtml(empty)}</p>`; return; }
  node.innerHTML = items.map((item) => `<div class="training-row"><strong>${item.href?.startsWith("/problem/") ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.title || item.subjectKey)}</a>` : escapeHtml(item.title || item.subjectKey || "未命名训练项")}</strong><span>${escapeHtml(item.meta || "")}</span></div>`).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function renderError(error) {
  const message = error instanceof TrainingApiError && error.code === "AUTH_REQUIRED" ? "请先使用 GitHub 登录，再查看自己的训练数据。" : `训练数据加载失败：${error.message}`;
  for (const id of ["training-plan-list", "training-review-list", "training-evidence", "training-recommendations"]) {
    const node = document.getElementById(id);
    if (node) node.innerHTML = `<p class="hint">${escapeHtml(message)}</p>`;
  }
}

export async function initTrainingPage() {
  document.title = "我的训练 · ICPC 算法训练日志";
  const refresh = document.getElementById("training-refresh");
  const load = async (force = false) => {
    const sequence = ++loadSequence;
    const user = currentUser;
    for (const id of ["training-plan-count", "training-review-count", "training-problem-count", "training-last-practiced"]) set(id, "—");
    if (!currentUser) {
      if (refresh) refresh.disabled = false;
      renderError(new TrainingApiError("请先登录", { code: "AUTH_REQUIRED" }));
      return;
    }
    refresh && (refresh.disabled = true);
    try {
      const date = today();
      const [workbenchResult, recommendationResult, historyResult] = await Promise.allSettled([
        trainingApi.getWorkbench({ date }),
        trainingApi.getRecommendations({ date }),
        ensureFullJournal(force),
      ]);
      if (sequence !== loadSequence || currentUser?.login !== user.login) return;
      if (workbenchResult.status === "rejected" && workbenchResult.reason.code === "AUTH_REQUIRED") throw workbenchResult.reason;
      const workbench = workbenchResult.status === "fulfilled" ? workbenchResult.value : {};
      const recommendations = recommendationResult.status === "fulfilled" ? recommendationResult.value : {};
      const history = historyResult.status === "fulfilled" ? trainingHistory(historyResult.value.logs, user.member, date) : null;
      const planItems = workbench.plan?.items || [];
      const reviews = workbench.dueReviews || [];
      const hasEvents = (workbench.evidence?.attempts || 0) > 0;
      const evidence = hasEvents ? workbench.evidence : history?.evidence || workbench.evidence || {};
      set("training-plan-count", workbenchResult.status === "fulfilled" ? planItems.length : "暂不可用");
      set("training-review-count", reviews.length + (history?.reviews.length ? ` / 历史 ${history.reviews.length}` : ""));
      set("training-problem-count", text(evidence.distinctProblems));
      set("training-last-practiced", text([workbench.evidence?.lastPracticedOn, history?.evidence.lastPracticedOn].filter(Boolean).sort().at(-1)));
      renderList("training-plan-list", planItems.map((item) => ({ title: item.problem?.title || item.subjectKey, meta: item.status || "待开始" })), workbenchResult.status === "rejected" ? "今日计划加载失败，请刷新重试。" : "尚未创建今日计划。计划编辑入口正在完善，可先浏览学习路线或记录训练。");
      renderList("training-review-list", [...reviews.map((item) => ({ title: item.subjectKey, meta: item.dueOn || "待复习" })), ...(history?.reviews || []).map((item) => ({ ...item, meta: `${item.dueOn} · 历史日志待复习` }))], historyResult.status === "rejected" ? "历史复习记录加载失败，请刷新重试。" : "今天没有到期复习。");
      const historyText = history ? `已发布日志：${history.records.length} 条记录、${history.evidence.distinctProblems} 道题。历史记录的独立完成情况未知，不由“已掌握”标记推断。` : "历史日志加载失败，请刷新重试。";
      document.getElementById("training-evidence").innerHTML = `<p>${escapeHtml(historyText)}</p>${hasEvents ? `<p>新增训练：${text(evidence.distinctProblems)} 道题，${text(evidence.attempts)} 次尝试，其中 ${text(evidence.independentProblems)} 道有独立完成证据。与历史日志分开展示，不重复相加。</p>` : ""}${workbenchResult.status === "rejected" ? '<p class="hint">实时训练数据暂不可用；以上为已发布的历史记录。</p>' : ""}`;
      const recs = recommendations.items || [];
      renderList("training-recommendations", recs, recommendationResult.status === "rejected" ? "推荐加载失败，可先从学习路线自选题目。" : "自动推荐尚未接入。可以先从学习路线自选题目，或打开上方历史待复习记录。");
    } catch (error) {
      renderError(error);
    } finally {
      if (sequence === loadSequence && refresh) refresh.disabled = false;
    }
  };
  if (refresh) refresh.onclick = () => load(true);
  await load();
}
