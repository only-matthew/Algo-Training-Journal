import { initTheme, toggleTheme } from "./lib/theme.mjs";
import { currentRoute, migrateLegacyHashRoute, initPageNavigation } from "./lib/router.mjs";
import { initSession, login, logout } from "./lib/auth.mjs";
import { apiRequest } from "./lib/journal-api.js";
import { journalRenderer, ensureOverviewJournal, ensureFullJournal, initRoadmapRenderer, initShellRenderer, startRefreshTimer, doRefresh } from "./lib/data.mjs";

// 表单模块（~50KB，含 tag-catalog）按需动态导入：日志页首屏与学习路线页都不加载，
// 仅在用户首次打开提交表单/导入面板时才拉取。
let formModulePromise = null;
function withForm() {
  formModulePromise ??= import("./lib/form.mjs");
  return formModulePromise;
}

// ============================================================
// Bootstrap
// ============================================================

(async function bootstrap() {
  // 0. Theme & Navigation
  migrateLegacyHashRoute();
  initTheme();
  initPageNavigation();

  // 0.5 Service Worker：缓存静态资源与数据 JSON，二次访问秒开、离线可用
  if ("serviceWorker" in navigator && window.location.protocol === "https:") {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch((error) => console.warn("Service Worker 注册失败:", error));
  }

  // 1. Auth
  await initSession();

  // 2. Event bindings（表单相关均按需动态导入 form.mjs）
  document.getElementById("btn-theme").addEventListener("click", toggleTheme);
  document.getElementById("btn-login").addEventListener("click", login);
  document.getElementById("btn-logout").addEventListener("click", logout);
  document.getElementById("btn-submit").addEventListener("click", async () => (await withForm()).openModal());
  document.getElementById("btn-close-modal").addEventListener("click", async () => (await withForm()).closeModal());
  document.getElementById("btn-add-problem").addEventListener("click", async () => (await withForm()).addProblem());
  document.getElementById("btn-import-cf").addEventListener("click", async () => (await withForm()).openImportPanel("codeforces"));
  document.getElementById("btn-import-atcoder").addEventListener("click", async () => (await withForm()).openImportPanel("atcoder"));
  document.getElementById("btn-import-luogu").addEventListener("click", async () => (await withForm()).openImportPanel("luogu"));
  document.getElementById("btn-import-run").addEventListener("click", async () => (await withForm()).runImport());
  document.getElementById("btn-import-cancel").addEventListener("click", async () => (await withForm()).closeImportPanel());
  document.getElementById("btn-import-add").addEventListener("click", async () => (await withForm()).addImportedToForm());
  document.getElementById("btn-save").addEventListener("click", async () => (await withForm()).handleSubmit());
  document.getElementById("submit-date").addEventListener("change", async () => (await withForm()).onDateChange());
  document.getElementById("btn-retry-date").addEventListener("click", async () => (await withForm()).onDateChange());
  document.getElementById("problem-list").addEventListener("click", async (e) => {
    if (e.target.classList.contains("btn-remove")) {
      e.target.closest(".problem-block").remove();
      (await withForm()).markFormEdited();
      return;
    }
    // AI summarize button
    const summarizeBtn = e.target.closest(".btn-summarize");
    if (summarizeBtn) {
      e.preventDefault();
      const block = summarizeBtn.closest(".problem-block");
      const desc = block.querySelector(".problem-description");
      const status = block.querySelector(".summarize-status");
      const setStatus = (message, state = "") => {
        status.textContent = message;
        status.dataset.state = state;
      };
      if (!desc.value.trim() || desc.value.trim().length < 20) {
        setStatus("请先输入至少 20 字的题目描述。", "error");
        return;
      }
      if (summarizeBtn.disabled) return;
      summarizeBtn.disabled = true;
      summarizeBtn.textContent = "概括中...";
      setStatus("正在生成简短题意，请稍候。", "loading");
      try {
        const res = await apiRequest("/api/summarize", { method: "POST", body: JSON.stringify({ description: desc.value.trim() }) });
        if (!res.summary) throw new Error("模型没有返回有效内容，请重试");
        desc.value = res.summary;
        setStatus("已生成概括，可继续修改。", "success");
        (await withForm()).markFormEdited();
      } catch (err) {
        setStatus(`概括失败：${err.message}`, "error");
      } finally {
        summarizeBtn.disabled = false;
        summarizeBtn.textContent = "AI 概括";
      }
    }
  });
  document.getElementById("problem-list").addEventListener("input", async () => (await withForm()).markFormEdited());
  document.getElementById("problem-list").addEventListener("change", async () => (await withForm()).markFormEdited());

  // 3. Load journal
  try {
    const route = currentRoute();
    if (route === "analysis" || route === "report" || route === "review" || route.startsWith("member/")) {
      await ensureFullJournal();
    } else if (route === "roadmap" || route.startsWith("roadmap/")) {
      // 学习路线首屏直接使用预渲染 HTML（零 JSON），roadmap.json 在切换成员/刷新时按需拉取
      initRoadmapRenderer();
    } else if (route.startsWith("problem/")) {
      initShellRenderer();
    } else {
      await ensureOverviewJournal();
    }
  } catch {
    document.getElementById("records").textContent = "数据加载失败，请稍后刷新重试。";
    for (const id of ["metric-total", "metric-days", "metric-weekly"]) document.getElementById(id).textContent = "加载失败";
  }

  // 非学习路线页面：空闲时预加载表单模块，避免首次点击"提交/修改记录"时等待动态导入
  const current = currentRoute();
  if (current !== "roadmap" && !current.startsWith("roadmap/")) {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => { withForm(); }, { timeout: 3000 });
    } else {
      setTimeout(() => { withForm(); }, 1500);
    }
  }

  // 4. Setup refresh timer
  if (journalRenderer) startRefreshTimer();

  // 5. Manual refresh
  document.getElementById("btn-refresh").addEventListener("click", async () => {
    await doRefresh();
  });
})();
