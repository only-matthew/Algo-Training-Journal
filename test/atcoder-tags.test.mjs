// 洛谷标签 → 站内标签的映射，以及 AtCoder 标签抓取服务。
import assert from "node:assert/strict";
import test from "node:test";

import { CANONICAL_TAG_SET } from "../lib/tag-catalog.mjs";
import { LUOGU_ALGORITHM_TAG_TYPE, normalizeLuoguTagNames, resolveLuoguTagIds } from "../lib/luogu-tag-map.mjs";
import { attachAtCoderTags, fetchLuoguContestTagIds, loadLuoguTagDictionary, resolveAtCoderTagIds } from "../workers/services/atcoder-tags.mjs";

// 字典形状与真实 /_lfe/tags 一致：id、name、type（2 = 算法标签，其它是省份/年份/来源）。
function dictionaryResponse(entries) {
  return new Response(JSON.stringify({ tags: entries.map(([id, name, type = LUOGU_ALGORITHM_TAG_TYPE]) => ({ id, name, type, parent: null })) }));
}

const DICTIONARY = [
  [1, "模拟"],
  [3, "动态规划 DP"],
  [4, "搜索"],
  [7, "贪心"],
  [42, "线段树"],
  [45, "二分"],
  [127, "深度优先搜索 DFS"],
  [254, "前缀和"],
  [464, "状压 DP"],
  [416, "集合幂级数，子集卷积"],
  [355, "循环结构"],
  [1997, "1997", 1],
];

// 列表页结构照抄真实页面：题目数组挂在 data.problems.result，
// keyword 是模糊匹配（搜 abc381 也会带回 abc093），筛选必须按 pid 前缀。
const listPage = (problems) => `<html><body><script id="lentille-context" type="application/json">${JSON.stringify({ data: { problems: { result: problems } } }).replace(/<\//g, "<\\/")}</script></body></html>`;

test("洛谷标签名映射到站内规范标签，分类名与基础语法标签被丢弃", () => {
  assert.deepEqual(normalizeLuoguTagNames(["线段树", "深度优先搜索 DFS", "状压 DP", "动态规划 DP"]), ["线段树", "DFS", "状压DP", "DP"]);
  assert.deepEqual(normalizeLuoguTagNames(["背包 DP"]), ["背包"]);
  assert.deepEqual(normalizeLuoguTagNames(["最近公共祖先 LCA", "KMP 算法", "哈希 hashing"]), ["LCA", "KMP", "哈希"]);
  // 「线段树分治」在 tag-catalog 里是复合标签，拆成两个规范标签。
  assert.deepEqual(normalizeLuoguTagNames(["线段树分治"]), ["线段树", "分治"]);
  // 一条洛谷标签对应多个站内标签。
  assert.deepEqual(normalizeLuoguTagNames(["集合幂级数，子集卷积"]), ["集合幂级数", "子集卷积"]);
  // 分类与语言入门类标签不是算法标签，必须丢掉。
  assert.deepEqual(normalizeLuoguTagNames(["基础算法", "树形数据结构", "动态规划优化", "循环结构", "语言入门"]), []);
  // 站内还没有的成熟技巧保留原名，不要硬塞到别的知识点上。
  assert.deepEqual(normalizeLuoguTagNames(["莫队", "笛卡尔树", "bitset"]), ["莫队", "笛卡尔树", "bitset"]);
  // 站内规范标签原样保留，并去重、截断。
  assert.deepEqual(normalizeLuoguTagNames(["线段树", "线段树"], { limit: 1 }), ["线段树"]);
  assert.deepEqual(normalizeLuoguTagNames(["字符串", ""]), ["字符串"]);
});

test("标签映射结果要么是规范标签、要么是保留下来的洛谷原名", () => {
  // 「KTT / Kinetic Tournament Tree」这类名字里带斜杠，不能含分隔符（会被后续保存拆开）。
  for (const name of ["KTT / Kinetic Tournament Tree", "Ad-hoc", "模拟费用流"]) {
    const tags = normalizeLuoguTagNames([name]);
    assert.deepEqual(tags, [name]);
    assert.ok(!/[,，、]/.test(tags.join("")));
  }
  assert.ok(CANONICAL_TAG_SET.has(normalizeLuoguTagNames(["最大公约数 gcd"])[0]));
  // 站内单标签上限 30 字符：保留原名的长标签宁可丢掉，也不能截断或原样塞进去。
  assert.deepEqual(normalizeLuoguTagNames(["KTT / Kinetic Tournament Tree"]).map((tag) => tag.length <= 30), [true]);
  assert.deepEqual(normalizeLuoguTagNames(["一".repeat(31), "一".repeat(30)]), ["一".repeat(30)]);
});

