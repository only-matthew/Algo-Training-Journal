import test from "node:test";
import assert from "node:assert/strict";
import {
  DIFFICULTY_LABEL_RATING,
  RATING_BAND_VALUES,
  STANDARD_RATINGS,
  parseRatingLabel,
  ratingLabel,
  ratingOptions,
  ratingTier,
  ratingTone,
  resolveDifficultyRating,
} from "../lib/rating.mjs";

// 背景：难度原本是混杂的多套标签（CF 档位字符串、洛谷 8 级、AtCoder 数值难度、
// 校内自建平台的「未标注」）。队员反映 CF Rating 更直观，因此全站只展示一个口径。
// 这个模块是唯一的换算与展示入口，洛谷/AtCoder/校内平台都必须能落到 Rating。

test("非 Codeforces 平台也能落到 Rating", () => {
  // AtCoder Problems 直接提供与 CF 同尺度的数值难度，原样使用
  assert.equal(resolveDifficultyRating({ rating: 1450 }), 1450);
  // 洛谷官方 8 级难度按等值 CF Rating 换算
  assert.equal(resolveDifficultyRating({ difficulty: "入门" }), 800);
  assert.equal(resolveDifficultyRating({ difficulty: "普及-" }), 1000);
  assert.equal(resolveDifficultyRating({ difficulty: "普及" }), 1300);
  assert.equal(resolveDifficultyRating({ difficulty: "提高" }), 1700);
  assert.equal(resolveDifficultyRating({ difficulty: "NOI/NOI+/CTS" }), 2900);
  // 校内自建平台若已给出星级展示值，也要能反解
  assert.equal(resolveDifficultyRating({ difficulty: "★ 1000" }), 1000);
});

test("数值 Rating 优先于难度标签", () => {
  assert.equal(resolveDifficultyRating({ rating: 1600, difficulty: "普及" }), 1600);
  assert.equal(resolveDifficultyRating({ difficultyRating: 2000, rating: 1600, difficulty: "普及" }), 2000);
});

test("历史脏值与旧档位也能归位，不确定时返回 0", () => {
  assert.equal(resolveDifficultyRating({ difficulty: "普及/提高-" }), 1500);
  assert.equal(resolveDifficultyRating({ difficulty: "普及+/提高" }), 1500);
  assert.equal(resolveDifficultyRating({ difficulty: "≤1199" }), 1000);
  assert.equal(resolveDifficultyRating({ difficulty: "1600-1899" }), 1700);
  // 无法确定时返回 0（由调用方回退到原标签或「未标注」）
  assert.equal(resolveDifficultyRating({}), 0);
  assert.equal(resolveDifficultyRating({ difficulty: "未标注" }), 0);
  assert.equal(resolveDifficultyRating({ rating: 0 }), 0);
  assert.equal(resolveDifficultyRating({ rating: -5 }), 0);
});

test("展示形式统一为「★ 数值」", () => {
  assert.equal(ratingLabel(1200), "★ 1200");
  assert.equal(ratingLabel(0), "未标注");
  assert.equal(ratingLabel(undefined, "普及"), "普及");
  assert.equal(parseRatingLabel("★ 1200"), 1200);
  assert.equal(parseRatingLabel("未标注"), 0);
});

test("档位配色与筛选选项按数值升序", () => {
  assert.equal(ratingTone(800), "entry");
  assert.equal(ratingTone(1000), "basic");
  assert.equal(ratingTone(1300), "easy");
  assert.equal(ratingTone(1700), "hard");
  assert.equal(ratingTone(2400), "expert");
  assert.equal(ratingTier(0).tier, "medium");
  assert.deepEqual(ratingOptions([1300, 800, 1300, 0, null, 1000]), [800, 1000, 1300]);
});

test("换算表覆盖全部标准档位且单调递增", () => {
  for (const rating of STANDARD_RATINGS) assert.ok(rating > 0, `${rating} 应为正数`);
  const labels = ["入门", "普及-", "普及", "普及+/提高-", "提高", "提高+/省选-", "省选/NOI-", "NOI/NOI+/CTS"];
  const values = labels.map((label) => DIFFICULTY_LABEL_RATING[label]);
  assert.deepEqual(values, [...values].sort((a, b) => a - b));
  assert.equal(values[0], 800);
  assert.ok(DIFFICULTY_LABEL_RATING["提高"] >= 1600, "提高档应落在 CF 1600+ 区间");
  assert.ok(Object.keys(RATING_BAND_VALUES).length > 0);
});
