// Direct coverage for workers/storage/github-api.mjs — the Worker's only GitHub exit.
//
// The audit (AUDIT-2026-10-02 §3.5) found that no test asserted the Authorization
// header at all, so `ghHeaders` could be dropped or overwritten and all 574 tests
// stayed green while every production read/write returned 401. The four failure
// branches (quota exhausted, 403, 5xx, 204) were likewise untested.
import assert from "node:assert/strict";
import test from "node:test";

import { BRANCH, REPO, GH_TIMEOUT_MS, gh, ghHeaders } from "../workers/storage/github-api.mjs";

const TOKEN = "gho_test_token_value";

function mockFetch(handler) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options);
  };
  impl.calls = calls;
  return impl;
}

const ok = (body, headers = {}) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "Content-Type": "application/json", "X-RateLimit-Remaining": "4900", ...headers },
});

test("gh() 拼出仓库地址，并带齐四个请求头与默认超时", async (context) => {
  const fetchImpl = mockFetch(() => ok({ object: { sha: "abc" } }));
  context.mock.method(globalThis, "fetch", fetchImpl);

  const body = await gh(`/git/ref/heads/${BRANCH}`, TOKEN);

  assert.deepEqual(body, { object: { sha: "abc" } });
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, `https://api.github.com/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const headers = fetchImpl.calls[0].options.headers;
  assert.equal(headers.Authorization, `Bearer ${TOKEN}`, "GitHub 请求必须带 Bearer 鉴权头");
  assert.equal(headers.Accept, "application/vnd.github+json");
  assert.equal(headers["User-Agent"], "Algo-Training-Journal-Worker");
  assert.equal(headers["X-GitHub-Api-Version"], "2022-11-28");
  // 没有超时的 fetch 会让一次上游抖动挂死所有读写（审计 §3.3）。
  assert.ok(fetchImpl.calls[0].options.signal instanceof AbortSignal, "默认必须带超时信号");
});

test("gh() 对绝对 URL 不再拼仓库前缀，且调用方的 headers 与 signal 可以覆盖默认值", async (context) => {
  const fetchImpl = mockFetch(() => ok({ id: 1 }));
  context.mock.method(globalThis, "fetch", fetchImpl);
  const controller = new AbortController();

  await gh("https://api.github.com/user", TOKEN, { headers: { Accept: "application/json" }, signal: controller.signal });

  assert.equal(fetchImpl.calls[0].url, "https://api.github.com/user");
  assert.equal(fetchImpl.calls[0].options.headers.Accept, "application/json");
  assert.equal(fetchImpl.calls[0].options.signal, controller.signal);
});

test("gh() 配额耗尽（X-RateLimit-Remaining: 0）→ 429 且带恢复时间", async (context) => {
  const fetchImpl = mockFetch(() => new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
    status: 403,
    headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "1767225600" },
  }));
  context.mock.method(globalThis, "fetch", fetchImpl);

  await assert.rejects(() => gh("/git/ref/heads/main", TOKEN), (error) => {
    assert.equal(error.status, 429);
    assert.match(error.message, /配额/);
    return true;
  });
});

test("gh() 成功响应使用最后一次配额时仍返回结果", async (context) => {
  context.mock.method(globalThis, "fetch", async () => ok({ sha: "committed" }, { "X-RateLimit-Remaining": "0" }));
  assert.deepEqual(await gh("/git/commits", TOKEN), { sha: "committed" });
});

test("gh() 成功的 204 与上游 5xx 不被零配额头覆盖", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204, headers: { "X-RateLimit-Remaining": "0" } }));
  assert.equal(await gh("/test", TOKEN), null);
  context.mock.method(globalThis, "fetch", async () => new Response("error", { status: 500, headers: { "X-RateLimit-Remaining": "0" } }));
  await assert.rejects(() => gh("/test", TOKEN), { status: 502 });
});

test("gh() 403 给可读的权限提示，不泄露上游响应体", async (context) => {
  const fetchImpl = mockFetch(() => new Response(JSON.stringify({ message: "Resource not accessible by integration", internal: "secret-detail" }), {
    status: 403,
    headers: { "X-RateLimit-Remaining": "4900" },
  }));
  context.mock.method(globalThis, "fetch", fetchImpl);

  await assert.rejects(() => gh("/git/ref/heads/main", TOKEN), (error) => {
    assert.equal(error.status, 403);
    assert.match(error.message, /仓库权限/);
    assert.doesNotMatch(error.message, /secret-detail/);
    return true;
  });
});

test("gh() 5xx → 502（不把 5xx 当成 400 客户端错误）", async (context) => {
  const fetchImpl = mockFetch(() => new Response("upstream exploded", { status: 503, headers: { "X-RateLimit-Remaining": "4900" } }));
  context.mock.method(globalThis, "fetch", fetchImpl);

  await assert.rejects(() => gh("/git/ref/heads/main", TOKEN), (error) => {
    assert.equal(error.status, 502);
    return true;
  });
});

test("gh() 204 返回 null（DELETE 之类没有响应体）", async (context) => {
  const fetchImpl = mockFetch(() => new Response(null, { status: 204, headers: { "X-RateLimit-Remaining": "4900" } }));
  context.mock.method(globalThis, "fetch", fetchImpl);

  assert.equal(await gh("/git/refs/heads/main", TOKEN, { method: "DELETE" }), null);
});

test("ghHeaders 与默认超时常量是单一事实源", () => {
  assert.equal(ghHeaders(TOKEN).Authorization, `Bearer ${TOKEN}`);
  assert.equal(GH_TIMEOUT_MS, 15000);
});
