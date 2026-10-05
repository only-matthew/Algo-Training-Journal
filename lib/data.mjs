// Data store only: fetches, caches, and exposes journal payloads.
// DOM rendering and route orchestration live in application.mjs.
import { tagStorageKey } from "./tag-index.mjs";
import { applyReviewChanges } from "./review-overrides.mjs";

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
export let problemDetailSequence = 0;
export let forceProblemDetailRefresh = false;

export function clearForceRefresh() { forceProblemDetailRefresh = false; }
export function requestProblemDetailRefresh() { forceProblemDetailRefresh = true; }
export function nextProblemDetailSequence() { return ++problemDetailSequence; }

export function dataUrl(path, force = false) {
  return `${path}?v=${force ? Date.now() : dataVersion}`;
}

export async function fetchJson(path, force = false) {
  // 站点数据加载是首页与所有路由的前置：上游挂在半路时必须自己超时并抛错，
  // 而不是让页面永远停在「加载中」（审计 AUDIT-2026-10-02 §3.3）。
  const response = await fetch(dataUrl(path, force), { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`数据加载失败（HTTP ${response.status}）`);
  return applyReviewChanges(await response.json());
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
  fullJournalPromise = journalWithShards((index) => index.months, force)
    .then((journal) => (fullJournal = journal))
    .finally(() => { fullJournalPromise = null; });
  return fullJournalPromise;
}

export async function ensureJournalManifest(force = false) {
  if (manifest && !force) return manifest;
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetchJson("data/manifest.json", force)
    .then((index) => (manifest = index))
    .finally(() => { manifestPromise = null; });
  return manifestPromise;
}

async function loadShard(entry, force = false) {
  if (!entry?.url) return [];
  if (!force && shardCache.has(entry.url)) return shardCache.get(entry.url);
  const promise = fetchJson(entry.url, force).then((payload) => payload.logs || []);
  shardCache.set(entry.url, promise);
  try { return await promise; } catch (error) { shardCache.delete(entry.url); throw error; }
}

async function loadShardList(entries, force = false) {
  const batches = await Promise.all((entries || []).map((entry) => loadShard(entry, force)));
  return batches.flat().sort((a, b) => b.date.localeCompare(a.date) || a.member.localeCompare(b.member, "zh-CN"));
}

async function journalWithShards(selectEntries, force = false) {
  // Statistics are independent of the manifest and shards: start both chains together.
  const [overview, logs] = await Promise.all([
    ensureOverviewJournal(force),
    ensureJournalManifest(force).then((index) => loadShardList(selectEntries(index), force)),
  ]);
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
  if (roadmapData && !force) return roadmapData;
  roadmapData = await fetchJson("data/roadmap.json", force);
  return roadmapData;
}

export async function ensureTagIndex(force = false) {
  if (tagIndex && !force) return tagIndex;
  tagIndex = await fetchJson("data/tag-index.json", force);
  return tagIndex;
}

export function loadTagDetail(tag, force = false) {
  return fetchJson(`data/tags/${tagStorageKey(tag)}.json`, force);
}

export async function loadRoadmapNode(nodeId, force = false) {
  return fetchJson(`data/roadmap/nodes/${encodeURIComponent(nodeId)}.json`, force);
}
