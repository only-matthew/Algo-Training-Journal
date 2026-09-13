import test from "node:test";
import assert from "node:assert/strict";
import { canonicalProblemKey, isCompleteProblemNumber } from "../lib/problem-identity.mjs";
import { originalProblemUrl } from "../lib/problem-links.mjs";

// 回归背景：早期记录把「场次名」填在题目名称、把「题号字母」填在题号栏，
// 例如 名称='Codeforces Round 1108 (Div. 2)' + 题号='B'。
// 这类残缺题号曾让 9 个不同场次的 A 题、8 个 B 题塌缩成同一个 key，
// 在题目详情页表现为「全队同题记录」里混入完全不同的题。
//
// 另外必须记住：**场次序号 ≠ contestId**。
// Round 1108 的 contestId 是 2246，Round 1114 是 2254 —— 不能拿场次序号当题号。

test("残缺题号绝不生成聚合 key", () => {
  for (const bare of ["A", "B", "C", "C1", "C2", "D"]) {
    assert.equal(canonicalProblemKey("Codeforces", bare), null, `Codeforces 裸题号 ${bare} 不应聚合`);
  }
  assert.equal(isCompleteProblemNumber("Codeforces", "B"), false);
});

test("场次序号与 contestId 是两套编号，不能互相替代", () => {
  // 真实 contestId 才完整
  assert.equal(canonicalProblemKey("Codeforces", "2246B"), "Codeforces|2246B");
  assert.equal(canonicalProblemKey("Codeforces", "2254A"), "Codeforces|2254A");
  // 场次序号（Round 1108 / 1114）本身不是题号
  assert.equal(canonicalProblemKey("Codeforces", "1108B"), "Codeforces|1108B");
  // 两者不相等，聚合时不会混为一谈
  assert.notEqual(canonicalProblemKey("Codeforces", "1108B"), canonicalProblemKey("Codeforces", "2246B"));
});

test("平台标错时题号仍按形态判定，不会误聚合", () => {
  // 洛谷 + Codeforces 式题号：洛谷校验规则不接受，不聚合
  assert.equal(canonicalProblemKey("洛谷", "2254A"), null);
  assert.equal(isCompleteProblemNumber("洛谷", "2254A"), false);
  // 更正平台后才聚合
  assert.equal(canonicalProblemKey("Codeforces", "2254A"), "Codeforces|2254A");
});

test("洛谷题号必须带试卷编号", () => {
  // 洛谷站内题号是「单个字母 + 数字」，如 P1042、B2082、U142356、T792277
  for (const ok of ["P1042", "P1020", "B2082", "U142356", "T792277"]) {
    assert.equal(isCompleteProblemNumber("洛谷", ok), true, `${ok} 应判为完整`);
  }
  // 纯中文题名、裸字母、以及 Codeforces 式题号都不算洛谷题号
  for (const bad of ["乒乓球", "栈", "2254A", "A"]) {
    assert.equal(isCompleteProblemNumber("洛谷", bad), false, `${bad} 应判为残缺`);
  }
});

test("残缺题号的原题链接回退到题名解析（两种残缺形态都覆盖）", () => {
  // 形态一：题名含场次、题号栏只填字母 —— 用场次号配字母
  assert.equal(
    originalProblemUrl("Codeforces", "B", "Codeforces Round 1108 (Div. 2)"),
    "https://codeforces.com/problemset/problem/1108/B",
  );
  // 形态二：题名同时含场次与代号
  assert.equal(
    originalProblemUrl("Codeforces", "", "Codeforces Round 1109 (Div. 3) A"),
    "https://codeforces.com/problemset/problem/1109/A",
  );
  // 题名只有场次、题号栏也空 —— 不猜，留空
  assert.equal(originalProblemUrl("Codeforces", "", "Codeforces Round 1110, Div. 1 + Div. 2"), "");
});
