import { isCodeforcesGymContest } from "../../lib/problem-identity.mjs";
import { archiveStatementImages, parseLuoguProblem, readLuoguProblem } from "./problem-statement.mjs";
import { loadLuoguTagDictionary } from "./atcoder-tags.mjs";
import { BROWSER_HEADERS } from "./http-headers.mjs";
import { LUOGU_ORIGIN, readLimitedBody, requestLuoguPage } from "./luogu-page.mjs";
import { resolveLuoguTagIds } from "../../lib/luogu-tag-map.mjs";
import { MAX_NEW_STATEMENT_IMAGE_BYTES } from "../../lib/statement-images.mjs";

export const IMPORT_TIMEOUT_MS = 10000;
async function importJson(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS) });
    if (!response.ok) throw Object.assign(new Error("题目导入接口不可用，请稍后再试"), { status: 502 });
    return await response.json();
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw Object.assign(new Error("题目导入超时，请稍后再试"), { code: "IMPORT_TIMEOUT", status: 504 });
    }
    throw error;
  }
}

// Codeforces 官方 API：拉取最近 days 天内的 AC 记录，按题目去重（公开接口，无需登录）。
// 自动翻页直到覆盖时间窗口或达到 maxPages 页，避免一次性拉取全部历史记录。
export async function fetchCodeforcesAccepted(handle, { fetchImpl = fetch, days = 3, maxPages = 5, perPage = 100 } = {}) {
  const h = String(handle || "").trim();
  if (!h) throw Object.assign(new TypeError("请输入 Codeforces 用户名"), { status: 400 });
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const seen = new Set();
  const problems = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * perPage + 1;
    const data = await importJson(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(h)}&from=${from}&count=${perPage}`, fetchImpl);
    if (data.status !== "OK") throw Object.assign(new Error(`Codeforces 用户 ${h} 不存在或接口错误`), { status: 400 });
    const result = data.result || [];
    if (!result.length) break;
    for (const submission of result) {
      if (submission.creationTimeSeconds < cutoff) continue;
      if (submission.verdict !== "OK") continue;
      const p = submission.problem;
      if (!p || !p.name) continue;
      const number = [p.contestId, p.index].filter(Boolean).join("");
      const key = `${number}|${p.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push({
        name: p.name,
        platform: "Codeforces",
        problemNumber: number,
        submissionUrl: submission.id && p.contestId ? `https://codeforces.com/${isCodeforcesGymContest(p.contestId) ? "gym" : "contest"}/${p.contestId}/submission/${submission.id}` : "",
        ...(p.rating ? { rating: p.rating } : {}),
        tags: Array.isArray(p.tags) ? p.tags : [],
      });
    }
    // 本页最后一条已早于窗口起点：后续页面只会更旧，无需继续翻页
    const oldest = result[result.length - 1];
    if (result.length < perPage || !oldest || oldest.creationTimeSeconds < cutoff) break;
  }
  // user.status 里的 problem 可能是提交当时的快照：新赛题当时尚未定级，后来
  // Codeforces 已补 rating，这份快照仍可能缺字段。只在确有缺失时查询当前题库。
  const missing = problems.filter((problem) => !Number.isFinite(problem.rating));
  if (missing.length) {
    try {
      {
        const data = await importJson("https://codeforces.com/api/problemset.problems", fetchImpl);
        if (data.status === "OK") {
          const wanted = new Set(missing.map((problem) => problem.problemNumber.toUpperCase()));
          const metadata = new Map();
          for (const problem of data.result?.problems || []) {
            const number = `${problem.contestId || ""}${problem.index || ""}`.toUpperCase();
            if (wanted.has(number)) metadata.set(number, problem);
          }
          for (const problem of missing) {
            const current = metadata.get(problem.problemNumber.toUpperCase());
            if (Number.isFinite(current?.rating)) problem.rating = current.rating;
            if (!problem.tags?.length && Array.isArray(current?.tags)) problem.tags = current.tags;
          }
        }
      }
    } catch {
      // 补查失败不应阻断 AC 记录导入。
    }
  }
  return problems;
}

