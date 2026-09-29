import assert from "node:assert/strict";
import test from "node:test";
import { trainingCardHtml } from "../lib/ui.mjs";

test("record cards surface other members' same-problem evidence before opening detail", () => {
  const html = trainingCardHtml({ member: "甲", date: "2026-09-29", problemId: "p1", problem: "A", platform: "Codeforces", problemNumber: "123A", teamSameProblemCount: 2 });
  assert.match(html, /队内同题 2/);
  assert.match(html, /#problem-related/);
});
