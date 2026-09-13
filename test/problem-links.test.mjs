import test from "node:test";
import assert from "node:assert/strict";
import { originalProblemUrl, resolveCodeforcesProblemNumber } from "../lib/problem-links.mjs";

test("完整题号直接生成原题链接", () => {
  assert.equal(originalProblemUrl("Codeforces", "1113B"), "https://codeforces.com/problemset/problem/1113/B");
  assert.equal(originalProblemUrl("Codeforces", "2254c1"), "https://codeforces.com/problemset/problem/2254/C1");
  assert.equal(originalProblemUrl("洛谷", "P1618"), "https://www.luogu.com.cn/problem/P1618");
  assert.equal(originalProblemUrl("AtCoder", "abc381_a"), "https://atcoder.jp/contests/abc381/tasks/abc381_a");
  assert.equal(originalProblemUrl("SPOJ", "ABC-123_x"), "https://vjudge.net/problem/SPOJ-ABC-123_x");
});

// 历史记录的典型形态：名称填了场次、题号栏只填了字母。
// 这类记录此前既无法跳转原题，又会被误判成同一道题。
test("题号残缺时回退到名称解析，历史记录仍可跳转原题", () => {
  assert.equal(
    originalProblemUrl("Codeforces", "A", "Codeforces Round 1113 (Div. 2)"),
    "https://codeforces.com/problemset/problem/1113/A",
  );
  assert.equal(
    originalProblemUrl("Codeforces", "B", "Codeforces Round 1108 (Div. 2)"),
    "https://codeforces.com/problemset/problem/1108/B",
  );
  assert.equal(
    originalProblemUrl("Codeforces", "C1", "Codeforces Round 1114 (Div. 3)"),
    "https://codeforces.com/problemset/problem/1114/C1",
  );
  // 名称含逗号的场次写法（Div. 1 + Div. 2）
  assert.equal(
    originalProblemUrl("Codeforces", "A", "Codeforces Round 1110, Div. 1 + Div. 2"),
    "https://codeforces.com/problemset/problem/1110/A",
  );
  // 名称里同时含场次和代号时以名称为准
  assert.equal(
    originalProblemUrl("Codeforces", "", "Educational Codeforces Round 192 (Rated for Div. 2) B"),
    "https://codeforces.com/problemset/problem/192/B",
  );
  assert.equal(
    originalProblemUrl("Codeforces", "", "Codeforces Round 1109 (Div. 3) A"),
    "https://codeforces.com/problemset/problem/1109/A",
  );
});

test("resolveCodeforcesProblemNumber 覆盖两种残缺形态", () => {
  assert.equal(resolveCodeforcesProblemNumber("A", "Codeforces Round 1113 (Div. 2)"), "1113A");
  assert.equal(resolveCodeforcesProblemNumber("", "Codeforces Round 1109 (Div. 3) B"), "1109B");
  // 已完整的题号原样返回
  assert.equal(resolveCodeforcesProblemNumber("1113b", "任意名称"), "1113B");
  assert.equal(resolveCodeforcesProblemNumber("2254C1", ""), "2254C1");
});

test("名称里没有场次代号时返回空串，不猜链接", () => {
  // 只有场次名 + 题号栏也是空的 —— 无法判断是哪一题，必须留空交给人工补录
  assert.equal(originalProblemUrl("Codeforces", "", "Codeforces Round 1110, Div. 1 + Div. 2"), "");
  assert.equal(originalProblemUrl("Codeforces", "", "B. Gigantomachy"), "");
  assert.equal(originalProblemUrl("Codeforces", "", "Threshold Movement"), "");
  assert.equal(originalProblemUrl("Codeforces", "B", "Some Random Title"), "");
});

test("洛谷题号残缺时从题名补全，补不出则留空", () => {
  assert.equal(originalProblemUrl("洛谷", "", "P1618"), "https://www.luogu.com.cn/problem/P1618");
  assert.equal(originalProblemUrl("洛谷", "", "P1036【子集枚举法】"), "https://www.luogu.com.cn/problem/P1036");
  // 纯中文题名没有题号可提取
  assert.equal(originalProblemUrl("洛谷", "", "乒乓球"), "");
  // 本题题号栏写成了 Codeforces 式题号，不能拼出洛谷链接
  assert.equal(originalProblemUrl("洛谷", "2254A", "A - Riptide"), "");
});

test("平台或题号缺失时安全返回空串", () => {
  assert.equal(originalProblemUrl("", "P1618"), "");
  assert.equal(originalProblemUrl("洛谷", ""), "");
  assert.equal(originalProblemUrl("Codeforces", "B"), "");
  assert.equal(originalProblemUrl(undefined, undefined), "");
});
