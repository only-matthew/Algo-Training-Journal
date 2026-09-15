import test from "node:test";
import assert from "node:assert/strict";
import { analysisBinding, applyAnalysis, validateAnalysisResult } from "../lib/problem-analysis.mjs";

async function fixture() {
  const problem = { id: "record-a", name: "Example", platform: "Codeforces", problemNumber: "4A", description: "Solve for n.", difficultyRating: 1200, tags: ["DP"], code: "original code", takeaway: "original thoughts", outcome: "unfinished", reviewStatus: "todo" };
  const binding = { requestId: "11111111-1111-4111-8111-111111111111", ...await analysisBinding(problem) };
  const result = { schemaVersion: 1, requestId: binding.requestId, inputFingerprint: binding.inputFingerprint, problem: { platform: "Codeforces", problemNumber: "4A", name: "Example" }, summary: "Summary", tags: ["DP"], difficulty: { scale: "cf-rating", estimate: 1600, low: 1400, high: 1800, confidence: "medium", reason: "Reason" }, analysis: { approach: "Approach", timeComplexity: "O(n)", spaceComplexity: "O(n)", pitfalls: [] }, missingInformation: [] };
  return { problem, binding, result };
}

test("analysis rejects partial/null/string/out-of-range estimates before touching the record", async () => {
  const { problem, binding, result } = await fixture();
  const before = structuredClone(problem);
  for (const patch of [{ estimate: "1600" }, { estimate: 1650 }, { low: 1700 }, { high: 1500 }, { estimate: null }, { low: 700 }, { high: 4100 }, { confidence: "certain" }]) {
    assert.throws(() => validateAnalysisResult({ ...result, difficulty: { ...result.difficulty, ...patch } }, binding));
  }
  assert.deepEqual(problem, before);
});

test("analysis rejects arrays, prose wrappers, nested unknown keys and wrong identity", async () => {
  const { binding, result } = await fixture();
  for (const candidate of [
    JSON.stringify([result]),
    `Here is the result: ${JSON.stringify(result)}`,
    { ...result, schemaVersion: 2 },
    { ...result, inputFingerprint: "a".repeat(64) },
    { ...result, problem: { ...result.problem, problemNumber: "4B" } },
    { ...result, analysis: { ...result.analysis, code: "should not be accepted" } },
    JSON.parse(JSON.stringify(result).replace('"summary":"Summary"', '"summary":"Summary","__proto__":{"polluted":true}')),
  ]) assert.throws(() => validateAnalysisResult(candidate, binding));
  assert.equal({}.polluted, undefined);
});

test("changing PDF bytes, page range or description invalidates analysis binding", async () => {
  const { problem, binding, result } = await fixture();
  const attachment = { sha256: "b".repeat(64), pageRange: { from: 1, to: 2 } };
  for (const replacement of [
    { ...problem, description: "Different problem statement" },
    { ...problem, statementAttachment: attachment },
    { ...problem, problemNumber: "4B" },
  ]) {
    const updated = { requestId: binding.requestId, ...await analysisBinding(replacement) };
    assert.throws(() => validateAnalysisResult(result, updated));
  }
  const first = await analysisBinding({ ...problem, statementAttachment: attachment });
  const second = await analysisBinding({ ...problem, statementAttachment: { ...attachment, pageRange: { from: 3, to: 4 } } });
  assert.notEqual(first.inputFingerprint, second.inputFingerprint);
});

test("missing evidence or null estimates preserve existing difficulty and user training facts", async () => {
  const { problem, binding, result } = await fixture();
  for (const candidate of [
    { ...result, missingInformation: ["Cannot read constraints"] },
    { ...result, difficulty: { ...result.difficulty, estimate: null, low: null, high: null } },
  ]) {
    const next = applyAnalysis(problem, validateAnalysisResult(candidate, binding), { fields: ["difficultyRating", "description"] });
    assert.equal(next.difficultyRating, 1200);
    for (const key of ["code", "takeaway", "outcome", "reviewStatus", "id", "platform", "problemNumber"]) assert.deepEqual(next[key], problem[key]);
    assert.equal(problem.description, "Solve for n.");
  }
});

test("empty field selection does not persist an analysis or change the record", async () => {
  const { problem, binding, result } = await fixture();
  assert.deepEqual(applyAnalysis(problem, validateAnalysisResult(result, binding), { fields: [] }), problem);
  assert.throws(() => applyAnalysis(problem, result, { fields: ["outcome"] }));
});
