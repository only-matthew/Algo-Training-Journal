import test from "node:test";
import assert from "node:assert/strict";
import { validateLogInput, metaFromProblems, normalizeMeta } from "../lib/log-schema.mjs";
import { analysisBinding, applyAnalysis, validateAnalysisResult } from "../lib/problem-analysis.mjs";

async function analyzedProblem() {
  const problem = { id: "p1", name: "Example", platform: "Codeforces", problemNumber: "4A", description: "Full text", tags: ["DP"] };
  const binding = { requestId: "11111111-1111-4111-8111-111111111111", ...await analysisBinding(problem) };
  const result = { schemaVersion: 1, requestId: binding.requestId, inputFingerprint: binding.inputFingerprint, problem: { platform: "Codeforces", problemNumber: "4A", name: "Example" }, summary: "Summary", tags: ["DP"], difficulty: { scale: "cf-rating", estimate: 1600, low: 1400, high: 1800, confidence: "medium", reason: "Reason" }, analysis: { approach: "Approach", timeComplexity: "O(n)", spaceComplexity: "O(n)", pitfalls: [] }, missingInformation: [] };
  return applyAnalysis(problem, validateAnalysisResult(result, binding), { fields: ["description", "difficultyRating", "tags"] });
}

test("server validates the complete AI result and round-trips an applied summary", async () => {
  const problem = await analyzedProblem();
  const saved = validateLogInput({ schemaVersion: 4, problems: [problem] });
  const restored = normalizeMeta(metaFromProblems(saved.problems));
  assert.deepEqual(restored.problems[0].aiAnalysis, problem.aiAnalysis);
  for (const result of [undefined, [], { arbitrary: "JSON" }, { ...problem.aiAnalysis.result, analysis: { code: "not allowed" } }, { ...problem.aiAnalysis.result, requestId: "mismatched" }]) {
    assert.throws(() => validateLogInput({ problems: [{ ...problem, aiAnalysis: { ...problem.aiAnalysis, result } }] }));
  }
});

test("server rejects malformed attachment and metadata instead of silently dropping them", () => {
  const attachment = { sha256: "a".repeat(64), fileName: "source.pdf", bytes: 100, mimeType: "application/pdf" };
  for (const patch of [
    { statementAttachment: null },
    { statementAttachment: { ...attachment, bytes: "100" } },
    { statementAttachment: { ...attachment, path: "../foreign.pdf" } },
    { statementAttachment: { ...attachment, fileName: "bad\r\nheader.pdf" } },
    { metadataSources: { tags: "DP" } },
    { metadataSources: { difficultyRating: { kind: "official", extra: true } } },
    { statementSource: { kind: "codeforces-html", url: "https://evil.example/4/A" } },
  ]) assert.throws(() => validateLogInput({ problems: [{ id: "p1", name: "Example", ...patch }] }));
});

test("metadata drops stale tag provenance and does not infer new provenance", () => {
  const result = validateLogInput({ problems: [{ id: "p1", name: "Example", tags: ["DP"], metadataSources: { tags: [{ tag: "动态规划", kind: "ai-suggested" }, { tag: "数学", kind: "manual" }] } }] });
  assert.deepEqual(result.problems[0].metadataSources.tags, [{ tag: "DP", kind: "ai-suggested" }]);
  assert.equal(normalizeMeta({ schemaVersion: 3, problems: [{ name: "old" }] }).problems[0].metadataSources, undefined);
});

test("unknown future schemas cannot be normalized or written as v5", () => {
  for (const schemaVersion of [6, "5", null, -1]) {
    assert.throws(() => validateLogInput({ schemaVersion, problems: [{ name: "Example" }] }), { code: "UNSUPPORTED_SCHEMA" });
    assert.throws(() => normalizeMeta({ schemaVersion, problems: [{ name: "Example" }] }), { code: "UNSUPPORTED_SCHEMA" });
  }
});
