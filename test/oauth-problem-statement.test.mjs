// Worker-level coverage for /api/problem-statement.
//
// The route must survive codeforces.com being behind Cloudflare bot management: it
// tries the official English page first and, when that only yields a challenge page,
// falls back to the Luogu mirror of the same problem. These tests drive the real HTTP
// entry point so the wiring (route -> fetchStatement) cannot silently regress.
import assert from "node:assert/strict";
import test from "node:test";

import worker, { seal } from "../workers/oauth.mjs";

const SECRET = "test-session-secret";
const LOGIN = "only-matthew";
const MEMBER = "廖夏";
const CSRF = "csrf-statement";
const CF_URL = "https://codeforces.com/problemset/problem/4/A?locale=en";
const LUOGU_URL = "https://www.luogu.com.cn/problem/CF4A";
const CHALLENGE = `<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>cloudflare challenge</body></html>`;
const CF_HTML = `<div class="problem-statement"><div class="header"><div class="title">A. Watermelon</div><div class="time-limit">1 second</div><div class="memory-limit">256 megabytes</div></div><p>Find $$$w$$$.</p></div>`;
const LUOGU_HTML = `<html><body><script id="lentille-context" type="application/json">${JSON.stringify({
  data: { problem: { pid: "CF4A", name: "Watermelon", content: { description: "<p>给定 $w$，判断能否分成两个正偶数。</p>" } } },
}).replace(/<\//g, "<\\/")}</script></body></html>`;

function routedFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    const target = String(url);
    calls.push(target);
    for (const [pattern, handler] of routes) if (pattern.test(target)) return handler(target);
    throw new Error(`unexpected fetch ${target}`);
  };
  impl.calls = calls;
  return impl;
}

async function call() {
  const cookie = await seal({ token: "token", login: LOGIN, member: MEMBER, csrfToken: CSRF, exp: Date.now() + 600000 }, SECRET);
  return worker.fetch(new Request("https://train.xialiao.org/api/problem-statement", {
    method: "POST",
    headers: {
      Cookie: `__Host-journal_session=${cookie}`,
      "X-CSRF-Token": CSRF,
      "Content-Type": "application/json",
      Origin: "https://train.xialiao.org",
    },
    body: JSON.stringify({ platform: "Codeforces", problemNumber: "4A" }),
  }), { SESSION_SECRET: SECRET });
}

test("题面路由先取官方题面", async (context) => {
  const fetchImpl = routedFetch([[/^https:\/\/codeforces\.com\//, () => new Response(CF_HTML)]]);
  context.mock.method(globalThis, "fetch", fetchImpl);
  const response = await call();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.source.kind, "codeforces-html");
  assert.equal(body.source.url, CF_URL);
  assert.match(body.description, /# A\. Watermelon/);
  assert.deepEqual(fetchImpl.calls, [CF_URL]);
});

test("官方题面被反爬拦下时路由回退洛谷镜像", async (context) => {
  const fetchImpl = routedFetch([
    [/^https:\/\/codeforces\.com\//, () => new Response(CHALLENGE, { status: 403 })],
    [new RegExp(`^${LUOGU_URL}$`), () => new Response(LUOGU_HTML)],
  ]);
  context.mock.method(globalThis, "fetch", fetchImpl);
  const response = await call();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.source.kind, "luogu-mirror");
  assert.equal(body.source.parserVersion, "luogu-mirror-v1");
  assert.deepEqual(body.warnings, ["mirror-source"]);
  assert.match(body.description, /# Watermelon/);
  assert.match(body.description, /\$w\$/);
  assert.deepEqual(fetchImpl.calls, [CF_URL, LUOGU_URL]);
});

test("题号非法时路由仍是 400，不会去请求镜像", async (context) => {
  const fetchImpl = routedFetch([]);
  context.mock.method(globalThis, "fetch", fetchImpl);
  const cookie = await seal({ token: "token", login: LOGIN, member: MEMBER, csrfToken: CSRF, exp: Date.now() + 600000 }, SECRET);
  const response = await worker.fetch(new Request("https://train.xialiao.org/api/problem-statement", {
    method: "POST",
    headers: { Cookie: `__Host-journal_session=${cookie}`, "X-CSRF-Token": CSRF, "Content-Type": "application/json" },
    body: JSON.stringify({ platform: "Codeforces", problemNumber: "CF" }),
  }), { SESSION_SECRET: SECRET });
  assert.equal(response.status, 400);
  assert.equal(fetchImpl.calls.length, 0);
});
