import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import worker, { seal } from "../workers/oauth.mjs";
import { sha256Hex } from "../workers/services/training.mjs";

const API = "https://api.github.com/repos/only-matthew/Algo-Training-Journal";
const SECRET = "test-session-secret";
const LOGIN = "only-matthew";
const CSRF = "csrf-v2";
const OP = "4fd06885-a6ed-43b4-9ba6-ec8875638cdf";

function githubMock() {
  let head = "r0";
  let commitNumber = 0;
  let fetchCount = 0;
  const files = new Map();
  const blobs = new Map();
  const response = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-RateLimit-Remaining": "4900" } });
  return {
    files,
    get fetchCount() { return fetchCount; },
    async fetch(input, options = {}) {
      fetchCount += 1;
      const url = String(input);
      const method = options.method || "GET";
      if (!url.startsWith(API)) throw new Error(`unexpected fetch ${method} ${url}`);
      const path = decodeURIComponent(url.slice(`${API}/`.length).split("?")[0]);
      if (path === "git/ref/heads/main" && method === "GET") return response({ object: { sha: head } });
      if (path.startsWith("git/commits/") && method === "GET") return response({ tree: { sha: `tree-${head}` } });
      if (path === "git/blobs" && method === "POST") {
        const body = JSON.parse(options.body);
        const sha = `blob-${blobs.size}`;
        blobs.set(sha, body.content);
        return response({ sha });
      }
      if (path === "git/trees" && method === "POST") {
        for (const entry of JSON.parse(options.body).tree) files.set(entry.path, blobs.get(entry.sha));
        return response({ sha: `tree-${head}` });
      }
      if (path === "git/commits" && method === "POST") {
        commitNumber += 1;
        return response({ sha: `commit-${commitNumber}` });
      }
      if (path === "git/refs/heads/main" && method === "PATCH") {
        const body = JSON.parse(options.body);
        assert.equal(body.force, false);
        head = body.sha;
        return response({ object: { sha: head } });
      }
      if (path.startsWith("contents/")) {
        const file = files.get(path.slice("contents/".length));
        if (file === undefined) return response({ message: "Not Found" }, 404);
        return response({ content: Buffer.from(file, "utf8").toString("base64"), encoding: "base64" });
      }
      if (path.startsWith("git/trees/") && method === "GET") return response({ tree: [...files.keys()].map((filePath, index) => ({ path: filePath, type: "blob", sha: `stored-${index}` })) });
      throw new Error(`unexpected GitHub call ${method} ${path}`);
    },
  };
}

test("v2 workbench stays below the Worker subrequest limit and returns recommendations", async (context) => {
  const github = githubMock();
  github.files.set("training/indexes/catalog.json", readFileSync("training/indexes/catalog.json", "utf8"));
  github.files.set("training/members/only-matthew/indexes/legacy.json", readFileSync("training/members/only-matthew/indexes/legacy.json", "utf8"));
  context.mock.method(globalThis, "fetch", github.fetch);
  const cookie = await sessionCookie();
  const response = await worker.fetch(new Request("https://train.xialiao.org/api/v2/me/workbench?date=2026-09-06", {
    headers: { Cookie: `__Host-journal_session=${cookie}` },
  }), { SESSION_SECRET: SECRET });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.nodes.length, 39);
  assert.ok(body.evidence.distinctProblems > 40);
  assert.ok(body.recommendations.items.length > 0);
  assert.ok(github.fetchCount < 10, `expected fewer than 10 GitHub subrequests, received ${github.fetchCount}`);
});

async function sessionCookie() {
  return seal({ token: "token", login: LOGIN, member: "廖夏", csrfToken: CSRF, exp: Date.now() + 600000 }, SECRET);
}

test("v2 rejects unauthenticated and cross-origin requests with structured errors", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 500 }));
  const unauthenticated = await worker.fetch(new Request("https://train.xialiao.org/api/v2/me/profile"), { SESSION_SECRET: SECRET });
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).error.code, "AUTH_REQUIRED");

  const crossOrigin = await worker.fetch(new Request("https://train.xialiao.org/api/v2/me/profile", { headers: { Origin: "https://evil.example" } }), { SESSION_SECRET: SECRET });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).error.code, "FORBIDDEN");
});

