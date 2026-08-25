import { renderJournal, renderRoadmap } from "./renderer.mjs";
import { currentRoute } from "./router.mjs";

export const dataVersion = document.querySelector('meta[name="journal-data-version"]')?.content || "dev";
export let journalRenderer = null;
export let overviewJournal = null;
export let fullJournal = null;
export let roadmapData = null;
export let fullJournalPromise = null;
export let overviewPromise = null;
export let problemDetailSequence = 0;
export let forceProblemDetailRefresh = false;

export function clearForceRefresh() { forceProblemDetailRefresh = false; }
export function nextProblemDetailSequence() { return ++problemDetailSequence; }

export function dataUrl(path, force = false) {
  return `${path}?v=${force ? Date.now() : dataVersion}`;
}

export async function fetchJson(path, force = false) {
  const response = await fetch(dataUrl(path, force));
  if (!response.ok) throw new Error(`数据加载失败（HTTP ${response.status}）`);
  return response.json();
}

export async function loadProblemDetail(member, date, problemId, force = false) {
  const segments = [member, date, problemId].map(encodeURIComponent).join("/");
  return fetchJson(`data/problems/${segments}.json`, force);
}

export async function ensureOverviewJournal(force = false) {
  if (overviewJournal && !force) return overviewJournal;
  const journal = await loadOverview(force);
  overviewJournal = journal;
  journalRenderer = renderJournal(journal, "overview");
  return journal;
}

export async function ensureFullJournal(force = false) {
  if (fullJournal && !force) return fullJournal;
  if (fullJournalPromise) return fullJournalPromise;
  showFullDataLoading();
  fullJournalPromise = fetchJson("data/all.json", force)
    .then((journal) => {
      fullJournal = journal;
      journalRenderer = renderJournal(journal, "all");
      return journal;
    })
    .catch((error) => {
      showFullDataError(error);
      throw error;
    })
    .finally(() => {
      fullJournalPromise = null;
    });
  return fullJournalPromise;
}

export function showFullDataLoading() {
  const route = currentRoute();
  if (route === "analysis" || route === "report") document.getElementById("analysis-summary").textContent = "正在加载全量训练数据...";
  if (route === "review") document.getElementById("review-summary").textContent = "正在加载全量错题数据...";
  if (route.startsWith("member/")) document.getElementById("member-record-count").textContent = "正在加载该队员的全部训练数据...";
  if (route.startsWith("roadmap")) document.getElementById("roadmap-content").textContent = "正在加载学习路线数据...";
}

export function showFullDataError(error) {
  const message = `加载失败：${error.message}`;
  const route = currentRoute();
  if (route === "analysis" || route === "report") document.getElementById("analysis-summary").textContent = message;
  if (route === "review") document.getElementById("review-summary").textContent = message;
  if (route.startsWith("member/")) document.getElementById("member-record-count").textContent = message;
  if (route.startsWith("roadmap")) document.getElementById("roadmap-content").textContent = message;
}

export async function ensureRoadmap(force = false) {
  if (roadmapData && !force) return roadmapData;
  roadmapData = await fetchJson("data/roadmap.json", force);
  journalRenderer = renderRoadmap(roadmapData);
  return roadmapData;
}

export async function loadRoadmapNode(nodeId, force = false) {
  return fetchJson(`data/roadmap/nodes/${encodeURIComponent(nodeId)}.json`, force);
}

export const REFRESH_INTERVAL = 5 * 60 * 1000;

export async function loadOverview(force = false) {
  if (overviewPromise) {
    return await overviewPromise;
  }
  overviewPromise = fetchJson("data/overview.json", force)
    .finally(() => {
      overviewPromise = null;
    });
  return await overviewPromise;
}

let refreshTimerId = null;

export function startRefreshTimer() {
  function schedule() {
    refreshTimerId = setInterval(async () => {
      await doRefresh();
    }, REFRESH_INTERVAL);
  }
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
  const btnRefresh = document.getElementById("btn-refresh");
  if (btnRefresh) {
    btnRefresh.disabled = true;
    btnRefresh.textContent = "⏳ 刷新中...";
  }

  try {
    const route = currentRoute();
    if (route.startsWith("problem/")) {
      forceProblemDetailRefresh = true;
      await journalRenderer?.renderRoute();
    } else if (route === "analysis" || route === "report" || route === "review" || route.startsWith("member/")) {
      fullJournal = null;
      await ensureFullJournal(true);
    } else if (route === "roadmap" || route.startsWith("roadmap/")) {
      roadmapData = null;
      await ensureRoadmap(true);
      await journalRenderer?.renderRoute();
    } else {
      const overview = await loadOverview(true);
      overviewJournal = overview;
      const member = document.getElementById("member-select").value || "all";
      journalRenderer = renderJournal(overview, "overview");
      journalRenderer.render(member);
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

const SHELL_JOURNAL = { members: [], logs: [], heatmap: { all: {}, byMember: {} }, recent30: { start: "", end: "", byMember: {} } };

export function initShellRenderer() {
  journalRenderer = renderJournal(SHELL_JOURNAL, "shell");
}
