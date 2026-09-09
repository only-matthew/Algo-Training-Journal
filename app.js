import { initTheme, toggleTheme } from "./lib/theme.mjs";
import { currentRoute, migrateLegacyHashRoute, initPageNavigation } from "./lib/router.mjs";
import { initSession, login, logout, currentUser } from "./lib/auth.mjs";
import { apiRequest } from "./lib/journal-api.js";
import { initDetailInteractions } from "./lib/detail-interactions.mjs";
import { journalRenderer, initOverviewPage, initJournalPage, initRoadmapRenderer, initTagRenderer, initShellRenderer, startRefreshTimer, doRefresh } from "./lib/application.mjs";

// 表单模块（~50KB，含 tag-catalog）按需动态导入：日志页与知识地图页都不加载，
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
  initDetailInteractions();

  document.getElementById("btn-hero-submit").addEventListener("click", async () => {
    if (currentUser) (await withForm()).openModal();
    else login();
  });

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
  document.getElementById("btn-submit").addEventListener("click", async () => currentUser ? (await withForm()).openModal() : login());
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

  document.getElementById("global-search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = document.getElementById("global-search")?.value?.trim() || "";
    window.history.pushState(null, "", value ? `/?q=${encodeURIComponent(value)}` : "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    requestAnimationFrame(() => {
      const search = document.getElementById("search-input");
      if (search) { search.value = value; search.dispatchEvent(new Event("input")); }
    });
  });
  document.querySelectorAll("[data-review-status]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-review-status]").forEach((item) => item.classList.toggle("active", item === button));
    const select = document.getElementById("review-status");
    select.value = button.dataset.reviewStatus;
    select.dispatchEvent(new Event("change"));
  }));
  document.getElementById("tag-search")?.addEventListener("input", (event) => {
    const needle = event.target.value.trim().toLowerCase();
    document.querySelectorAll(".tag-index-card").forEach((card) => { card.hidden = !card.textContent.toLowerCase().includes(needle); });
  });
  document.querySelectorAll("[data-tag-category]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-tag-category]").forEach((item) => item.classList.toggle("active", item === button));
  }));
  document.querySelectorAll("[data-member-view]").forEach((button) => button.addEventListener("click", () => {
    const view = button.dataset.memberView;
    document.querySelectorAll(".content-tabs [data-member-view]").forEach((item) => item.classList.toggle("active", item.dataset.memberView === view));
    document.getElementById("member-dashboard").hidden = view === "records";
    document.getElementById("member-all-records").hidden = view !== "records";
  }));
  document.getElementById("mobile-theme")?.addEventListener("click", toggleTheme);
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-calendar][data-shift]");
    if (!button) return;
    const calendar = document.getElementById(button.dataset.calendar);
    if (calendar) calendar.scrollBy({ left: Number(button.dataset.shift) * 140, behavior: "smooth" });
  });

  // 3. Load journal
  try {
    const route = currentRoute();
    if (route === "analysis" || route === "report" || route === "review" || route.startsWith("member/")) {
      await initJournalPage();
    } else if (route === "roadmap" || route.startsWith("roadmap/")) {
      // 知识地图首屏直接使用预渲染 HTML（零 JSON），需要时再加载 roadmap.json。
      initRoadmapRenderer();
    } else if (route === "tags" || route.startsWith("tags/")) {
      // 标签页首屏直接使用预渲染 HTML（零 JSON），tag-index.json 在 SPA 跳转/刷新时按需拉取
      initTagRenderer();
    } else if (route.startsWith("problem/")) {
      initShellRenderer();
    } else {
      await initOverviewPage();
    }
  } catch {
    document.getElementById("records").textContent = "数据加载失败，请稍后刷新重试。";
    for (const id of ["metric-total", "metric-days", "metric-weekly"]) document.getElementById(id).textContent = "加载失败";
  }

  // 非知识地图页面：空闲时预加载表单模块，避免首次点击"提交/修改记录"时等待动态导入
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
