import { currentUser } from "./auth.mjs";
import { trainingApi, TrainingApiError } from "./training-api.mjs";

const today = () => new Date().toISOString().slice(0, 10);
const text = (value) => value == null || value === "" ? "—" : String(value);

function set(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function renderList(id, items, empty) {
  const node = document.getElementById(id);
  if (!node) return;
  if (!items.length) { node.innerHTML = `<p class="hint">${empty}</p>`; return; }
  node.innerHTML = items.map((item) => `<div class="training-row"><strong>${escapeHtml(item.title || item.subjectKey || "未命名训练项")}</strong><span>${escapeHtml(item.meta || "")}</span></div>`).join("");
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
  const refresh = document.getElementById("training-refresh");
  const load = async () => {
    if (!currentUser) { renderError(new TrainingApiError("请先登录", { code: "AUTH_REQUIRED" })); return; }
    refresh && (refresh.disabled = true);
    try {
      const date = today();
      const [workbench, recommendations] = await Promise.all([
        trainingApi.getWorkbench({ date }),
        trainingApi.getRecommendations({ date }),
      ]);
      const planItems = workbench.plan?.items || [];
      const reviews = workbench.dueReviews || [];
      set("training-plan-count", planItems.length);
      set("training-review-count", reviews.length);
      set("training-problem-count", workbench.evidence?.distinctProblems ?? 0);
      set("training-last-practiced", text(workbench.evidence?.lastPracticedOn));
      renderList("training-plan-list", planItems.map((item) => ({ title: item.subjectKey, meta: item.status || "待开始" })), "今天还没有计划，可以从学习路线选择题目。");
      renderList("training-review-list", reviews.map((item) => ({ title: item.subjectKey, meta: item.dueOn || "待复习" })), "今天没有到期复习。");
      const evidence = workbench.evidence || {};
      document.getElementById("training-evidence").innerHTML = `<p>训练过 <strong>${text(evidence.distinctProblems)}</strong> 道不同题目，独立完成 <strong>${text(evidence.independentProblems)}</strong> 道。</p><p class="hint">状态：${escapeHtml(text(evidence.state))}；${escapeHtml((evidence.reasons || []).join("、"))}</p>`;
      const recs = recommendations.items || [];
      renderList("training-recommendations", recs, recommendations.reasonCodes?.[0] || "暂时没有新的推荐。");
    } catch (error) {
      renderError(error);
    } finally {
      refresh && (refresh.disabled = false);
    }
  };
  refresh?.addEventListener("click", load, { once: true });
  await load();
}
