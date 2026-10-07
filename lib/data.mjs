// Data store only: fetches, caches, and exposes journal payloads.
// DOM rendering and route orchestration live in application.mjs.
import { tagStorageKey } from "./tag-index.mjs";
import { applyReviewChanges, reviewRevision } from "./review-overrides.mjs";

export const dataVersion = document.querySelector('meta[name="journal-data-version"]')?.content || "dev";
export let overviewJournal = null;
export let fullJournal = null;
export let roadmapData = null;
export let tagIndex = null;
export let fullJournalPromise = null;
export let overviewPromise = null;
export let manifest = null;
let manifestPromise = null;
const shardCache = new Map();
let cachedReviewRevision = reviewRevision;
let cacheEpoch = 0;
let refreshVersion = null;

export function invalidateJournalCache() {
  cacheEpoch++;
  refreshVersion = `${Date.now()}-${cacheEpoch}`;
  overviewJournal = fullJournal = roadmapData = tagIndex = manifest = null;
  overviewPromise = fullJournalPromise = manifestPromise = null;
  shardCache.clear();
}

function syncReviewRevision() {
  if (cachedReviewRevision === reviewRevision) return;
  cachedReviewRevision = reviewRevision;
  invalidateJournalCache();
}
export let problemDetailSequence = 0;
export let forceProblemDetailRefresh = false;

export function clearForceRefresh() { forceProblemDetailRefresh = false; }
export function requestProblemDetailRefresh() { forceProblemDetailRefresh = true; }
export function nextProblemDetailSequence() { return ++problemDetailSequence; }

export function dataUrl(path, force = false) {
  return `${path}?v=${force ? Date.now() : refreshVersion || dataVersion}`;
}

export async function fetchJson(path, force = false) {
  // 站点数据加载是首页与所有路由的前置：上游挂在半路时必须自己超时并抛错，
  // 而不是让页面永远停在「加载中」（审计 AUDIT-2026-10-02 §3.3）。
  const response = await fetch(dataUrl(path, force), { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`数据加载失败（HTTP ${response.status}）`);
  return applyReviewChanges(await response.json());
}

export async function loadProblemDetail(member, date, problemId, force = false) {
  if (force) invalidateJournalCache();
  const segments = [member, date, problemId].map(encodeURIComponent).join("/");
  return fetchJson(`data/problems/${segments}.json`, force);
}

export async function loadOverview(force = false) {
  if (force) invalidateJournalCache();
  if (overviewPromise) return overviewPromise;
  const promise = fetchJson("data/overview.json").finally(() => { if (overviewPromise === promise) overviewPromise = null; });
  overviewPromise = promise;
  return overviewPromise;
}

export async function ensureOverviewJournal(force = false) {
  syncReviewRevision();
  if (force) invalidateJournalCache();
  if (overviewJournal && !force) return overviewJournal;
  const epoch = cacheEpoch;
  const journal = await loadOverview();
  if (epoch !== cacheEpoch) return ensureOverviewJournal();
  overviewJournal = journal;
  return journal;
}

export async function ensureFullJournal(force = false) {
  syncReviewRevision();
  if (force) invalidateJournalCache();
  if (fullJournal && !force) return fullJournal;
  if (fullJournalPromise) return fullJournalPromise;
  const epoch = cacheEpoch;
  const promise = journalWithShards((index) => index.months)
    .then((journal) => { if (epoch !== cacheEpoch) return ensureFullJournal(); fullJournal = journal; return journal; })
    .finally(() => { if (fullJournalPromise === promise) fullJournalPromise = null; });
  fullJournalPromise = promise;
  return fullJournalPromise;
}

export async function ensureJournalManifest(force = false) {
  syncReviewRevision();
  if (force) invalidateJournalCache();
  if (manifest && !force) return manifest;
  if (manifestPromise) return manifestPromise;
  const epoch = cacheEpoch;
  const promise = fetchJson("data/manifest.json")
    .then((index) => { if (epoch !== cacheEpoch) return ensureJournalManifest(); manifest = index; return index; })
    .finally(() => { if (manifestPromise === promise) manifestPromise = null; });
  manifestPromise = promise;
  return manifestPromise;
}

async function loadShard(entry, force = false) {
  syncReviewRevision();
  if (!entry?.url) return [];
  if (!force && shardCache.has(entry.url)) return shardCache.get(entry.url);
  const promise = fetchJson(entry.url, force).then((payload) => payload.logs || []);
  shardCache.set(entry.url, promise);
  try { return await promise; } catch (error) { if (shardCache.get(entry.url) === promise) shardCache.delete(entry.url); throw error; }
}

async function loadShardList(entries, force = false) {
  const batches = await Promise.all((entries || []).map((entry) => loadShard(entry, force)));
  return batches.flat().sort((a, b) => b.date.localeCompare(a.date) || a.member.localeCompare(b.member, "zh-CN"));
}

async function journalWithShards(selectEntries, force = false) {
  syncReviewRevision();
  if (force) invalidateJournalCache();
  const epoch = cacheEpoch;
  // Statistics are independent of the manifest and shards: start both chains together.
  const [overview, logs] = await Promise.all([
    ensureOverviewJournal(),
    ensureJournalManifest().then((index) => loadShardList(selectEntries(index))),
  ]);
  if (epoch !== cacheEpoch) return journalWithShards(selectEntries);
  return { ...overview, logs };
}

export async function ensureAnalysisJournal(start, end, force = false) {
  const firstMonth = (start || "0000-00").slice(0, 7);
  const lastMonth = (end || "9999-99").slice(0, 7);
  return journalWithShards((index) => index.months.filter((entry) => entry.id >= firstMonth && entry.id <= lastMonth), force);
}

export async function ensureMemberJournal(member, force = false) {
  return journalWithShards((index) => index.members?.[member]?.years || [], force);
}

export async function ensureReviewJournal(force = false) {
  return journalWithShards((index) => [index.review], force);
}

export async function ensureRoadmap(force = false) {
  syncReviewRevision();
  if (force) invalidateJournalCache();
  if (roadmapData && !force) return roadmapData;
  const epoch = cacheEpoch;
  const data = await fetchJson("data/roadmap.json");
  if (epoch !== cacheEpoch) return ensureRoadmap();
  roadmapData = data;
  return data;
}

export async function ensureTagIndex(force = false) {
  syncReviewRevision();
  if (force) invalidateJournalCache();
  if (tagIndex && !force) return tagIndex;
  const epoch = cacheEpoch;
  const data = await fetchJson("data/tag-index.json");
  if (epoch !== cacheEpoch) return ensureTagIndex();
  tagIndex = data;
  return data;
}

export function loadTagDetail(tag, force = false) {
  return fetchJson(`data/tags/${tagStorageKey(tag)}.json`, force);
}

export async function loadRoadmapNode(nodeId, force = false) {
  return fetchJson(`data/roadmap/nodes/${encodeURIComponent(nodeId)}.json`, force);
}
