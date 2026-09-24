import assert from "node:assert/strict";
import test from "node:test";

test("journal data store loads only route-relevant shards and reuses cached requests", async (context) => {
  const originalDocument = globalThis.document;
  globalThis.document = { querySelector: () => null };
  const requests = [];
  const payloads = new Map([
    ["data/manifest.json", {
      months: [
        { id: "2026-09", url: "data/logs/2026-09.json" },
        { id: "2026-08", url: "data/logs/2026-08.json" },
        { id: "2026-07", url: "data/logs/2026-07.json" },
      ],
      members: { "甲": { years: [{ id: "2026", url: "data/members/%E7%94%B2/2026.json" }] } },
      review: { url: "data/review.json" },
    }],
    ["data/overview.json", { members: ["甲"], logs: [], heatmap: { all: {}, byMember: {} }, recent30: { byMember: {} } }],
    ["data/logs/2026-09.json", { logs: [{ member: "甲", date: "2026-09-20", problemId: "sep" }] }],
    ["data/logs/2026-08.json", { logs: [{ member: "甲", date: "2026-08-20", problemId: "aug" }] }],
    ["data/logs/2026-07.json", { logs: [{ member: "甲", date: "2026-07-20", problemId: "jul" }] }],
    ["data/members/%E7%94%B2/2026.json", { logs: [{ member: "甲", date: "2026-01-02", problemId: "member" }] }],
    ["data/review.json", { logs: [{ member: "甲", date: "2026-02-02", problemId: "review" }] }],
  ]);
  context.mock.method(globalThis, "fetch", async (input) => {
    const path = String(input).split("?")[0];
    requests.push(path);
    const payload = payloads.get(path);
    return payload ? Response.json(payload) : new Response("missing", { status: 404 });
  });
  context.after(() => { globalThis.document = originalDocument; });

  const data = await import(`../lib/data.mjs?shards=${Date.now()}`);
  const analysis = await data.ensureAnalysisJournal("2026-08-01", "2026-09-30");
  assert.deepEqual(analysis.logs.map((item) => item.problemId), ["sep", "aug"]);
  assert.equal(requests.includes("data/logs/2026-07.json"), false);

  await data.ensureAnalysisJournal("2026-09-01", "2026-09-30");
  assert.equal(requests.filter((item) => item === "data/logs/2026-09.json").length, 1, "month shard should be cached");

  const full = await data.ensureFullJournal();
  assert.deepEqual(full.logs.map((item) => item.problemId), ["sep", "aug", "jul"], "global search should receive every month");
  assert.equal(requests.filter((item) => item === "data/logs/2026-09.json").length, 1, "full journal should reuse cached month shards");

  const member = await data.ensureMemberJournal("甲");
  assert.deepEqual(member.logs.map((item) => item.problemId), ["member"]);
  const review = await data.ensureReviewJournal();
  assert.deepEqual(review.logs.map((item) => item.problemId), ["review"]);
});
