import test from "node:test";
import assert from "node:assert/strict";
import { LOG_SCHEMA_VERSION, validateLogInput, metaFromProblems, normalizeMeta } from "../lib/log-schema.mjs";
import { analysisBinding, applyAnalysis, validateAnalysisResult } from "../lib/problem-analysis.mjs";
import { MAX_STATEMENT_IMAGES } from "../lib/statement-images.mjs";

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
    { statementSource: { kind: "luogu-mirror", url: "https://evil.example/problem/CF4A" } },
    { statementSource: { kind: "luogu-mirror", url: "https://www.luogu.com.cn/problem/P1001" } },
  ]) assert.throws(() => validateLogInput({ problems: [{ id: "p1", name: "Example", ...patch }] }));
});

test("洛谷镜像题面来源按 kind 校验地址并可保存", () => {
  const saved = validateLogInput({ schemaVersion: 4, problems: [{ id: "p1", name: "Watermelon", problemNumber: "4A", statementSource: { kind: "luogu-mirror", url: "https://www.luogu.com.cn/problem/CF4A", fetchedAt: "2026-09-16T00:00:00.000Z", parserVersion: "luogu-mirror-v1" } }] });
  assert.deepEqual(saved.problems[0].statementSource, { kind: "luogu-mirror", url: "https://www.luogu.com.cn/problem/CF4A", fetchedAt: "2026-09-16T00:00:00.000Z", parserVersion: "luogu-mirror-v1" });
  assert.deepEqual(normalizeMeta(metaFromProblems(saved.problems)).problems[0].statementSource, saved.problems[0].statementSource);
});

test("归档的题面图片按文件名与内容哈希校验，并可以往返 meta", () => {
  const image = { sha256: "b".repeat(64), fileName: `statement-${"b".repeat(64)}.png`, bytes: 1234, mimeType: "image/png" };
  const saved = validateLogInput({ schemaVersion: LOG_SCHEMA_VERSION, problems: [{ id: "p1", name: "Example", statementImages: [image] }] });
  assert.deepEqual(saved.problems[0].statementImages, [image]);
  assert.deepEqual(normalizeMeta(metaFromProblems(saved.problems)).problems[0].statementImages, [image]);

  // 空数组在请求体里表示「不再引用任何题面图片」，但落盘时不写这个字段。
  const cleared = validateLogInput({ schemaVersion: LOG_SCHEMA_VERSION, problems: [{ id: "p1", name: "Example", statementImages: [] }] });
  assert.deepEqual(cleared.problems[0].statementImages, []);
  assert.equal("statementImages" in metaFromProblems(cleared.problems).problems[0], false);
});

test("server rejects malformed statement image references", () => {
  const image = { sha256: "b".repeat(64), fileName: `statement-${"b".repeat(64)}.png`, bytes: 1234, mimeType: "image/png" };
  for (const patch of [
    { statementImages: [{ ...image, fileName: `statement-${"c".repeat(64)}.png` }] },
    { statementImages: [{ ...image, fileName: "../statement.png" }] },
    { statementImages: [{ ...image, mimeType: "image/svg+xml" }] },
    { statementImages: [{ ...image, bytes: 0 }] },
    { statementImages: [{ ...image, bytes: 2 * 1024 * 1024 }] },
    { statementImages: [{ ...image, sha256: "B".repeat(64) }] },
    { statementImages: [image, image] },
    { statementImages: Array.from({ length: MAX_STATEMENT_IMAGES + 1 }, (_value, index) => ({ ...image, sha256: index.toString(16).padStart(64, "0"), fileName: `statement-${index.toString(16).padStart(64, "0")}.png` })) },
    { statementImages: "not-an-array" },
  ]) assert.throws(() => validateLogInput({ schemaVersion: LOG_SCHEMA_VERSION, problems: [{ id: "p1", name: "Example", ...patch }] }), /题面图片/);
});

test("metadata drops stale tag provenance and does not infer new provenance", () => {
  const result = validateLogInput({ problems: [{ id: "p1", name: "Example", tags: ["DP"], metadataSources: { tags: [{ tag: "动态规划", kind: "ai-suggested" }, { tag: "数学", kind: "manual" }] } }] });
  assert.deepEqual(result.problems[0].metadataSources.tags, [{ tag: "DP", kind: "ai-suggested" }]);
  assert.equal(normalizeMeta({ schemaVersion: 3, problems: [{ name: "old" }] }).problems[0].metadataSources, undefined);
});

test("unknown future schemas cannot be normalized or written as the current version", () => {
  for (const schemaVersion of [LOG_SCHEMA_VERSION + 1, String(LOG_SCHEMA_VERSION), null, -1]) {
    assert.throws(() => validateLogInput({ schemaVersion, problems: [{ name: "Example" }] }), { code: "UNSUPPORTED_SCHEMA" });
    assert.throws(() => normalizeMeta({ schemaVersion, problems: [{ name: "Example" }] }), { code: "UNSUPPORTED_SCHEMA" });
  }
});