// 洛谷官方难度分级（洛谷帮助中心《题目难度体系》当前 8 级，减号统一为 ASCII）：
// 0 暂无评定 | 1 入门 | 2 普及- | 3 普及 | 4 普及+/提高- | 5 提高 | 6 提高+/省选- | 7 省选/NOI- | 8 NOI/NOI+/CTS
const LUOGU_DIFFICULTY = { 0: "暂无评定", 1: "入门", 2: "普及-", 3: "普及", 4: "普及+/提高-", 5: "提高", 6: "提高+/省选-", 7: "省选/NOI-", 8: "NOI/NOI+/CTS" };

// 洛谷：抓取题目页解析题名、官方难度、算法标签与题目描述（页面内嵌 lentille-context JSON）。
// 题目页只给数字标签 ID，再通过 /_lfe/tags 字典一次性换成站内标签；洛谷提交记录 API
// 需登录态 + CSRF，故导入采用「粘贴题号 → 补全题名/难度/标签/题面」的半自动方案。
// 题面与「抓取 CF 题面」走同一套解析与图片归档：裸 Markdown 图片语法里的 CDN 链接
// 在站内加载不出来（CSP 只允许 'self' 与 data:），必须随保存归档到仓库。
const LUOGU_IMPORT_TIMEOUT_MS = 12000;
export async function fetchLuoguProblems(numbers, { fetchImpl = fetch, concurrency = 3 } = {}) {
  const list = String(numbers || "")
    .split(/[\s,，、;；]+/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z]?\d+$/.test(s))
    .slice(0, 15);
  if (!list.length) throw Object.assign(new TypeError("请至少输入一个洛谷题号，如 P1001"), { status: 400 });

  const fallback = (number) => ({ name: number, platform: "洛谷", problemNumber: number, difficulty: "未标注", description: "" });
  const results = new Array(list.length);
  // 一次导入最多回传 15 道题，图片是 base64 回传的：给整批设一个总量预算，
  // 超出的题目按「图片未归档」降级（正文保留外链），不会让响应体无限膨胀。
  // 预算就是单题上限本身（审计 §4.1：原来写死 4 MiB，又被下面的 min 压到 2 MiB，
  // 是永远不会生效的死值）。
  let imageBudget = MAX_NEW_STATEMENT_IMAGE_BYTES;
  const tagIdsByIndex = new Map();
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const index = next++;
      const number = list[index].toUpperCase();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LUOGU_IMPORT_TIMEOUT_MS);
      try {
        const url = `${LUOGU_ORIGIN}/problem/${encodeURIComponent(number)}`;
        const { response, error, blocked } = await requestLuoguPage(url, {
          fetchImpl,
          controller,
          headers: { ...BROWSER_HEADERS, "Accept-Language": "zh-CN,zh;q=0.9" },
        });
        if (error) throw error;
        if (blocked || !response?.ok) throw new Error("页面不存在或被风控拦截");
        const html = await readLimitedBody(response, controller.signal);
        const item = fallback(number);
        const problem = readLuoguProblem(html);
        if (problem) {
          if (problem.name) item.name = problem.name;
          if (typeof problem.difficulty === "number") item.difficulty = LUOGU_DIFFICULTY[problem.difficulty] || "未标注";
          try {
            const parsed = parseLuoguProblem(problem, { collectImages: true });
            if (parsed.tagIds.length) tagIdsByIndex.set(index, parsed.tagIds);
            const budget = Math.max(0, imageBudget);
            const archived = await archiveStatementImages(parsed.description, parsed.images, { fetchImpl, maxTotalBytes: budget });
            imageBudget -= archived.images.reduce((sum, image) => sum + image.bytes, 0);
            // 单条导入的正文上限沿用旧口径（15 题一次导入，响应体不能无限膨胀）；
            // 截断后可能剩下半截图片语法，一并清掉。
            item.description = archived.description.slice(0, 20000).replace(/\n?!\[[^\]]*\]?\([^)]*$/, "");
            if (archived.images.length) item.statementImages = archived.images.map(({ fileName, sha256, mimeType, bytes, data }) => ({ fileName, sha256, mimeType, bytes, data }));
          } catch { /* 正文解析失败时保留题名与难度，描述留空由用户手工填写 */ }
        } else {
          // 回退：解析 <title>（如「P1001 A+B Problem - 洛谷 | ...」）
          const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || "").replace(/\s*-\s*洛谷.*$/i, "");
          const name = title.replace(/^[A-Za-z]?\d+\s*/, "").trim();
          if (name) item.name = name;
        }
        results[index] = item;
      } catch {
        results[index] = fallback(number);
      } finally { clearTimeout(timer); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  if (tagIdsByIndex.size) {
    try {
      const dictionary = await loadLuoguTagDictionary({ fetchImpl });
      for (const [index, ids] of tagIdsByIndex) {
        const tags = resolveLuoguTagIds(ids, dictionary);
        if (tags.length) results[index].tags = tags;
      }
    } catch { /* 标签字典不可用时仍返回题名、难度与题面。 */ }
  }
  return results;
}

