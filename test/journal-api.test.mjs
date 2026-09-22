import assert from "node:assert/strict";
import test from "node:test";

import { apiRequest, loadSession, saveDateLog, deleteDateLog, saveDateLogV2, statementUrl, SESSION_TIMEOUT_MS } from "../lib/journal-api.js";
import worker, { logRoots, seal } from "../workers/oauth.mjs";

test("anonymous session lookup succeeds without relaxing protected endpoints", async () => {
  const env = { SESSION_SECRET: "test-session-secret" };
  const expired = await seal({ login: "only-matthew", member: "廖夏", exp: Date.now() - 1000 }, env.SESSION_SECRET);
  for (const cookie of ["", "__Host-journal_session=invalid", `__Host-journal_session=${expired}`]) {
    const response = await worker.fetch(new Request("https://algo-oauth.xialiao.org/api/session", {
      headers: { Origin: "https://train.xialiao.org", Cookie: cookie },
    }), env);
    assert.equal(response.status, 200);
    assert.equal(await response.json(), null);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://train.xialiao.org");
  }
  for (const [pathname, method] of [["/api/logs/date", "GET"], ["/api/logs/date", "PUT"], ["/api/v2/me/profile", "GET"], ["/api/session", "POST"]]) {
    const response = await worker.fetch(new Request(`https://algo-oauth.xialiao.org${pathname}`, { method }), env);
    assert.equal(response.status, 401);
  }
  const forbidden = await worker.fetch(new Request("https://algo-oauth.xialiao.org/api/session", {
    headers: { Origin: "https://untrusted.example" },
  }), env);
  assert.equal(forbidden.status, 403);
});

