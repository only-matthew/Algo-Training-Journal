import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalProblemKey,
  isCompleteProblemNumber,
  normalizePlatform,
  normalizeProblemNumber,
  problemSubjectKey,
  recordSubjectKey,
  subjectKeyForProblem,
} from "../lib/problem-identity.mjs";

test("platform aliases and problem numbers normalize to the shared identity", () => {
  assert.equal(normalizePlatform(" CodeForces "), "Codeforces");
  assert.equal(normalizePlatform("未知平台"), "未知平台");
  assert.equal(normalizePlatform(undefined), "");
  assert.equal(normalizeProblemNumber(" agc012_e "), "AGC012_E");
  assert.equal(normalizeProblemNumber(" 123 a "), "123A");
  assert.equal(canonicalProblemKey("CodeForces", " 123 a "), "Codeforces|123A");
  assert.equal(canonicalProblemKey("AtCoder", "agc012_e"), "AtCoder|AGC012_E");
  assert.equal(canonicalProblemKey("洛谷", " p1001 "), "洛谷|P1001");
});

test("canonical problem keys preserve separators and reject incomplete identities", () => {
  assert.equal(canonicalProblemKey("SPOJ", "ABC-123_x"), "SPOJ|ABC-123_X");
  assert.equal(canonicalProblemKey("", "P1001"), null);
  assert.equal(canonicalProblemKey("洛谷", ""), null);
  assert.equal(canonicalProblemKey(undefined, undefined), null);
});

// 残缺题号会把不同场次的不同题目塌缩成同一个 key（如 Codeforces 只填 "B"），
// 因此结构不完整的题号一律不参与聚合。
test("残缺题号不生成 key，避免不同场次被误判为同一道题", () => {
  assert.equal(canonicalProblemKey("Codeforces", "B"), null);
  assert.equal(canonicalProblemKey("Codeforces", "A"), null);
  assert.equal(canonicalProblemKey("Codeforces", "C1"), null);
  assert.equal(canonicalProblemKey("Codeforces", "1113B"), "Codeforces|1113B");
  assert.equal(canonicalProblemKey("Codeforces", "2254C1"), "Codeforces|2254C1");
  // 洛谷题号必须有试卷编号；纯中文题名或 CF 式题号都不算完整
  assert.equal(canonicalProblemKey("洛谷", "乒乓球"), null);
  assert.equal(canonicalProblemKey("洛谷", "2254A"), null);
  assert.equal(canonicalProblemKey("洛谷", "P1618"), "洛谷|P1618");
  // AtCoder 题号即 task id，缺少 "比赛_题目" 结构时不聚合
  assert.equal(canonicalProblemKey("AtCoder", "a"), null);
  assert.equal(canonicalProblemKey("AtCoder", "abc381_a"), "AtCoder|ABC381_A");
  // 未列入校验表的平台题号本身就是完整标识，只要求非空
  assert.equal(canonicalProblemKey("UVA", "100"), "UVA|100");
  assert.equal(canonicalProblemKey("POJ", "1000"), "POJ|1000");
});

test("isCompleteProblemNumber 与 canonicalProblemKey 判定一致", () => {
  assert.equal(isCompleteProblemNumber("Codeforces", "1113B"), true);
  assert.equal(isCompleteProblemNumber("Codeforces", "B"), false);
  assert.equal(isCompleteProblemNumber("Codeforces", ""), false);
  assert.equal(isCompleteProblemNumber("", "1113B"), false);
  assert.equal(isCompleteProblemNumber("HDU", "1000"), true);
});

test("subject key helpers select known problem identities and otherwise retain record scope", () => {
  assert.equal(problemSubjectKey("Codeforces", "4a"), "problem:Codeforces|4A");
  assert.equal(recordSubjectKey("member-1", "2026-09-06", "record-1"), "record:member-1:2026-09-06:record-1");
  assert.equal(recordSubjectKey("member-1", "", "record-1"), null);
  assert.equal(subjectKeyForProblem({
    memberId: "member-1", date: "2026-09-06", recordId: "record-1", platform: "洛谷", problemNumber: "P1001",
  }), "problem:洛谷|P1001");
  assert.equal(subjectKeyForProblem({
    memberId: "member-1", date: "2026-09-06", recordId: "record-1", platform: "洛谷", problemNumber: "",
  }), "record:member-1:2026-09-06:record-1");
  // 残缺题号回退到记录级身份，不会与别处的同字母题合并
  assert.equal(subjectKeyForProblem({
    memberId: "member-1", date: "2026-09-06", recordId: "record-1", platform: "Codeforces", problemNumber: "B",
  }), "record:member-1:2026-09-06:record-1");
});
