import assert from "node:assert/strict";
import test from "node:test";
import { trainingCardHtml } from "../lib/ui.mjs";

test("record cards surface other members' same-problem evidence before opening detail", () => {
  const html = trainingCardHtml({ member: "甲", date: "2026-09-29", problemId: "p1", problem: "A", platform: "Codeforces", problemNumber: "123A", teamSameProblemCount: 2 });
  assert.match(html, /队内同题 2/);
  assert.match(html, /#problem-team/);
  assert.match(trainingCardHtml({ member: "甲", problem: "A", teamSameProblemCount: 3, teamSameProblemMemberCount: 1 }), /队友同题 1 人/);
});

test("redo cards show reflection vitality instead of the duplicate label", () => {
  const html = trainingCardHtml({ member: "甲", date: "2026-10-10", problem: "填涂颜色", outcome: "hinted", hasEarlierAttempt: true, takeaway: "进一步证明了可达性", vitality: 0.08, vitalityStatus: "reflection_gain" });
  assert.match(html, /本次提示后完成 · 重做记录/);
  assert.match(html, /复盘活力 0\.08/);
  assert.doesNotMatch(html, /同题已计/);
});

test("cards prioritize the actual result and reflection, with vitality in secondary metadata", () => {
  const html = trainingCardHtml({ member: "甲", date: "2026-10-08", problemId: "p1", problem: "A", outcome: "independent", hasEarlierAttempt: true, takeaway: "重做后理解边界", description: "题目描述", vitality: 0.2 });
  assert.match(html, /本次独立完成 · 重做记录/);
  assert.match(html, /重做后理解边界/);
  assert.doesNotMatch(html, /题目描述/);
  assert.ok(html.indexOf('class="record-head"') < html.indexOf('class="vitality-badge"'));
  assert.doesNotMatch(trainingCardHtml({ member: "甲", problem: "A", teamSameProblemCount: 1 }), /重做记录/);
});
