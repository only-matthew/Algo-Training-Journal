// Application coordinator: composes the data store with view renderers.
// Keeping this layer separate prevents data and view modules from importing each other.
import { currentRoute } from "./router.mjs";
import { journalScopeForRoute } from "./journal-scope.mjs";
import { renderJournal, renderRoadmap, renderTags } from "./renderer.mjs";
import {
  ensureOverviewJournal,
  ensureFullJournal,
  ensureAnalysisJournal,
  ensureMemberJournal,
  ensureReviewJournal,
  ensureRoadmap,
  ensureTagIndex,
  requestProblemDetailRefresh,
} from "./data.mjs";

export let journalRenderer = null;
const SHELL_JOURNAL = { members: [], logs: [], heatmap: { all: {}, byMember: {} }, recent30: { start: "", end: "", byMember: {} } };
const navigation = {
  overview: () => initOverviewPage(),
  journal: () => initJournalPage(),
  roadmap: () => initRoadmapRenderer(),
  tags: () => initTagRenderer(),
};

function setRenderer(renderer) {
  journalRenderer = renderer;
  return renderer;
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

export async function initOverviewPage(force = false) {
  return setRenderer(renderJournal(await ensureOverviewJournal(force), "overview", navigation));
}

export async function initJournalPage(force = false) {
  showFullDataLoading();
  try {
    const route = currentRoute();
    let journal;
    if (route === "analysis" || route === "report") {
      const query = new URLSearchParams(window.location.search).get("q")?.trim();
      if (query) {
        journal = await ensureFullJournal(force);
      } else {
        const start = document.getElementById("analysis-start")?.value;
        const end = document.getElementById("analysis-end")?.value;
        const now = new Date();
        const fallbackStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const fallbackEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-31`;
        journal = await ensureAnalysisJournal(start || fallbackStart, end || fallbackEnd, force);
      }
    } else if (route === "review") {
      journal = await ensureReviewJournal(force);
    } else if (route.startsWith("member/")) {
      journal = await ensureMemberJournal(decodeURIComponent(route.slice("member/".length)), force);
    } else {
      journal = await ensureFullJournal(force);
    }
    return setRenderer(renderJournal(journal, journalScopeForRoute(route), navigation));
  } catch (error) {
    showFullDataError(error);
    throw error;
  }
}

export function initRoadmapRenderer() {
  return setRenderer(renderRoadmap(ensureRoadmap, navigation));
}

export function initTagRenderer() {
  return setRenderer(renderTags(ensureTagIndex, navigation));
}

export function initShellRenderer() {
  return setRenderer(renderJournal(SHELL_JOURNAL, "shell", navigation));
}

// 刷新只有手动一条路径：点「🔄 刷新」按钮触发。
// 自动定时刷新与 visibilitychange 补刷已移除——后者会在每次切回标签页时
// 强制重新拉取单题 JSON 并重建详情 DOM，造成无意义的闪烁与请求。
export async function doRefresh() {
  const button = document.getElementById("btn-refresh");
  if (button) { button.disabled = true; button.textContent = "⏳ 刷新中..."; }
  try {
    const route = currentRoute();
    if (route.startsWith("problem/")) {
      requestProblemDetailRefresh();
      await journalRenderer?.renderRoute();
    } else if (route === "analysis" || route === "report" || route === "review" || route.startsWith("member/")) {
      await initJournalPage(true);
    } else if (route === "roadmap" || route.startsWith("roadmap/")) {
      await ensureRoadmap(true);
      await journalRenderer?.renderRoute();
    } else if (route === "tags" || route.startsWith("tags/")) {
      await ensureTagIndex(true);
      await journalRenderer?.renderRoute();
    } else {
      const member = document.getElementById("member-select")?.value || "all";
      const renderer = setRenderer(renderJournal(await ensureOverviewJournal(true), "overview", navigation));
      renderer.render(member);
    }
  } catch (error) {
    console.error("刷新失败:", error);
  } finally {
    if (button) { button.disabled = false; button.textContent = "🔄 刷新"; }
  }
}
