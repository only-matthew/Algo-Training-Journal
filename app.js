import { initTheme, toggleTheme } from "./lib/theme.mjs";
import { currentRoute, migrateLegacyHashRoute, initPageNavigation } from "./lib/router.mjs";
import { initSession, login, logout } from "./lib/auth.mjs";
import { openModal, closeModal, addProblem, markFormEdited, handleSubmit, onDateChange, openImportPanel, closeImportPanel, runImport, addImportedToForm } from "./lib/form.mjs";
import { apiRequest } from "./lib/journal-api.js";
import { journalRenderer, ensureOverviewJournal, ensureFullJournal, initShellRenderer, startRefreshTimer, doRefresh } from "./lib/data.mjs";

// ============================================================
// Bootstrap
// ============================================================

(async function bootstrap() {
  // 0. Theme & Navigation
  migrateLegacyHashRoute();
  initTheme();
  initPageNavigation();

  // 1. Auth
  await initSession();

  // 2. Event bindings
  document.getElementById("btn-theme").addEventListener("click", toggleTheme);
  document.getElementById("btn-login").addEventListener("click", login);
  document.getElementById("btn-logout").addEventListener("click", logout);
  document.getElementById("btn-submit").addEventListener("click", openModal);
  document.getElementById("btn-close-modal").addEventListener("click", () => closeModal());
  document.getElementById("btn-add-problem").addEventListener("click", addProblem);
  document.getElementById("btn-import-cf").addEventListener("click", () => openImportPanel("codeforces"));
  document.getElementById("btn-import-atcoder").addEventListener("click", () => openImportPanel("atcoder"));
  document.getElementById("btn-import-luogu").addEventListener("click", () => openImportPanel("luogu"));
  document.getElementById("btn-import-run").addEventListener("click", runImport);
  document.getElementById("btn-import-cancel").addEventListener("click", closeImportPanel);
  document.getElementById("btn-import-add").addEventListener("click", addImportedToForm);
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
        markFormEdited();
      } catch (err) {
        setStatus(`概括失败：${err.message}`, "error");
      } finally {
        summarizeBtn.disabled = false;
        summarizeBtn.textContent = "AI 概括";
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
      initShellRenderer();
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
