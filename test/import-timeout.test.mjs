import assert from "node:assert/strict";
import test from "node:test";
import { fetchCodeforcesAccepted, fetchAtCoderAccepted } from "../workers/services/problem-import.mjs";

test("CF 与 AtCoder 主导入请求带超时信号并映射超时错误", async () => {
  for (const run of [fetchCodeforcesAccepted, fetchAtCoderAccepted]) {
    await assert.rejects(() => run("member", { fetchImpl: async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      throw new DOMException("expired", "TimeoutError");
    } }), { code: "IMPORT_TIMEOUT", status: 504 });
  }
});

test("元数据补查带超时信号，失败后保留已取得的 AC 记录", async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const run of [fetchCodeforcesAccepted, fetchAtCoderAccepted]) {
    let calls = 0;
    const result = await run("member", { fetchImpl: async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      if (++calls === 2) throw new DOMException("expired", "TimeoutError");
      const body = run === fetchCodeforcesAccepted
        ? { status: "OK", result: [{ creationTimeSeconds: now, verdict: "OK", problem: { name: "Test", contestId: 4, index: "A" } }] }
        : [{ epoch_second: now, result: "AC", problem_id: "abc381_a" }];
      return new Response(JSON.stringify(body));
    } });
    assert.equal(calls, 2);
    assert.equal(result.length, 1);
  }
});
