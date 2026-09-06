import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalProblemKey,
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
});