test("v2 profile uses session ownership, conditional writes, idempotency and non-force Git updates", async (context) => {
  const github = githubMock();
  context.mock.method(globalThis, "fetch", github.fetch);
  const cookie = await sessionCookie();
  const env = { SESSION_SECRET: SECRET };
  const get = await worker.fetch(new Request("https://train.xialiao.org/api/v2/me/profile", { headers: { Cookie: `__Host-journal_session=${cookie}` } }), env);
  assert.equal(get.status, 200);
  assert.deepEqual((await get.json()).revision, null);

  const put = await worker.fetch(new Request("https://train.xialiao.org/api/v2/me/profile", {
    method: "PUT",
    headers: { Cookie: `__Host-journal_session=${cookie}`, "X-CSRF-Token": CSRF, "Idempotency-Key": OP, "If-None-Match": "*", "Content-Type": "application/json" },
    body: JSON.stringify({ dailyBudgetMinutes: 60 }),
  }), env);
  assert.equal(put.status, 200);
  const saved = await put.json();
  assert.equal(saved.data.memberId, LOGIN);
  assert.match(put.headers.get("ETag"), /^"sha256:/);
  const readBack = await worker.fetch(new Request("https://train.xialiao.org/api/v2/me/profile", { headers: { Cookie: `__Host-journal_session=${cookie}` } }), env);
  assert.equal((await readBack.json()).revision, saved.resourceVersions.profile);

  const replay = await worker.fetch(new Request("https://train.xialiao.org/api/v2/me/profile", {
    method: "PUT",
    headers: { Cookie: `__Host-journal_session=${cookie}`, "X-CSRF-Token": CSRF, "Idempotency-Key": OP, "If-None-Match": "*", "Content-Type": "application/json" },
    body: JSON.stringify({ dailyBudgetMinutes: 60 }),
  }), env);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).operation.replayed, true);
  const operation = await worker.fetch(new Request(`https://train.xialiao.org/api/v2/me/operations/${OP}`, { headers: { Cookie: `__Host-journal_session=${cookie}` } }), env);
  assert.equal(operation.status, 200);
  assert.equal((await operation.json()).exists, true);
});

test("v2 mutations require CSRF and idempotency headers", async (context) => {
  const github = githubMock();
  context.mock.method(globalThis, "fetch", github.fetch);
  const cookie = await sessionCookie();
  const response = await worker.fetch(new Request("https://train.xialiao.org/api/v2/me/profile", {
    method: "PUT", headers: { Cookie: `__Host-journal_session=${cookie}`, "If-None-Match": "*", "Content-Type": "application/json" }, body: "{}",
  }), { SESSION_SECRET: SECRET });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "CSRF_FAILED");
});

test("v2 attempts can be listed, corrected, and voided without rewriting the original event", async (context) => {
  const github = githubMock();
  context.mock.method(globalThis, "fetch", github.fetch);
  const cookie = await sessionCookie();
  const env = { SESSION_SECRET: SECRET };
  const subjectKey = "problem:Codeforces|123A";
  const subjectHash = await sha256Hex(subjectKey);
  const attemptId = "5ca1a170-b129-4df2-8f8d-c0341a213b34";
  const headers = { Cookie: `__Host-journal_session=${cookie}`, "X-CSRF-Token": CSRF, "Content-Type": "application/json" };

  const created = await worker.fetch(new Request("https://train.xialiao.org/api/v2/me/attempts", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": OP },
    body: JSON.stringify({
      id: attemptId,
      recordRef: { memberId: LOGIN, date: "2026-09-06", recordId: "record-1" },
      problem: { name: "Example", platform: "CodeForces", problemNumber: "123A" },
      mode: "review", outcome: "independent", performedOn: "2026-09-06",
      preconditions: { [`review:${subjectHash}`]: null },
    }),
  }), env);
  assert.equal(created.status, 201);

  const listed = await worker.fetch(new Request(`https://train.xialiao.org/api/v2/me/attempts?subjectKey=${encodeURIComponent(subjectKey)}`, { headers: { Cookie: headers.Cookie } }), env);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).data[0].outcome, "independent");

  const corrected = await worker.fetch(new Request(`https://train.xialiao.org/api/v2/me/attempts/${attemptId}/corrections`, {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "0f7674cf-7366-4c0b-9df4-8b548c537385", "If-Match": created.headers.get("ETag") },
    body: JSON.stringify({ patch: { outcome: "hinted", note: "补充提示" } }),
  }), env);
  assert.equal(corrected.status, 201);

  const afterCorrection = await worker.fetch(new Request("https://train.xialiao.org/api/v2/me/attempts", { headers: { Cookie: headers.Cookie } }), env);
  assert.equal((await afterCorrection.json()).data[0].outcome, "hinted");

  const voided = await worker.fetch(new Request(`https://train.xialiao.org/api/v2/me/attempts/${attemptId}/void`, {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "11cde9b4-a76c-4b75-8d9c-4b02b5666bb8", "If-Match": corrected.headers.get("ETag") },
    body: JSON.stringify({ reason: "重复记录" }),
  }), env);
  assert.equal(voided.status, 201);
  const afterVoid = await worker.fetch(new Request("https://train.xialiao.org/api/v2/me/attempts", { headers: { Cookie: headers.Cookie } }), env);
  assert.deepEqual((await afterVoid.json()).data, []);
  assert.ok(github.files.has(`training/members/${LOGIN}/events/2026-09/${attemptId}.json`));
});
