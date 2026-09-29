import assert from "node:assert/strict";
import test from "node:test";
import worker, { seal } from "../workers/oauth.mjs";

const origin = "https://algo-oauth.xialiao.org";
const secret = "my-list-test-secret";
const env = { SESSION_SECRET: secret };

async function session(member, csrfToken = "csrf") {
  const value = await seal({ githubUserId: 72292250, login: "only-matthew", member, token: "test-token", csrfToken, exp: Date.now() + 60000 }, secret);
  return `__Host-journal_session=${value}`;
}

test("personal list is owner scoped, version checked, and refuses incomplete or duplicate goals", async (context) => {
  context.mock.method(console, "error", () => {});
  let stored = null;
  const calls = [];
  context.mock.method(globalThis, "fetch", async (input, options = {}) => {
    const url = String(input);
    calls.push({ url, method: options.method || "GET" });
    assert.match(decodeURI(url), /logs\/廖夏\/my-list\.json/);
    if ((options.method || "GET") === "GET") {
      if (!stored) return new Response("", { status: 404 });
      return Response.json({ sha: stored.sha, content: stored.content });
    }
    const body = JSON.parse(options.body);
    if (stored) assert.equal(body.sha, stored.sha);
    else assert.equal(body.sha, undefined);
    stored = { sha: "revision-1", content: body.content };
    return Response.json({ content: { sha: stored.sha } });
  });
  const cookie = await session("廖夏");
  const get = () => worker.fetch(new Request(`${origin}/api/my-list`, { headers: { Cookie: cookie } }), env);
  const put = (items, expectedRevision, headers = {}) => worker.fetch(new Request(`${origin}/api/my-list`, {
    method: "PUT", headers: { Cookie: cookie, "X-CSRF-Token": "csrf", ...headers }, body: JSON.stringify({ items, expectedRevision }),
  }), env);
  assert.deepEqual(await (await get()).json(), { items: [], revision: null });
  const item = { platform: "CodeForces", problemNumber: "123 A", name: "Test" };
  const saved = await put([item], null);
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).items, [{ platform: "Codeforces", problemNumber: "123A", name: "Test" }]);
  assert.equal((await put([item], null)).status, 409);
  assert.equal((await put([{ ...item, problemNumber: "A" }], "revision-1")).status, 400);
  assert.equal((await put([item, item], "revision-1")).status, 400);
  assert.equal((await put([item], "revision-1", { "X-CSRF-Token": "wrong" })).status, 403);
  assert.equal(calls.filter((call) => call.method === "PUT").length, 1);

  const otherCookie = await session("王梓豪");
  const other = await worker.fetch(new Request(`${origin}/api/my-list`, { headers: { Cookie: otherCookie } }), env);
  assert.equal(other.status, 401, "signed login must match configured member directory");
});
