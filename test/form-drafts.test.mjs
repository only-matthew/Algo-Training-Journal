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
  assert.match(formSource, /draftStore\.save\(\{ memberId, date, problems: snapshot\.problems, exists: snapshot\.exists, interval: snapshot\.interval \}\)/);
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
  // 有附件动作（PDF 或题面图片）时必须走 v2；旧接口无法上传字节。
  assert.match(formSource, /pendingAttachments\.size \|\| hasStatementImages\(\)\s*\n?\s*\? await saveWithAttachments\(/);
  // v2 的 payload 必须省略 statementAttachment：服务端对 keep 会自动沿用旧引用，
  // 而带着旧哈希回去会被判定为「keep 不能修改附件」。题面图片则只在「知道服务端现状」
  // 或「本次抓到图片」时才声明，字段缺席表示沿用旧引用。
  assert.match(formSource, /problems: problems\.map\(\(\{ statementAttachment, statementImages, \.\.\.problem \}\) => \(declared\.has\(problem\.id\) \? \{ \.\.\.problem, statementImages: declared\.get\(problem\.id\) \} : problem\)\)/);
  // 「移除」要靠显式动作表达，不能靠缺少条目表达。
  assert.match(formSource, /action: "remove"/);
  assert.match(formSource, /action: "replace", partName/);
});

test("crawled statement images are archived through the same save as the PDF", () => {
  // 图片没有独立的动作：正文里仍引用的文件才会被声明，服务端据此写文件并清理孤儿。
  assert.match(formSource, /import \{ MAX_NEW_STATEMENT_IMAGE_BYTES, MAX_STATEMENT_IMAGES, MAX_STATEMENT_IMAGE_BYTES, base64ToBytes, parseStatementImageName \} from "\.\/statement-images\.mjs"/);
  assert.match(formSource, /const pendingStatementImages = new Map\(\)/);
  assert.match(formSource, /return \[\.\.\.images\.values\(\)\]\.filter\(\(image\) => description\.includes\(image\.fileName\)\)/);
  // 已经归档过的图片不重复上传：文件名就是内容哈希。
  assert.match(formSource, /if \(!archived\.has\(image\.sha256\)\) images\.set\(image\.fileName/);
  // 抓取结果里的图片要在本题登记，并写进本地恢复存储。
  assert.match(formSource, /await attachmentStore\.saveImages\(\{ memberId, date: activeFormDate, problemId, images: decoded \}\)/);
  assert.match(formSource, /block\.dataset\.serverImages = JSON\.stringify\(images\)/);
  // 不知道服务端现状（旧草稿、旧客户端）时不声明图片，避免把仓库里已有的图片误删。
  assert.match(formSource, /const knows = block && \(block\.dataset\.serverImages !== undefined \|\| \(pendingStatementImages\.get\(problem\.id\) \|\| \[\]\)\.length\)/);
  // 草稿要带上已归档的图片引用，恢复后才知道服务端有哪些图。
  assert.match(formSource, /\.\.\.\(archived \? \{ statementImages: archived \} : \{\}\)/);
});

test("抓取题面与「浏览器回传源码」两条入口共用同一套落盘逻辑", () => {
  // AtCoder 对机房出口整体 403、浏览器跨域又读不到：只有跑在 atcoder.jp 上的小书签能取到
  // 官方页。两条入口必须走同一个结果落地函数，否则两种入口的结果会不一致。
  assert.match(formSource, /async function applyStatementResult\(div, platform, result\)/);
  assert.match(formSource, /import \{[^}]*parseProblemStatementHtml[^}]*\} from "\.\/journal-api\.js"/);
  assert.match(formSource, /class="btn-parse-statement-html"/);
  assert.match(formSource, /class="btn-copy-bookmarklet"/);
  assert.match(formSource, /const ATCODER_BOOKMARKLET = "javascript:/);
  assert.match(formSource, /await parseProblemStatementHtml\(platform, problemNumber, html\)/);
  // 题号/平台校验只写一处，两条入口都先过它。
  assert.match(formSource, /function readStatementTarget\(div\)/);
  // 被 403 拦下时要指路到小书签，而不是只说「失败」。
  assert.match(formSource, /从 AtCoder 页面导入/);
});

test("描述里已有内容时，抓到的题面必须有一步到位的替换入口", () => {
  // 曾经只给预览、不给按钮，用户看到「解析出来了」但描述没变——等于没填。
  assert.match(formSource, /class="btn-apply-statement"/);
  assert.match(formSource, /function applyStatementPreview\(div\)/);
  assert.match(formSource, /function fillStatementDescription\(div, result\)/);
  assert.match(formSource, /点「用这份题面替换描述」填入/);
  // 描述里误粘了整页源码时直接替换，不必让用户自己做选择。
  assert.match(formSource, /const PAGE_SOURCE = \/\^\\s\*\(\?:<!doctype/);
  assert.match(formSource, /描述里原本是粘贴的页面源码，已替换为解析出的题面/);
  // 重复解析同一份题面不重复写入。
  assert.match(formSource, /描述里已经是这份题面，未重复写入/);
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
