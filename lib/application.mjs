// Application coordinator: composes the data store with view renderers.
// Keeping this layer separate prevents data and view modules from importing each other.
import { currentRoute } from "./router.mjs";
import { renderJournal, renderRoadmap, renderTags } from "./renderer.mjs";
import {
  ensureOverviewJournal,
  ensureFullJournal,
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
    return setRenderer(renderJournal(await ensureFullJournal(force), "all", navigation));
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

export const REFRESH_INTERVAL = 5 * 60 * 1000;
let refreshTimerId = null;

export function startRefreshTimer() {
  const schedule = () => { refreshTimerId = setInterval(doRefresh, REFRESH_INTERVAL); };
  schedule();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(refreshTimerId);
      refreshTimerId = null;
    } else if (!refreshTimerId) {
      doRefresh();
      schedule();
    }
  });
}

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