test("authenticated session preserves public profile and CSRF without exposing credentials", async () => {
  const env = { SESSION_SECRET: "test-session-secret" };
  const cookie = await seal({ login: "only-matthew", member: "廖夏", avatar_url: "https://avatars.githubusercontent.com/u/1", csrfToken: "test-csrf", token: "private-token", exp: Date.now() + 60000 }, env.SESSION_SECRET);
  const response = await worker.fetch(new Request("https://algo-oauth.xialiao.org/api/session", {
    headers: { Cookie: `__Host-journal_session=${cookie}` },
  }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.login, "only-matthew");
  assert.equal(body.csrfToken, "test-csrf");
  assert.equal(body.token, undefined);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("anonymous session clears a previously loaded CSRF token", async (context) => {
  let signedIn = true;
  let writeHeaders;
  context.mock.method(globalThis, "fetch", async (url, options = {}) => {
    if (String(url).endsWith("/api/session")) return Response.json(signedIn ? { login: "only-matthew", csrfToken: "old-token" } : null);
    writeHeaders = options.headers;
    return Response.json({ problems: [] });
  });
  assert.equal((await loadSession()).login, "only-matthew");
  signedIn = false;
  assert.equal(await loadSession(), null);
  await saveDateLog("2026-09-10", []);
  assert.equal(writeHeaders["X-CSRF-Token"], undefined);
});

test("session lookup has a bounded timeout", async (context) => {
  assert.equal(SESSION_TIMEOUT_MS, 4000);
  context.mock.method(globalThis, "fetch", async (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  }));
  await assert.rejects(() => loadSession({ timeoutMs: 10 }), (error) => error?.name === "TimeoutError");
});

test("logRoots prefers the current date layout and retains the legacy fallback", () => {
  assert.deepEqual(logRoots("廖夏", "2026-07-31"), [
    "logs/廖夏/2026/07/31",
    "logs/廖夏/2026-07-31",
  ]);
});

test("authenticated writes include credentials and the session CSRF token", async (context) => {
  const requests = [];
  context.mock.method(globalThis, "fetch", async (url, options = {}) => {
    requests.push({ url, options });
    if (String(url).endsWith("/api/session")) {
      return new Response(JSON.stringify({ login: "only-matthew", csrfToken: "csrf-test" }));
    }
    return new Response(JSON.stringify({ problems: [] }));
  });

  await loadSession();
  await saveDateLog("2026-07-31", [], {}, null);

  assert.equal(requests[1].options.credentials, "include");
  assert.equal(requests[1].options.method, "PUT");
  assert.equal(requests[1].options.headers["X-CSRF-Token"], "csrf-test");
});

test("conditional writes always transmit the expected version", async (context) => {
  const requests = [];
  context.mock.method(globalThis, "fetch", async (url, options = {}) => {
    requests.push({ url, options });
    if (String(url).endsWith("/api/session")) {
      return new Response(JSON.stringify({ login: "only-matthew", csrfToken: "csrf-test" }));
    }
    return new Response(JSON.stringify({ problems: [], revision: "sha256:next" }));
  });

  await loadSession();
  const revision = `sha256:${"a".repeat(64)}`;
  await saveDateLog("2026-07-31", [], { startedOn: "09:00" }, revision);

  const put = requests.at(-1);
  const body = JSON.parse(put.options.body);
  // 缺字段会让服务端返回 428；null 是「该日期尚不存在」的合法声明。
  assert.equal(body.expectedVersion, revision);
  assert.equal(body.startedOn, "09:00");
  assert.equal(body.problems.length, 0);

  // 新建日期必须显式发送 null，不能省略字段。
  await saveDateLog("2026-08-01", [], {}, null);
  assert.equal("expectedVersion" in JSON.parse(requests.at(-1).options.body), true);
  assert.equal(JSON.parse(requests.at(-1).options.body).expectedVersion, null);

  await deleteDateLog("2026-07-31", revision);
  const del = requests.at(-1);
  assert.equal(del.options.method, "DELETE");
  assert.equal(JSON.parse(del.options.body).expectedVersion, revision);
});

test("a version conflict surfaces status and currentRevision to the caller", async (context) => {
  context.mock.method(globalThis, "fetch", async (url) => String(url).endsWith("/api/session")
    ? new Response(JSON.stringify({ login: "only-matthew", csrfToken: "csrf-test" }))
    : new Response(JSON.stringify({ error: "记录已被其他端修改，请刷新后重试", code: "VERSION_CONFLICT", currentRevision: "sha256:other" }), { status: 409 }));

  await loadSession();
  await assert.rejects(
    () => saveDateLog("2026-07-31", [], {}, "sha256:stale"),
    (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.message, "记录已被其他端修改，请刷新后重试");
      assert.equal(error.body.currentRevision, "sha256:other");
      return true;
    },
  );
});

test("the v2 attachment save builds the documented multipart payload", async (context) => {
  let captured;
  context.mock.method(globalThis, "fetch", async (url, options = {}) => {
    if (String(url).endsWith("/api/session")) return new Response(JSON.stringify({ login: "only-matthew", csrfToken: "csrf-test" }));
    captured = { url, options };
    return new Response(JSON.stringify({ log: { problems: [] }, revision: "sha256:next" }));
  });

  await loadSession();
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  const attachments = new Map([["pdf-p1", { blob: new Blob([bytes], { type: "application/pdf" }), fileName: "题面.pdf" }]]);
  const result = await saveDateLogV2("2026-07-31", {
    log: { schemaVersion: 4, problems: [{ id: "p1", name: "Loop" }] },
    expectedVersion: null,
    attachmentChanges: [{ recordId: "p1", action: "replace", partName: "pdf-p1" }],
    attachments,
    operationId: "4fd06885-a6ed-43b4-9ba6-ec8875638cdf",
  });

  assert.equal(result.revision, "sha256:next");
  assert.equal(captured.url, "https://algo-oauth.xialiao.org/api/v2/logs/dates/2026-07-31");
  assert.equal(captured.options.method, "PUT");
  // 幂等键必须同时在头里（服务端据此去重）和 payload 里（回执记录 operationId）。
  assert.equal(captured.options.headers["Idempotency-Key"], "4fd06885-a6ed-43b4-9ba6-ec8875638cdf");
  assert.equal(captured.options.headers["X-CSRF-Token"], "csrf-test");
  // FormData 必须交给浏览器自己带 boundary，不能手动设 Content-Type。
  assert.equal(captured.options.headers["Content-Type"], undefined);
  assert.ok(captured.options.body instanceof FormData);

  const payload = JSON.parse(captured.options.body.get("payload"));
  assert.equal(payload.operationId, "4fd06885-a6ed-43b4-9ba6-ec8875638cdf");
  assert.equal(payload.expectedVersion, null);
  assert.equal(payload.log.schemaVersion, 4);
  assert.deepEqual(payload.attachmentChanges, [{ recordId: "p1", action: "replace", partName: "pdf-p1" }]);

  const part = captured.options.body.get("pdf-p1");
  assert.equal(part.name, "题面.pdf");
  assert.equal(part.type, "application/pdf");
  assert.equal(part.size, bytes.byteLength);
});

test("a JSON-only v2 save omits PDF parts entirely", async (context) => {
  let captured;
  context.mock.method(globalThis, "fetch", async (url, options = {}) => {
    if (String(url).endsWith("/api/session")) return new Response(JSON.stringify({ login: "only-matthew", csrfToken: "csrf-test" }));
    captured = options;
    return new Response(JSON.stringify({ revision: "sha256:next" }));
  });

  await loadSession();
  await saveDateLogV2("2026-07-31", {
    log: { schemaVersion: 4, problems: [] },
    expectedVersion: "sha256:current",
    attachmentChanges: [{ recordId: "p1", action: "remove" }],
    attachments: new Map(),
    operationId: "4fd06885-a6ed-43b4-9ba6-ec8875638cdf",
  });

  const payload = JSON.parse(captured.body.get("payload"));
  assert.deepEqual(payload.attachmentChanges, [{ recordId: "p1", action: "remove" }]);
  assert.equal(payload.expectedVersion, "sha256:current");
  // 没有 PDF 时不应出现任何额外分区，否则服务端会因「未被引用的分区」拒绝整个请求。
  assert.deepEqual([...captured.body.keys()], ["payload"]);
});

test("statementUrl points at the v2 attachment route with both keys encoded", () => {
  assert.equal(
    statementUrl("2026-07-31", "p 1/2"),
    "https://algo-oauth.xialiao.org/api/v2/logs/dates/2026-07-31/problems/p%201%2F2/statement",
  );
});

test("API errors preserve structured v2 conflict details", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    error: { code: "VERSION_CONFLICT", message: "版本已更新", currentRevision: "sha256:new" },
    requestId: "request-1",
  }), { status: 409, headers: { "Content-Type": "application/json", "Retry-After": "2" } }));

  await assert.rejects(apiRequest("/api/v2/me/plans/2026-09-06"), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.error.code, "VERSION_CONFLICT");
    assert.equal(error.requestId, "request-1");
    assert.equal(error.retryAfter, "2");
    return true;
  });
});
