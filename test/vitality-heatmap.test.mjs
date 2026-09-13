import test from "node:test";
import assert from "node:assert/strict";
import { vitalityLevel } from "../lib/vitality.mjs";

// 热力图按活力指数上色：做 1 道提高题（活力≈1.0）必须比做 3 道入门题（≈0.15）更深。
test("活力分档：提高题与入门题颜色不同", () => {
  assert.equal(vitalityLevel(0), 0, "没有训练应为空白");
  assert.equal(vitalityLevel(1.0), 4, "1 道提高题应到最深档");
  // 3 道入门题的合计活力远低于 1 道提高题
  const threeEasy = 3 * 0.06;
  assert.ok(vitalityLevel(threeEasy) < vitalityLevel(1.0), "3 道入门题应比 1 道提高题浅");
  assert.ok(vitalityLevel(threeEasy) <= 2);
});

test("活力分档单调不减", () => {
  const samples = [0, 0.05, 0.14, 0.15, 0.39, 0.4, 0.79, 0.8, 1.5, 3];
  const levels = samples.map(vitalityLevel);
  for (let i = 1; i < levels.length; i += 1) {
    assert.ok(levels[i] >= levels[i - 1], `活力升高时档位不应下降：${samples} -> ${levels}`);
  }
  assert.ok(vitalityLevel(NaN) === 0 || vitalityLevel(NaN) === 1, "非法输入要有确定结果");
});
