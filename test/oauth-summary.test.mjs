import assert from "node:assert/strict";
import test from "node:test";

import { summarizeDescription } from "../workers/oauth.js";

test("summarizeDescription requests a non-thinking short answer", async () => {
  let invocation;
  const ai = {
    async run(model, options) {
      invocation = { model, options };
      return { response: "<think>ignored</think>题意：求数组中的最大子段和。" };
    },
  };

  const summary = await summarizeDescription(ai, "给定一个长度为 n 的整数数组，请计算所有连续子数组中的最大元素和。");

  assert.equal(summary, "求数组中的最大子段和。");
  assert.equal(invocation.model, "@cf/qwen/qwen3-30b-a3b-fp8");
  assert.equal(invocation.options.max_tokens, 512);
  assert.match(invocation.options.messages.at(-1).content, /\/no_think$/);
});

test("summarizeDescription rejects descriptions that are too short", async () => {
  const ai = { run: () => assert.fail("AI should not be called") };
  assert.equal(await summarizeDescription(ai, "内容太短"), null);
});