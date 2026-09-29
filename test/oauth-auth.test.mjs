import assert from "node:assert/strict";
import test from "node:test";
import worker, { seal } from "../workers/oauth.mjs";

const ORIGIN = "https://algo-oauth.xialiao.org";
const SECRET = "auth-entry-test-secret";
const env = { SESSION_SECRET: SECRET, GITHUB_CLIENT_ID: "test-client", GITHUB_CLIENT_SECRET: "test-client-secret" };

async function login(returnTo = "https://train.xialiao.org/") {
  const response = await worker.fetch(new Request(`${ORIGIN}/auth/login?returnTo=${encodeURIComponent(returnTo)}`), env);
  assert.equal(response.status, 302);
  const redirect = new URL(response.headers.get("Location"));
  const oauthCookie = response.headers.get("Set-Cookie");
  assert.equal(redirect.origin, "https://github.com");
  assert.match(oauthCookie, /^__Host-journal_oauth=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
  return { state: redirect.searchParams.get("state"), cookie: oauthCookie.split(";")[0] };
}

test("OAuth callback rejects missing, invalid, and expired state before contacting GitHub", async (context) => {
  let fetches = 0;
  context.mock.method(globalThis, "fetch", async () => { fetches += 1; throw new Error("GitHub must not be contacted"); });
  const { state, cookie } = await login();
  const nonce = cookie.split("=")[1];
  const cases = [
    { state: "", cookie },
    { state: "invalid", cookie },
    { state, cookie: "__Host-journal_oauth=wrong" },
    { state, cookie: "" },
    { state: await seal({ nonce, exp: Date.now() - 1 }, SECRET), cookie },
  ];
  for (const item of cases) {
    const response = await worker.fetch(new Request(`${ORIGIN}/auth/callback?state=${encodeURIComponent(item.state)}&code=test`, {
      headers: item.cookie ? { Cookie: item.cookie } : {},
    }), env);
    assert.equal(response.status, 400);
  }
  assert.equal(fetches, 0);
});

test("OAuth callback constrains return URL and rejects users outside the member list", async (context) => {
  const { state, cookie } = await login("https://outside.example/phishing");
  const requests = [];
  context.mock.method(globalThis, "fetch", async (input) => {
    requests.push(String(input));
    if (String(input).includes("access_token")) return Response.json({ access_token: "test-token" });
    return Response.json({ id: 999999999, login: "outsider" });
  });
  const callback = () => worker.fetch(new Request(`${ORIGIN}/auth/callback?state=${encodeURIComponent(state)}&code=test`, {
    headers: { Cookie: cookie },
  }), env);
  assert.equal((await callback()).status, 403);
  assert.equal(requests.length, 2);

  context.mock.restoreAll();
  context.mock.method(globalThis, "fetch", async (input) => String(input).includes("access_token")
    ? Response.json({ access_token: "test-token" })
    : Response.json({ id: 72292250, login: "only-matthew", avatar_url: "https://example.com/avatar.png" }));
  const accepted = await callback();
  assert.equal(accepted.status, 302);
  assert.equal(accepted.headers.get("Location"), "https://train.xialiao.org/");
  assert.match(accepted.headers.get("Set-Cookie"), /^__Host-journal_session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800$/);
});

test("session entry rejects a signed member with another member's log directory", async () => {
  const value = await seal({ githubUserId: 72292250, login: "only-matthew", member: "王梓豪", exp: Date.now() + 60000 }, SECRET);
  const response = await worker.fetch(new Request(`${ORIGIN}/api/session`, {
    headers: { Cookie: `__Host-journal_session=${value}` },
  }), env);
  assert.equal(response.status, 200);
  assert.equal(await response.json(), null);
});
