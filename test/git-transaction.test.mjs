import assert from "node:assert/strict";
import test from "node:test";

import { GitTransactionError, runGitTransaction } from "../workers/storage/git-transaction.mjs";

const MEMBER = "member-example";
const OPERATION = "4fd06885-a6ed-43b4-9ba6-ec8875638cdf";
const RECEIPT_PATH = `training/members/${MEMBER}/operations/${OPERATION}.json`;

function fakeGit({ conflictAttempts = 0, receipt = null } = {}) {
  let headNumber = 0;
  let commits = 0;
  const filesByHead = new Map([["h0", new Map(receipt ? [[RECEIPT_PATH, JSON.stringify(receipt)]] : [])]]);
  const reads = [];
  return {
    reads,
    get commits() { return commits; },
    async getHead() { return `h${headNumber}`; },
    async readFile(head, path) {
      reads.push({ head, path });
      return filesByHead.get(head)?.get(path) ?? null;
    },
    async commit({ head, changes }) {
      commits += 1;
      if (commits <= conflictAttempts) {
        headNumber += 1;
        filesByHead.set(`h${headNumber}`, new Map(filesByHead.get(head)));
        throw Object.assign(new Error("reference changed"), { code: "REF_CONFLICT" });
      }
      assert.equal(head, `h${headNumber}`, "commit must use the head it planned from");
      headNumber += 1;
      const next = new Map(filesByHead.get(head));
      for (const change of changes) next.set(change.path, change.content);
      filesByHead.set(`h${headNumber}`, next);
      return { commitSha: `h${headNumber}` };
    },
  };
}

function transaction(git, overrides = {}) {
  return runGitTransaction({
    git,
    memberId: MEMBER,
    operationId: OPERATION,
    requestHash: "hash-a",
    now: () => "2026-09-06T00:00:00.000Z",
    validate: async () => {},
    plan: async () => ({ changes: [{ path: "training/example.json", content: "{}" }], result: { createdId: "event-1" } }),
    ...overrides,
  });
}

test("uses one fixed head for receipt lookup, validation, and planning", async () => {
  const git = fakeGit();
  const observed = [];
  await transaction(git, {
    validate: async (snapshot) => {
      observed.push(["validate", snapshot.head]);
      assert.equal(await snapshot.readFile("training/example.json"), null);
    },
    plan: async (snapshot) => {
      observed.push(["plan", snapshot.head]);
      return { changes: [{ path: "training/example.json", content: "{}" }], result: { createdId: "event-1" } };
    },
  });
  assert.deepEqual(observed, [["validate", "h0"], ["plan", "h0"]]);
  assert.deepEqual(git.reads.map(({ head }) => head), ["h0", "h0"]);
});

test("replays a matching receipt before calling validation", async () => {
  const git = fakeGit({ receipt: { schemaVersion: 1, requestHash: "hash-a", result: { createdId: "event-1" } } });
  const result = await transaction(git, {
    validate: () => assert.fail("stale preconditions must not be validated on a replay"),
    plan: () => assert.fail("a replay must not be planned again"),
  });
  assert.equal(git.commits, 0);
  assert.deepEqual(result, { createdId: "event-1", operation: { id: OPERATION, state: "saved", replayed: true }, snapshotCommitSha: "h0" });
});

test("rejects a reused idempotency key with a different request hash", async () => {
  const git = fakeGit({ receipt: { schemaVersion: 1, requestHash: "hash-a", result: {} } });
  await assert.rejects(transaction(git, { requestHash: "hash-b" }), (error) => error instanceof GitTransactionError && error.code === "IDEMPOTENCY_REUSE" && error.status === 409);
  assert.equal(git.commits, 0);
});

test("re-reads, re-validates, and re-plans after a reference conflict", async () => {
  const git = fakeGit({ conflictAttempts: 1 });
  const seen = [];
  const result = await transaction(git, {
    validate: async ({ head }) => seen.push(`validate:${head}`),
    plan: async ({ head }) => {
      seen.push(`plan:${head}`);
      return { changes: [{ path: `training/${head}.json`, content: head }], result: { head } };
    },
  });
  assert.deepEqual(seen, ["validate:h0", "plan:h0", "validate:h1", "plan:h1"]);
  assert.equal(git.commits, 2);
  assert.equal(result.head, "h1");
  assert.equal(result.snapshotCommitSha, "h2");
});

test("returns WRITE_CONTENTION after three reference conflicts", async () => {
  const git = fakeGit({ conflictAttempts: 3 });
  await assert.rejects(transaction(git), (error) => error instanceof GitTransactionError && error.code === "WRITE_CONTENTION" && error.status === 409);
  assert.equal(git.commits, 3);
});

test("does not retry non-reference errors", async () => {
  const git = fakeGit();
  git.commit = async () => { throw Object.assign(new Error("unprocessable tree"), { code: "UNPROCESSABLE", status: 422 }); };
  await assert.rejects(transaction(git), /unprocessable tree/);
});
