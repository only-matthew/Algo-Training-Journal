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

test("every form save is conditional on the revision it read", () => {
  // 无条件写入会被服务端以 428 拒绝；这里守住「保存/删除都必须带上版本」这条线。
  assert.match(formSource, /const revision = await ensureFormRevision\(date\)/);
  assert.match(formSource, /await saveDateLog\(date, problems, interval, revision\)/);
  assert.match(formSource, /await deleteDateLog\(date, revision\)/);
  // 连续保存不需要重新加载页面：服务端回传的版本要写回本地状态。
  assert.match(formSource, /activeFormRevision = result\?\.revision \?\? null/);
});

test("attachments only travel through the v2 multipart route", () => {
  assert.match(formSource, /import \{ createAttachmentStore, sha256Hex, validateAttachmentFile \} from "\.\/attachment-store\.mjs"/);
  assert.match(formSource, /import \{[^}]*saveDateLogV2[^}]*\} from "\.\/journal-api\.js"/);
  // 有附件动作时必须走 v2；旧接口无法上传字节。
  assert.match(formSource, /pendingAttachments\.size\s*\n?\s*\? await saveWithAttachments\(/);
  // v2 的 payload 必须省略 statementAttachment：服务端对 keep 会自动沿用旧引用，
  // 而带着旧哈希回去会被判定为「keep 不能修改附件」。
  assert.match(formSource, /problems: problems\.map\(\(\{ statementAttachment, \.\.\.problem \}\) => problem\)/);
  // 「移除」要靠显式动作表达，不能靠缺少条目表达。
  assert.match(formSource, /action: "remove"/);
  assert.match(formSource, /action: "replace", partName/);
});

test("a saved attachment updates both the picker state and the legacy round-trip field", () => {
  // 只更新其中一处，会让下一次纯文字保存带着过期哈希被 422 拒绝。
  assert.match(formSource, /block\.dataset\.serverAttachment = JSON\.stringify\(attachment\)/);
  assert.match(formSource, /enrichment\.statementAttachment = attachment/);
  assert.match(formSource, /await attachmentStore\.clearDate\(memberId, date\)/);
});

test("pending PDFs are restored from IndexedDB only for the date still being edited", () => {
  assert.match(formSource, /if \(date !== activeFormDate \|\| memberId !== currentDraftOwner\(\)\) return/);
  assert.match(formSource, /await attachmentStore\.loadDate\(memberId, date\)/);
});
