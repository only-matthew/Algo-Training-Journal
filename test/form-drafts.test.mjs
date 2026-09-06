import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const formSource = fs.readFileSync(path.join(testDirectory, "..", "lib", "form.mjs"), "utf8");

test("form wires drafts through the account-scoped v2 store without reading legacy v1 data", () => {
  assert.match(formSource, /import \{ createDraftStore \} from "\.\/draft-store\.mjs"/);
  assert.match(formSource, /const memberId = ensureDraftOwner\(\);/);
  assert.match(formSource, /draftStore\.load\(memberId, date\)/);
  assert.match(formSource, /draftStore\.save\(\{ memberId, date, problems: snapshot\.problems, exists: snapshot\.exists \}\)/);
  assert.doesNotMatch(formSource, /DRAFTS_KEY/);
  assert.doesNotMatch(formSource, /loadStoredDrafts/);
  assert.doesNotMatch(formSource, /localStorage\.(?:getItem|setItem|removeItem)/);
});

test("form keeps the in-memory date draft behavior and conditionally deletes only the saved version", () => {
  assert.match(formSource, /dateDrafts\.set\(date, snapshot\)/);
  assert.match(formSource, /draftStore\.delete\(memberId, date, \{ expectedSavedAt \}\)/);
  assert.match(formSource, /expectedMemoryVersion: savedDraft\.memoryVersion/);
  assert.match(formSource, /expectedSavedAt: savedDraft\.savedAt/);
  assert.match(formSource, /if \(expectedMemoryVersion !== undefined && draftMemoryVersions\.get\(date\) !== expectedMemoryVersion\) return/);
});