test("数字标签通过字典换成站内标签，非算法类标签被忽略", () => {
  const dictionary = new Map(DICTIONARY.map(([id, name, type = LUOGU_ALGORITHM_TAG_TYPE]) => [id, { name, type }]));
  assert.deepEqual(resolveLuoguTagIds([42, 127], dictionary), ["线段树", "DFS"]);
  // 355 是「循环结构」（算法 type，但属于基础语法），1997 是年份来源标签（type=1）。
  assert.deepEqual(resolveLuoguTagIds([355, 1997], dictionary), []);
  assert.deepEqual(resolveLuoguTagIds([999], dictionary), []);
  assert.deepEqual(resolveLuoguTagIds([], dictionary), []);
});

test("标签字典按 isolate 缓存，失败时不写缓存", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return dictionaryResponse([[1, "模拟"]]);
  };
  const first = await loadLuoguTagDictionary({ fetchImpl, force: true, now: 1000 });
  assert.equal(first.get(1).name, "模拟");
  await loadLuoguTagDictionary({ fetchImpl, now: 2000 });
  assert.equal(calls.length, 1, "6 小时内复用缓存");
  const expired = await loadLuoguTagDictionary({ fetchImpl, now: 1000 + 7 * 60 * 60 * 1000 });
  assert.equal(expired.get(1).name, "模拟");
  assert.equal(calls.length, 2, "超过 TTL 重新抓取");

  const failing = async () => new Response("boom", { status: 500 });
  await assert.rejects(loadLuoguTagDictionary({ fetchImpl: failing, force: true }));
});

test("比赛列表页按 pid 前缀过滤，模糊命中的别场比赛不参与", async () => {
  const fetchImpl = async (url) => {
    assert.match(String(url), /problem\/list\?keyword=abc381&type=AT$/);
    return new Response(listPage([
      { pid: "AT_abc381_b", tags: [254, 45, 1997], difficulty: 1 },
      { pid: "AT_abc381_f", tags: [7, 464], difficulty: 5 },
      { pid: "AT_abc381_a", tags: [], difficulty: 1 },
      { pid: "AT_abc093_a", tags: [1], difficulty: 1 },
    ]));
  };
  const tags = await fetchLuoguContestTagIds("abc381", { fetchImpl });
  assert.deepEqual([...tags.keys()].sort(), ["abc381_b", "abc381_f"]);
  assert.deepEqual(tags.get("abc381_b"), [254, 45, 1997]);
});

test("比赛列表页失败（限流/挑战页/结构变了）时返回空表，不影响导入", async () => {
  for (const fetchImpl of [
    async () => new Response("", { status: 429 }),
    async () => new Response("<html><body>没有 lentille-context</body></html>"),
    async () => { throw new Error("network down"); },
  ]) {
    assert.equal((await fetchLuoguContestTagIds("abc381", { fetchImpl })).size, 0);
  }
});

test("attachAtCoderTags 按比赛批量补标签，拿不到就保持原样", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.includes("/_lfe/tags")) return dictionaryResponse(DICTIONARY);
    if (target.includes("keyword=abc381")) return new Response(listPage([{ pid: "AT_abc381_f", tags: [7, 464] }]));
    if (target.includes("keyword=abc340")) return new Response(listPage([{ pid: "AT_abc340_e", tags: [42] }]));
    throw new Error(`unexpected ${target}`);
  };
  const problems = [
    { platform: "AtCoder", problemNumber: "abc381_f", name: "F" },
    { platform: "AtCoder", problemNumber: "abc340_e", name: "E" },
    { platform: "AtCoder", problemNumber: "dp_a", name: "Frog" },
    { platform: "AtCoder", name: "no number" },
  ];
  await attachAtCoderTags(problems, { fetchImpl });
  assert.deepEqual(problems[0].tags, ["贪心", "状压DP"]);
  assert.deepEqual(problems[1].tags, ["线段树"]);
  assert.equal("tags" in problems[2], false, "洛谷没收录（列表页没有 pid）就没有标签");
  assert.equal("tags" in problems[3], false);
  // 一次字典 + 每场比赛一次列表页，而不是一题一次。
  assert.equal(calls.filter((url) => url.includes("/_lfe/tags")).length, 1);
  assert.equal(calls.filter((url) => url.includes("problem/list")).length, 3);
});

test("attachAtCoderTags 在字典不可用时不动数据", async () => {
  const problems = [{ platform: "AtCoder", problemNumber: "abc381_f", name: "F" }];
  await attachAtCoderTags(problems, { fetchImpl: async () => new Response("", { status: 503 }) });
  assert.deepEqual(problems[0], { platform: "AtCoder", problemNumber: "abc381_f", name: "F" });
});

test("resolveAtCoderTagIds 把镜像页带回来的数字标签换成站内标签", async () => {
  const fetchImpl = async () => dictionaryResponse(DICTIONARY);
  assert.deepEqual(await resolveAtCoderTagIds([42, 127, 1997], { fetchImpl, force: true }), ["线段树", "DFS"]);
  assert.deepEqual(await resolveAtCoderTagIds([], { fetchImpl }), []);
  // 字典拉不到（限流 / 结构变了）时只是没有标签：返回空数组，不抛错。
  assert.deepEqual(await resolveAtCoderTagIds([42], { fetchImpl: async () => { throw new Error("down"); }, force: true }), []);
});
