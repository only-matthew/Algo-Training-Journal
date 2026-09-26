// 知识地图徽标配色回归：色阶唯一来源 + WCAG 对比度 + 模板内联断言。
// 背景：洛谷难度徽标曾被 style.css 末尾的兼容规则覆盖成灰底 + var(--text)，
// 深色主题下 data-level=8 实测对比度 1.08:1（黑底黑字）。这些用例守住修复。
import test from "node:test";
import assert from "node:assert/strict";

import {
  LUOGU_DIFFICULTY_PALETTE,
  NODE_DIFFICULTY_PALETTE,
  EVIDENCE_STATE_TONES,
  auditBadgeContrast,
  contrastRatio,
  evidenceStateTone,
  foregroundFor,
  luoguDifficultyLevel,
  luoguDifficultyTone,
  nodeDifficultyTone,
} from "../lib/roadmap-badges.mjs";
import { difficultyBadgeHtml, roadmapProblemCardHtml, roadmapTreeHtml } from "../lib/roadmap.mjs";

test("节点难度分档：1-3 绿、4-6 黄、7-8 橙、9-10 红", () => {
  assert.equal(nodeDifficultyTone(1).background, NODE_DIFFICULTY_PALETTE[1]);
  assert.equal(nodeDifficultyTone(3).background, nodeDifficultyTone(1).background);
  assert.equal(nodeDifficultyTone(4).background, nodeDifficultyTone(6).background);
  assert.equal(nodeDifficultyTone(7).background, nodeDifficultyTone(8).background);
  assert.equal(nodeDifficultyTone(9).background, nodeDifficultyTone(10).background);
  assert.notEqual(nodeDifficultyTone(3).background, nodeDifficultyTone(4).background);
});

test("节点难度越界与非法值都被归一化到 1-10", () => {
  assert.equal(nodeDifficultyTone(0).level, 1);
  assert.equal(nodeDifficultyTone(99).level, 10);
  assert.equal(nodeDifficultyTone("abc").level, 1);
  assert.equal(nodeDifficultyTone(4.4).level, 4);
});

test("洛谷 8 级难度都能查到等级，未知标签返回 null", () => {
  assert.equal(luoguDifficultyLevel("入门"), 1);
  assert.equal(luoguDifficultyLevel("NOI/NOI+/CTS"), 8);
  assert.equal(luoguDifficultyLevel("暂无评定"), 0);
  assert.equal(luoguDifficultyLevel("不存在的难度"), null);
  assert.equal(luoguDifficultyTone("不存在的难度"), null);
});

test("所有徽标底色在两套主题下都满足 4.5:1 对比度", () => {
  assert.deepEqual(auditBadgeContrast(), []);
  for (const [level, background] of Object.entries(LUOGU_DIFFICULTY_PALETTE)) {
    assert.ok(contrastRatio(background, foregroundFor(background).color) >= 4.5, `洛谷等级 ${level} 对比度不足`);
  }
  for (const [level, background] of Object.entries(NODE_DIFFICULTY_PALETTE)) {
    assert.ok(contrastRatio(background, foregroundFor(background).color) >= 4.5, `节点难度 ${level} 对比度不足`);
  }
});

test("NOI 档不再使用会产生黑底黑字的近黑底色", () => {
  const tone = luoguDifficultyTone("NOI/NOI+/CTS");
  assert.notEqual(tone.background.toLowerCase(), "#111827");
  assert.ok(contrastRatio(tone.background, tone.color) >= 4.5);
  // 深色主题的页面底色是 #0b1511，徽标底色必须与它拉开距离，否则整块糊在一起。
  assert.ok(contrastRatio(tone.background, "#0b1511") >= 1.5);
});

