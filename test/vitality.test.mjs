import test from "node:test";
import assert from "node:assert/strict";
import {
  abilityFromEvidence,
  abilityGain,
  applyForgetting,
  baseVitality,
  computeVitalityTimeline,
  matchFactor,
  optimalRating,
  predictSuccess,
  problemVitality,
  ratingToDifficultyScale,
} from "../lib/vitality.mjs";

// 活力指数 = 「题目难度 + 你的当前水平」折算出的学习增量。
// 三条必须守住的契约：
//   1) 水平提升 → 建议目标难度自动上移（不需要人工改设置）
//   2) 同一道题对不同水平的人价值不同（难度是「题 × 人 × 时间」的属性）
//   3) 太简单和太难都被折减，最优在「踮脚够得着」处

test("水平提升时建议目标难度自动上移", () => {
  const targets = [1, 3, 5, 7, 9, 11].map((theta) => optimalRating(theta));
  for (let i = 1; i < targets.length; i += 1) {
    assert.ok(targets[i] >= targets[i - 1], `θ 提升后目标难度不应下降：${targets}`);
  }
  assert.ok(targets[0] < 1000, `低水平目标应偏低，实际 ${targets[0]}`);
  assert.ok(targets.at(-1) >= 1600, `高水平目标应到提高档，实际 ${targets.at(-1)}`);
});

test("同一道题对不同水平的人价值不同", () => {
  const rating = 1600;
  const weak = problemVitality({ rating, theta: 2 }).vitality;
  const optimal = problemVitality({ rating, theta: 9 }).vitality;
  const ahead = problemVitality({ rating, theta: 13 }).vitality;
  // 基础不足时这道提高题几乎不值钱（做不出来）
  assert.ok(weak < 0.05, `基础不足时该题价值应极低，实际 ${weak}`);
  // 水平正好够得着时最值钱
  assert.ok(optimal > 0.9, `最优匹配处应接近基准，实际 ${optimal}`);
  // 熟练之后同一道题价值回落（练它属于复习，不再是长本事）
  assert.ok(ahead < optimal, `过于熟练后价值应回落：${ahead} vs ${optimal}`);
});

test("低难度题的活力上限低于高难度题", () => {
  const ceiling = (rating) => Math.max(
    ...Array.from({ length: 40 }, (_, i) => problemVitality({ rating, theta: 1 + i * 0.4 }).vitality),
  );
  // 入门级（800）即便对新手最优，上限也明显低于提高档（1600）
  assert.ok(ceiling(800) < ceiling(1600), `入门上限 ${ceiling(800)} 应低于提高上限 ${ceiling(1600)}`);
  assert.ok(ceiling(800) < 0.6, `入门题不该接近满分，实际上限 ${ceiling(800)}`);
});

test("匹配度在 85% 处达峰，两侧都折减", () => {
  const peak = matchFactor(0.85);
  assert.equal(peak, 1);
  assert.ok(matchFactor(0.5) < peak, "太难要折减");
  assert.ok(matchFactor(0.2) < matchFactor(0.5), "太难应比略难折减更多");
  assert.ok(matchFactor(1) < peak, "太简单（成功率 100%）也要折减");
  assert.ok(matchFactor(1) > matchFactor(0.5), "「太简单」的折减应轻于「太难」");
});

test("难度尺度与基准量随 Rating 单调递增", () => {
  assert.ok(ratingToDifficultyScale(2400) > ratingToDifficultyScale(1600));
  assert.ok(baseVitality(2400) > baseVitality(1600));
  assert.ok(baseVitality(1600) > baseVitality(800));
  assert.equal(baseVitality(0), 0);
  // 提高档（1600）是基准 1.0
  assert.equal(baseVitality(1600), 1);
  // 未知 Rating 不产生活力
  assert.equal(problemVitality({ rating: 0, theta: 5 }).vitality, 0);
});

test("没做出来只给少量增量，不等于掌握", () => {
  const done = problemVitality({ rating: 1600, theta: 7, outcome: "independent" }).vitality;
  const unfinished = problemVitality({ rating: 1600, theta: 7, outcome: "unfinished" }).vitality;
  assert.ok(unfinished > 0, "投入时间应有回报");
  assert.ok(unfinished < done * 0.5, `未完成应显著低于完成：${unfinished} vs ${done}`);
});

test("能力饱和增长且带遗忘衰减", () => {
  assert.ok(Math.abs(predictSuccess(abilityFromEvidence(0), 800) - 0.85) < 1e-9, '冷启动先验对应入门难度，不假定零能力');
  assert.ok(abilityFromEvidence(20) > abilityFromEvidence(5));
  // 饱和：继续堆增益只会逼近上限
  assert.ok(Number.isFinite(abilityFromEvidence(100_000)));
  assert.ok(optimalRating(abilityFromEvidence(100_000)) >= 3000, '饱和上限必须覆盖高难度，不能停在 1600 附近');
  assert.equal(applyForgetting(8, 7), 8, "两周内不衰减");
  assert.ok(applyForgetting(8, 200) < 8);
  assert.ok(applyForgetting(8, 100_000) >= 8 * 0.5, "衰减有地板，不归零");
});

test("时间线按记录顺序演进能力，且难度越高长进越多", () => {
  const records = [
    { date: "2026-09-01", difficultyRating: 1000, tags: ["DP"] },
    { date: "2026-09-02", difficultyRating: 1300, tags: ["DP"] },
    { date: "2026-09-03", difficultyRating: 1700, tags: ["DP"] },
  ];
  const timeline = computeVitalityTimeline(records, (a, b) => (a === b ? 0 : 1));
  assert.equal(timeline.length, 3);
  // 能力随记录递增
  assert.ok(timeline[2].theta > timeline[0].theta, "后续记录应基于更高的能力");
  // 每条都算出活力
  assert.ok(timeline.every((entry) => entry.vitality > 0));
  // 高难度题目的能力增益更大
  assert.ok(abilityGain(1000) > abilityGain(800));
  assert.ok(abilityGain(1700) > abilityGain(1000));
  assert.equal(abilityGain(1600), 1.5, "提高档为增益基准");
  assert.equal(abilityGain(0), 0);
});

test("成功率预测随水平上升、随难度下降", () => {
  assert.ok(predictSuccess(8, 1600) > predictSuccess(4, 1600));
  assert.ok(predictSuccess(8, 1600) > predictSuccess(8, 2400));
});