// AtCoder：通过 AtCoder Problems 非官方公开 API（kenkoooo.com）拉取最近 days 天内的 AC 提交，
// 按题目去重（保留最近一次 AC）；题名与难度来自 resources/merged-problems.json。
// 该 API 不提供题面与标签，故与 Codeforces 一致不返回 description；标签需在表单中手动补充。
const ATCODER_SUBMISSIONS_URL = "https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions";
const ATCODER_PROBLEMS_URL = "https://kenkoooo.com/atcoder/resources/merged-problems.json";

export async function fetchAtCoderAccepted(handle, { fetchImpl = fetch, days = 3, maxPages = 5, perPage = 500 } = {}) {
  const h = String(handle || "").trim();
  if (!h) throw Object.assign(new TypeError("请输入 AtCoder 用户名"), { status: 400 });
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  // problem_id → 最近一次 AC 的提交，用于按题去重（保留最近一次）、排序，并生成提交页链接。
  const byProblem = new Map();
  let fromSecond = cutoff;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await importJson(`${ATCODER_SUBMISSIONS_URL}?user=${encodeURIComponent(h)}&from_second=${fromSecond}`, fetchImpl);
    if (!Array.isArray(result) || !result.length) break;
    for (const submission of result) {
      if (submission.result !== "AC" || !submission.problem_id) continue;
      const epoch = Number(submission.epoch_second);
      if (!Number.isFinite(epoch) || epoch < cutoff) continue;
      const prev = byProblem.get(submission.problem_id);
      if (!prev || epoch > prev.epoch) {
        byProblem.set(submission.problem_id, { problemId: submission.problem_id, epoch, submissionId: submission.id, contestId: submission.contest_id });
      }
    }
    // API 按 epoch_second 升序返回、单页最多 perPage 条；满页时以下一条时间续页
    if (result.length < perPage) break;
    const next = Number(result[result.length - 1].epoch_second);
    if (!Number.isFinite(next) || next <= fromSecond) break;
    fromSecond = next + 1;
  }
  const entries = [...byProblem.values()].sort((a, b) => b.epoch - a.epoch);
  if (!entries.length) return [];
  // 补充题名与难度；题库数据拉取失败时降级为仅返回题号，不影响主流程
  let byId = null;
  try {
    {
      const list = await importJson(ATCODER_PROBLEMS_URL, fetchImpl);
      byId = new Map();
      for (const item of list) if (item && item.id) byId.set(item.id, item);
    }
  } catch {
    byId = null;
  }
  return entries.map(({ problemId, submissionId, contestId }) => {
    const meta = byId ? byId.get(problemId) : null;
    const title = (meta && (meta.title || meta.name)) || "";
    // 提交页是公开的（AtCoder 提交页可直接看源码，不像 CF 受 Cloudflare 保护），
    // 与 CF 导入一样带上直达链接，省得用户自己去翻提交记录。
    const submissionUrl = submissionId && contestId ? `https://atcoder.jp/contests/${encodeURIComponent(contestId)}/submissions/${encodeURIComponent(submissionId)}` : "";
    return {
      name: title || problemId,
      platform: "AtCoder",
      problemNumber: problemId,
      ...(submissionUrl ? { submissionUrl } : {}),
      ...(meta && typeof meta.difficulty === "number" ? { rating: meta.difficulty } : {}),
    };
  });
}