test("难度徽标把底色与字色内联，样式表覆盖不会再打回 var(--text)", () => {
  const html = difficultyBadgeHtml(4);
  assert.match(html, /data-difficulty="4"/);
  assert.match(html, /background:#eab308/);
  assert.match(html, /color:#10231c/);
  assert.doesNotMatch(html, /color:var\(--text\)/);
});

test("洛谷难度徽标带 data-level 与内联配色，未知难度退化为纯文本徽标", () => {
  const known = roadmapProblemCardHtml({ platform: "洛谷", number: "P1001", name: "A+B", difficulty: "NOI/NOI+/CTS" });
  assert.match(known, /class="roadmap-luogu-difficulty" data-level="8"/);
  assert.match(known, /background:#475569/);
  const unknown = roadmapProblemCardHtml({ platform: "洛谷", number: "P1002", name: "x", difficulty: "自定义难度" });
  assert.match(unknown, /class="roadmap-luogu-difficulty">自定义难度</);
  assert.doesNotMatch(unknown, /data-level=""/);
});

test("训练证据徽标只下发状态色变量，未知状态不写变量", () => {
  const node = { title: "贪心", difficulty: 4, trainingEvidence: { totalRecords: 3, relatedRecords: 1, state: "较熟练", confidence: "中" } };
  const html = roadmapTreeHtml({ phases: [{ id: "phase-0", title: "算法1", stats: { done: 1, totalProblems: 2, pct: 50 }, nodes: [node] }] }, "all");
  assert.match(html, /data-state="较熟练"/);
  // 断言与色板同源：改色板不该让测试失败，改「不再下发变量」才该失败
  const tone = evidenceStateTone("较熟练");
  assert.ok(html.includes(`--evidence-light:${tone.light}`), "徽标必须下发浅色主题状态色");
  assert.ok(html.includes(`--evidence-dark:${tone.dark}`), "徽标必须下发深色主题状态色");

  const unknown = roadmapTreeHtml(
    { phases: [{ id: "phase-0", title: "算法1", stats: { done: 0, totalProblems: 1, pct: 0 }, nodes: [{ title: "新状态", difficulty: 1, trainingEvidence: { totalRecords: 1, state: "待观察" } }] }] },
    "all",
  );
  assert.match(unknown, /data-state="待观察"/);
  assert.doesNotMatch(unknown, /--evidence-light/);
});

test("五个掌握度状态都有配色，且在徽标的实际混色底上可读", () => {
  // 徽标底色不是纯白/纯黑，而是「状态色 14%（深色 20%）混页面底色」，
  // 因此按混合后的真实底色校验，而不是按纯白/纯黑校验。
  const mix = (fg, bg, weight) => ({
    r: fg.r * weight + bg.r * (1 - weight),
    g: fg.g * weight + bg.g * (1 - weight),
    b: fg.b * weight + bg.b * (1 - weight),
  });
  const rgb = (hex) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  });
  // 直接比较亮度比，避免引入 0–255 与 0–1 的换算歧义
  const toHex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  for (const state of ["建议复习", "较熟练", "有基础", "已接触", "未接触"]) {
    const tone = evidenceStateTone(state);
    assert.ok(tone, `${state} 缺少配色`);
    const lightBadgeBg = toHex(mix(rgb(tone.light), rgb("#ffffff"), 0.14));
    const darkBadgeBg = toHex(mix(rgb(tone.dark), rgb("#101d18"), 0.2));
    assert.ok(
      contrastRatio(tone.light, lightBadgeBg) >= 4.5,
      `${state} 浅色主题在混色底 ${lightBadgeBg} 上对比度不足：${contrastRatio(tone.light, lightBadgeBg).toFixed(2)}`,
    );
    assert.ok(
      contrastRatio(tone.dark, darkBadgeBg) >= 4.5,
      `${state} 深色主题在混色底 ${darkBadgeBg} 上对比度不足：${contrastRatio(tone.dark, darkBadgeBg).toFixed(2)}`,
    );
  }
  assert.equal(evidenceStateTone("未知状态"), null);
});
