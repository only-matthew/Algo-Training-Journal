import assert from "node:assert/strict";
import test from "node:test";

import { buildTrainingReadModels, legacyIndexPath } from "../scripts/reindex-training.mjs";
import { readTrainingContext } from "../workers/services/training-read.mjs";

test("workbench reads bounded indexes instead of every curriculum node and historical log", async () => {
  const models = buildTrainingReadModels();
  const memberId = "only-matthew";
  const files = new Map([
    ["training/indexes/catalog.json", JSON.stringify(models.get("training/indexes/catalog.json"))],
    [legacyIndexPath(memberId), JSON.stringify(models.get(legacyIndexPath(memberId)))],
  ]);
  let reads = 0;
  const snapshot = {
    head: "snapshot-sha",
    async readFile(path) {
      reads += 1;
      return files.get(path) ?? null;
    },
  };
  const git = {
    async listDocuments() { return []; },
    async listFiles() { throw new Error("workbench must not scan historical log files"); },
  };
  const context = await readTrainingContext({
    git,
    snapshot,
    user: { login: memberId, member: "廖夏" },
    date: "2026-09-06",
    today: "2026-09-06",
  });
  assert.equal(reads, 4);
  assert.equal(context.nodes.length, 39);
  assert.ok(context.legacyRecords.length > 40);
  assert.equal(context.snapshotCommitSha, "snapshot-sha");
});
