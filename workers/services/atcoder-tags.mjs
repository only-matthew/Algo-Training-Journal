// AtCoder 算法标签的抓取。
//
// AtCoder 官方与 kenkoooo（AtCoder Problems）都不提供算法标签，唯一可用的来源是洛谷的
// AtCoder 镜像：
//   - 题目页  https://www.luogu.com.cn/problem/AT_<任务 ID>      → 单题的 tags（数字 id）
//   - 列表页  https://www.luogu.com.cn/problem/list?keyword=<比赛>&type=AT
//                                                                → 整场比赛的题目与 tags
//   - 字典    https://www.luogu.com.cn/_lfe/tags                 → id → 中文标签名
// 字典一次取回后按 isolate 缓存（洛谷很少改标签体系）；列表页让导入按「一场一次请求」
// 补标签，而不是一题一次。标签本身是「锦上添花」：任何一步失败都只是没有标签，绝不影响
// 导入与题面抓取，因此这里的函数一律吞掉异常、返回空结果。
import { resolveLuoguTagIds } from "../../lib/luogu-tag-map.mjs";
import { BROWSER_HEADERS } from "./http-headers.mjs";
import { LUOGU_ORIGIN, readLimitedBody, requestLuoguPage } from "./luogu-page.mjs";

const TAG_DICTIONARY_URL = `${LUOGU_ORIGIN}/_lfe/tags`;
const TAG_DICTIONARY_TTL_MS = 6 * 60 * 60 * 1000;
const LENTILLE_CONTEXT = /<script[^>]*id=["']lentille-context["'][^>]*>([\s\S]*?)<\/script>/i;
const LIST_TIMEOUT_MS = 8000;
// 一次导入最多补几场比赛的标签、同时打几个列表页请求：都在 Worker 子请求预算之内。
const MAX_CONTESTS = 6;
const LIST_CONCURRENCY = 3;

let dictionaryCache = null;

/** 清空 isolate 内的字典缓存（改过标签体系或需要复现首轮加载时用）。 */
export function clearLuoguTagDictionaryCache() { dictionaryCache = null; }

/** 洛谷标签字典（id → {name,type}），按 isolate 缓存 6 小时。 */
export async function loadLuoguTagDictionary({ fetchImpl = fetch, now = Date.now(), force = false } = {}) {
  if (!force && dictionaryCache && now - dictionaryCache.fetchedAt < TAG_DICTIONARY_TTL_MS) return dictionaryCache.byId;
  const response = await fetchImpl(TAG_DICTIONARY_URL, { headers: BROWSER_HEADERS });
  if (!response.ok) throw new Error("洛谷标签字典不可用");
  const body = await response.json();
  const byId = new Map();
  for (const tag of body?.tags || []) {
    if (Number.isInteger(tag?.id) && typeof tag?.name === "string") byId.set(tag.id, { name: tag.name, type: tag.type });
  }
  if (!byId.size) throw new Error("洛谷标签字典为空");
  dictionaryCache = { fetchedAt: now, byId };
  return byId;
}

/**
 * 一场比赛的 `AT_` 题目 → 洛谷标签 id（任务 ID → [id]）。
 *
 * 列表页的 keyword 是模糊匹配（搜 abc381 也会带回 abc093 之类），所以必须按
 * `AT_<比赛>_` 前缀二次过滤，绝不能只信搜索结果的顺序。
 */
export async function fetchLuoguContestTagIds(contest, { fetchImpl = fetch, timeoutMs = LIST_TIMEOUT_MS } = {}) {
  const keyword = String(contest || "").trim();
  if (!keyword) return new Map();
  const url = `${LUOGU_ORIGIN}/problem/list?keyword=${encodeURIComponent(keyword)}&type=AT`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { response, error, blocked } = await requestLuoguPage(url, { fetchImpl, controller, headers: { ...BROWSER_HEADERS, Referer: `${LUOGU_ORIGIN}/problem/list` } });
    if (error || blocked || !response?.ok) return new Map();
    const context = LENTILLE_CONTEXT.exec(await readLimitedBody(response, controller.signal));
    if (!context) return new Map();
    const result = JSON.parse(context[1])?.data?.problems?.result;
    const prefix = `at_${keyword.toLowerCase()}_`;
    const tags = new Map();
    for (const problem of Array.isArray(result) ? result : []) {
      const pid = String(problem?.pid || "");
      if (!pid.toLowerCase().startsWith(prefix)) continue;
      const ids = Array.isArray(problem.tags) ? problem.tags.filter((id) => Number.isInteger(id)) : [];
      // 「AT_abc381_a」→「abc381_a」：与导入列表里的题号口径一致（小写任务 ID）。
      if (ids.length) tags.set(pid.slice(3).toLowerCase(), ids);
    }
    return tags;
  } catch {
    return new Map();
  } finally { clearTimeout(timer); }
}

/** 洛谷原始标签 id → 站内标签。字典取不到就返回空数组：标签不该拖垮题面或导入。 */
export async function resolveAtCoderTagIds(ids, { fetchImpl = fetch, force = false } = {}) {
  if (!Array.isArray(ids) || !ids.length) return [];
  try { return resolveLuoguTagIds(ids, await loadLuoguTagDictionary({ fetchImpl, force })); } catch { return []; }
}

/**
 * 给导入结果逐题补算法标签（原地写入 `problem.tags`）。
 *
 * 按比赛批量取列表页：3 天窗口的 AC 通常只涉及 1–3 场比赛，因此是一次到三次请求，
 * 而不是一题一次。超出 `MAX_CONTESTS` 的比赛、洛谷未收录的题目、被限流的请求都只是
 * 没有标签，导入结果照常返回。
 */
export async function attachAtCoderTags(problems, { fetchImpl = fetch } = {}) {
  const list = Array.isArray(problems) ? problems : [];
  const wanted = list.filter((problem) => problem && typeof problem.problemNumber === "string")
    .map((problem) => ({ problem, key: problem.problemNumber.trim().toLowerCase() }));
  if (!wanted.length) return list;
  const contests = [...new Set(wanted.map(({ key }) => key.replace(/_[^_]*$/, "")))].filter(Boolean).slice(0, MAX_CONTESTS);
  if (!contests.length) return list;

  let dictionary = null;
  const byContest = new Map();
  let next = 0;
  const worker = async () => {
    while (next < contests.length) {
      const contest = contests[next++];
      byContest.set(contest, await fetchLuoguContestTagIds(contest, { fetchImpl }));
    }
  };
  await Promise.all([
    loadLuoguTagDictionary({ fetchImpl }).then((value) => { dictionary = value; }).catch(() => { dictionary = null; }),
    ...Array.from({ length: Math.min(LIST_CONCURRENCY, contests.length) }, worker),
  ]);
  if (!dictionary) return list;

  const tagIdsByProblem = new Map();
  for (const tags of byContest.values()) for (const [key, ids] of tags) tagIdsByProblem.set(key, ids);
  for (const { problem, key } of wanted) {
    const tags = resolveLuoguTagIds(tagIdsByProblem.get(key), dictionary);
    if (tags.length) problem.tags = tags;
  }
  return list;
}
