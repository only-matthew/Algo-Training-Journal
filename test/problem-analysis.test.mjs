import test from "node:test";
import assert from "node:assert/strict";
import { analysisBinding, applyAnalysis, buildAnalysisPrompt, validateAnalysisResult } from "../lib/problem-analysis.mjs";

const problem = { id: "p1", name: "A", platform: "Codeforces", problemNumber: "4a", description: "\r\n题面", tags: ["DP"] };

async function sample() {
  const binding = { requestId: "11111111-1111-4111-8111-111111111111", ...(await analysisBinding(problem)) };
  return { binding, value: { schemaVersion: 1, requestId: binding.requestId, inputFingerprint: binding.inputFingerprint, problem: { platform: "Codeforces", problemNumber: "4A", name: "A" }, summary: "求解。", tags: ["动态规划"], difficulty: { scale: "cf-rating", estimate: 1600, low: 1400, high: 1800, confidence: "low", reason: "实现复杂度" }, analysis: { approach: "DP", timeComplexity: "O(n)", spaceComplexity: "O(n)", pitfalls: [] }, missingInformation: [] } };
}

test("分析绑定固定换行和身份，提示词不静默截断", async () => {
  const { binding } = await sample();
  assert.equal(binding.input.problemNumber, "4A");
  assert.match(buildAnalysisPrompt(binding, { legalTags: ["DP"] }), /requestId/);
});

test("只接受绑定的严格 JSON，支持完整代码围栏", async () => {
  const { binding, value } = await sample();
  const parsed = validateAnalysisResult(`\`\`\`json\n${JSON.stringify(value)}\n\`\`\``, binding);
  assert.deepEqual(parsed.tags, ["DP"]);
  assert.throws(() => validateAnalysisResult({ ...value, extra: true }, binding), /字段/);
  assert.throws(() => validateAnalysisResult({ ...value, requestId: "wrong" }, binding), /不属于/);
});

test("应用结果不覆盖官方难度，标签保持幂等", async () => {
  const { binding, value } = await sample();
  const result = validateAnalysisResult(value, binding);
  const current = { ...problem, tags: ["DP"], metadataSources: { difficultyRating: { kind: "official" } } };
  const next = applyAnalysis(current, result, { fields: ["difficultyRating", "tags"], acceptedAt: "2026-09-15T00:00:00.000Z" });
  assert.equal(next.difficultyRating, undefined);
  assert.deepEqual(next.tags, ["DP"]);
});
