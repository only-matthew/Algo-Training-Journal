import test from "node:test";
import assert from "node:assert/strict";

test("dashboard shows only the member's published history when recommendations fail and refresh works repeatedly", async (context) => {
  const nodes = new Map();
  globalThis.document = {
    querySelector() { return null; },
    createElement() { return {}; },
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { style: {}, replaceChildren() {}, textContent: "", innerHTML: "" });
      return nodes.get(id);
    },
  };
  globalThis.window = { location: { pathname: "/training/" } };
  context.after(() => { delete globalThis.document; delete globalThis.window; });
  let reads = 0;
  context.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("/api/session")) return Response.json({ login: "test", member: "甲" });
    if (String(url).includes("/me/recommendations")) return Response.json({ error: { code: "UPSTREAM_UNAVAILABLE", message: "offline" } }, { status: 503 });
    if (String(url).includes("/me/workbench")) return Response.json({ plan: null, dueReviews: [], evidence: { attempts: 0, distinctProblems: 0 } });
    if (String(url).startsWith("data/all.json")) {
      reads++;
      return Response.json({ logs: [
        { member: "甲", date: "2026-09-01", problemId: "a", platform: "洛谷", problemNumber: "P1001" },
        { member: "乙", date: "2026-09-02", problemId: "b", platform: "洛谷", problemNumber: "P1002" },
      ] });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const { initSession } = await import("../lib/auth.mjs");
  const { initTrainingPage } = await import("../lib/training-dashboard.mjs");
  await initSession();
  await initTrainingPage();
  assert.equal(nodes.get("training-problem-count").textContent, "1");
  assert.match(nodes.get("training-evidence").innerHTML, /1 条记录、1 道题/);
  assert.match(nodes.get("training-recommendations").innerHTML, /推荐加载失败/);
  await nodes.get("training-refresh").onclick();
  await nodes.get("training-refresh").onclick();
  assert.equal(reads, 3);
  assert.equal(nodes.get("training-refresh").disabled, false);
});
