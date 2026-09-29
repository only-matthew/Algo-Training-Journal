import assert from "node:assert/strict";
import test from "node:test";
import { buildMDContent, buildSingleLatexDocument } from "../lib/export-content.mjs";
import { problemDetailHtml } from "../lib/problem-detail.mjs";
import { trainingCardHtml } from "../lib/ui.mjs";

const record = { member: "甲", date: "2026-09-29", problem: "题目", platform: "Codeforces", problemNumber: "123A", takeaway: "未填写" };

test("historical placeholder is absent from detail, card, Markdown, and LaTeX exports", () => {
  assert.match(problemDetailHtml(record), /尚未填写个人思考/);
  assert.doesNotMatch(trainingCardHtml(record), /未填写/);
  assert.doesNotMatch(buildMDContent(record), /收获 \/ 题解|未填写/);
  assert.doesNotMatch(buildSingleLatexDocument(record), /\\subsection\{题解\}|未填写/);
  const real = { ...record, takeaway: "我用二分确定边界。" };
  assert.match(problemDetailHtml(real), /我用二分确定边界/);
  assert.match(buildMDContent(real), /我用二分确定边界/);
});
