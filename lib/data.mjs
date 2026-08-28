// Data store only: fetches, caches, and exposes journal payloads.
// DOM rendering and route orchestration live in application.mjs.
export const dataVersion = document.querySelector('meta[name="journal-data-version"]')?.content || "dev";
export let overviewJournal = null;
export let fullJournal = null;
export let roadmapData = null;
export let tagIndex = null;
export let fullJournalPromise = null;
export let overviewPromise = null;
export let problemDetailSequence = 0;
export let forceProblemDetailRefresh = false;

export function clearForceRefresh() { forceProblemDetailRefresh = false; }
export function requestProblemDetailRefresh() { forceProblemDetailRefresh = true; }
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

export async function loadOverview(force = false) {
  if (overviewPromise) return overviewPromise;
  overviewPromise = fetchJson("data/overview.json", force).finally(() => { overviewPromise = null; });
  return overviewPromise;
}

export async function ensureOverviewJournal(force = false) {
  if (overviewJournal && !force) return overviewJournal;
  overviewJournal = await loadOverview(force);
  return overviewJournal;
}

export async function ensureFullJournal(force = false) {
  if (fullJournal && !force) return fullJournal;
  if (fullJournalPromise) return fullJournalPromise;
  fullJournalPromise = fetchJson("data/all.json", force)
    .then((journal) => {
      fullJournal = journal;
      return journal;
    })
    .finally(() => { fullJournalPromise = null; });
  return fullJournalPromise;
}

export async function ensureRoadmap(force = false) {
  if (roadmapData && !force) return roadmapData;
  roadmapData = await fetchJson("data/roadmap.json", force);
  return roadmapData;
}

export async function ensureTagIndex(force = false) {
  if (tagIndex && !force) return tagIndex;
  tagIndex = await fetchJson("data/tag-index.json", force);
  return tagIndex;
}

export async function loadRoadmapNode(nodeId, force = false) {
  return fetchJson(`data/roadmap/nodes/${encodeURIComponent(nodeId)}.json`, force);
}
