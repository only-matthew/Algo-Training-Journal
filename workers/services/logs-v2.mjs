import { LOG_LIMITS, LOG_SCHEMA_VERSION, metaFromProblems, validateLogInput, isDateString } from "../../lib/log-schema.mjs";
import {
  MAX_NEW_STATEMENT_IMAGE_BYTES,
  MAX_STATEMENT_IMAGE_BYTES,
  MAX_STATEMENT_IMAGES,
  STATEMENT_IMAGE_NAME_PATTERN,
  parseStatementImageName,
  sniffStatementImageMime,
  statementImageFileName,
} from "../../lib/statement-images.mjs";

const MAX_MULTIPART_BYTES = 12 * 1024 * 1024;
const MAX_NEW_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const PDF_LIMIT = 5 * 1024 * 1024;
const MAX_RETRIES = 3;

export class LogsV2Error extends Error {
  constructor(code, message, status = 422, extra = {}) {
    super(message); this.name = "LogsV2Error"; this.code = code; this.status = status; Object.assign(this, extra);
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const byteLength = (value) => encoder.encode(value).byteLength;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function canonical(value) {
  // `JSON.stringify(undefined)` returns the string "undefined", which would be
  // written into a receipt as a bare token and make the whole document invalid
  // JSON. Optional fields (problem.outcome, problem.fileIndex, log.updatedAt)
  // are routinely undefined, so normalise the leaf here.
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

async function digest(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function gitBlobSha(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const header = encoder.encode(`blob ${bytes.byteLength}\0`);
  const combined = new Uint8Array(header.byteLength + bytes.byteLength);
  combined.set(header); combined.set(bytes, header.byteLength);
  const hash = await crypto.subtle.digest("SHA-1", combined);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeAttachmentName(name) {
  return String(name || "statement.pdf").replace(/[\r\n\\/]/g, " ").trim().slice(0, 200) || "statement.pdf";
}

function roots(member, date) {
  const [year, month, day] = date.split("-");
  return [`logs/${member}/${year}/${month}/${day}`, `logs/${member}/${date}`];
}

/**
 * Repository path of a problem's statement PDF.
 *
 * Exported so the legacy `/api/logs/date` planner keeps the exact same filename:
 * if the two disagreed, a legacy save would fail to recognise an existing PDF and
 * delete it as an unreferenced file.
 */
export function statementPath(root, problem) {
  return `${root}/${problem.fileIndex}-statement-${problem.statementAttachment.sha256}.pdf`;
}

/**
 * Repository path of an archived statement image.
 *
 * 图片不带 fileIndex：文件名就是内容哈希，同一张图被同一天的两道题引用时只落一份，
 * 正文里的相对链接也因此与题目槽位无关（题号改动不会让图片失联）。
 */
export function statementImagePath(root, image) {
  return `${root}/${image.fileName}`;
}

const STATEMENT_IMAGE_ORPHAN = /^statement-[a-f0-9]{64}\.(?:png|jpg|gif|webp)$/;

function operationPath(memberId, operationId) {
  return `training/members/${memberId}/operations/${operationId}.json`;
}

function assertUuid(value, label = "operationId") {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new LogsV2Error("MALFORMED_REQUEST", `${label} must be a UUID v4`, 400);
  }
}

function assertDate(date) {
  if (!isDateString(date)) throw new LogsV2Error("MALFORMED_REQUEST", "Invalid log date", 400);
}

function ensureObject(value, code = "INVALID_JSON") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LogsV2Error(code, "Request must be an object", 400);
  return value;
}

function attachmentEqual(a, b) { return canonical(a || null) === canonical(b || null); }

/**
 * Content fingerprint of a set of repository files.
 *
 * Shared by the v4 date version and the legacy `/api/logs/date` version so the
 * two write paths can never disagree about what "the same snapshot" means.
 * Entries are `{ path, sha }`; order is normalised here, so callers need not
 * pre-sort.
 */
export async function revisionFromEntries(files) {
  const normalized = (files || []).map(({ path, sha }) => ({ path, sha })).sort((a, b) => a.path.localeCompare(b.path));
  const hash = await digest(encoder.encode(canonical(normalized)));
  return `sha256:${hash}`;
}

async function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value && typeof value.arrayBuffer === "function") return new Uint8Array(await value.arrayBuffer());
  throw new LogsV2Error("INVALID_MULTIPART", "Attachment part is not a file", 400);
}

async function normalizeAttachmentPart(value, partName) {
  const bytes = await asBytes(value);
  if (bytes.byteLength < 1 || bytes.byteLength > PDF_LIMIT) throw new LogsV2Error("ATTACHMENT_TOO_LARGE", "Each PDF must be between 1 byte and 5 MiB", 413);
  const type = String(value?.type || "").toLowerCase();
  const name = safeAttachmentName(value?.name);
  if (!name.toLowerCase().endsWith(".pdf") || type !== "application/pdf" || decoder.decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new LogsV2Error("INVALID_PDF", `Attachment ${partName} is not a PDF`, 422);
  }
  return { bytes, sha256: await digest(bytes), fileName: name, mimeType: "application/pdf" };
}

/**
 * 题面图片分区：分区名就是仓库文件名（statement-<sha256>.<ext>），内容哈希与文件名
 * 必须一致——服务端只凭引用拼路径，不能让请求指定任意文件名。
 */
async function normalizeStatementImagePart(value, partName) {
  const named = parseStatementImageName(partName);
  if (!named) throw new LogsV2Error("INVALID_IMAGE", `Image part ${partName} is not statement-<sha256>.<ext>`, 422);
  const bytes = await asBytes(value);
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_STATEMENT_IMAGE_BYTES) throw new LogsV2Error("ATTACHMENT_TOO_LARGE", "Each statement image must be between 1 byte and 1 MiB", 413);
  const mimeType = sniffStatementImageMime(bytes);
  if (mimeType !== named.mimeType) throw new LogsV2Error("INVALID_IMAGE", `Image ${partName} does not match its extension`, 422);
  const sha256 = await digest(bytes);
  if (statementImageFileName(sha256, mimeType) !== partName) throw new LogsV2Error("INVALID_IMAGE", `Image ${partName} does not match its content`, 422);
  return { bytes, sha256, fileName: partName, mimeType };
}

/** Parse either the JSON body or the documented multipart payload + PDF/image parts. */
export async function parseLogsV2Request(request) {
  const contentType = request.headers.get("Content-Type") || "";
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_MULTIPART_BYTES) throw new LogsV2Error("REQUEST_TOO_LARGE", "Request exceeds 12 MiB", 413);
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    const text = await request.text();
    if (byteLength(text) > LOG_LIMITS.maxRequestBytes) throw new LogsV2Error("REQUEST_TOO_LARGE", "JSON request exceeds 1.5 MB", 413);
    try { return { payload: ensureObject(JSON.parse(text)), attachments: new Map(), images: new Map() }; }
    catch (error) { if (error instanceof LogsV2Error) throw error; throw new LogsV2Error("INVALID_JSON", "Request is not valid JSON", 400); }
  }
  let form;
  try { form = await request.formData(); } catch { throw new LogsV2Error("INVALID_MULTIPART", "Malformed multipart body", 400); }
  const payloadRaw = form.get("payload");
  if (typeof payloadRaw !== "string") throw new LogsV2Error("INVALID_MULTIPART", "Multipart requests require a payload JSON part", 400);
  if (byteLength(payloadRaw) > LOG_LIMITS.maxRequestBytes) throw new LogsV2Error("REQUEST_TOO_LARGE", "JSON payload exceeds 1.5 MB", 413);
  let payload;
  try { payload = ensureObject(JSON.parse(payloadRaw)); } catch { throw new LogsV2Error("INVALID_JSON", "payload is not valid JSON", 400); }
  const attachments = new Map(); const images = new Map(); let total = byteLength(payloadRaw);
  for (const [name, value] of form.entries()) {
    if (name === "payload") continue;
    if (images.has(name) || attachments.has(name)) throw new LogsV2Error("INVALID_MULTIPART", `Duplicate multipart part ${name}`, 400);
    const image = STATEMENT_IMAGE_NAME_PATTERN.test(name);
    const part = image ? await normalizeStatementImagePart(value, name) : await normalizeAttachmentPart(value, name);
    total += part.bytes.byteLength;
    if (total > MAX_MULTIPART_BYTES) throw new LogsV2Error("REQUEST_TOO_LARGE", "Multipart request exceeds 12 MiB", 413);
    if (image) images.set(name, part); else attachments.set(name, part);
  }
  if (images.size > MAX_STATEMENT_IMAGES * LOG_LIMITS.maxProblems) throw new LogsV2Error("ATTACHMENT_TOO_LARGE", "Too many statement images in one request", 413);
  return { payload, attachments, images };
}

function validateChanges(changes, problems, attachments, multipart) {
  if (changes === undefined) return new Map();
  if (!Array.isArray(changes)) throw new LogsV2Error("INVALID_ATTACHMENT_REFERENCE", "attachmentChanges must be an array");
  const ids = new Set(problems.map((problem) => problem.id)); const result = new Map(); const parts = new Set();
  for (const change of changes) {
    if (!change || typeof change !== "object" || Object.keys(change).some((key) => !["recordId", "action", "partName"].includes(key)) || !ids.has(change.recordId) || !["keep", "replace", "remove"].includes(change.action) || result.has(change.recordId)) {
      throw new LogsV2Error("INVALID_ATTACHMENT_REFERENCE", "Invalid attachment change");
    }
    if (change.action === "replace") {
      if (!multipart || typeof change.partName !== "string" || !attachments.has(change.partName) || parts.has(change.partName)) throw new LogsV2Error("INVALID_ATTACHMENT_REFERENCE", "replace must reference one unique PDF part");
      parts.add(change.partName);
    } else if (own(change, "partName")) throw new LogsV2Error("INVALID_ATTACHMENT_REFERENCE", "Only replace may specify partName");
    result.set(change.recordId, change);
  }
  if ([...attachments.keys()].some((name) => !parts.has(name))) throw new LogsV2Error("INVALID_ATTACHMENT_REFERENCE", "Every PDF part must be referenced exactly once");
  return result;
}

function checkLogVersion(log) {
  // Accept an in-flight v1–v5 editor snapshot, then normalize and persist the current version.
  // This is compatibility at the API boundary, not a legacy write format.
  if (log?.schemaVersion !== undefined && (!Number.isInteger(log.schemaVersion) || log.schemaVersion < 1 || log.schemaVersion > LOG_SCHEMA_VERSION)) throw new LogsV2Error("UNSUPPORTED_SCHEMA", "Unsupported log schema version", 422);
}

/**
 * 校验题面图片引用。
 *
 * 与 PDF 不同，图片没有单独的 change 动作：payload 里每题的 `statementImages` 就是该题
 * 期望的完整集合，服务端据此决定上传、保留与删除。每个引用要么带上了对应分区，要么
 * 仓库里已有同名文件（文件名即内容哈希，存在即内容一致）。
 */
function validateStatementImages(problems, images, root, existingPaths) {
  const declared = new Set();
  for (const problem of problems) for (const image of problem.statementImages || []) {
    const path = statementImagePath(root, image);
    if (declared.has(path)) continue;
    declared.add(path);
    const upload = images.get(image.fileName);
    if (upload ? upload.sha256 !== image.sha256 || upload.bytes.byteLength !== image.bytes : !existingPaths.has(path)) {
      throw new LogsV2Error("INVALID_ATTACHMENT_REFERENCE", `Statement image ${image.fileName} was not uploaded`, 422);
    }
  }
  for (const name of images.keys()) if (!declared.has(`${root}/${name}`)) throw new LogsV2Error("INVALID_ATTACHMENT_REFERENCE", `Image part ${name} is not referenced by any problem`, 422);
  return declared;
}

function knownTextPaths(root, problems) {
  const paths = new Set([`${root}/meta.json`]);
  for (const problem of problems) for (const suffix of ["takeaway.md", "desc.md", "solution.cpp"]) paths.add(`${root}/${problem.fileIndex}-${suffix}`);
  return paths;
}

function textChanges(root, previous, next, interval, timestamp) {
  const changes = [{ path: `${root}/meta.json`, content: `${JSON.stringify(metaFromProblems(next, timestamp, interval), null, 2)}\n` }];
  for (const problem of next) {
    changes.push({ path: `${root}/${problem.fileIndex}-takeaway.md`, content: problem.takeaway || "未填写" });
    if (problem.description) changes.push({ path: `${root}/${problem.fileIndex}-desc.md`, content: problem.description });
    if (problem.code) changes.push({ path: `${root}/${problem.fileIndex}-solution.cpp`, content: problem.code });
  }
  const desired = knownTextPaths(root, next);
  for (const path of knownTextPaths(root, previous)) if (!desired.has(path)) changes.push({ path, delete: true });
  return changes;
}

async function decodeLog(snapshot, root, files) {
  const metaPath = `${root}/meta.json`;
  if (!files.some((file) => file.path === metaPath)) return { exists: false, root, files, log: { schemaVersion: LOG_SCHEMA_VERSION, problems: [] }, interval: {} };
  let meta;
  try { meta = JSON.parse(await snapshot.readFile(metaPath)); } catch { throw new LogsV2Error("STORAGE_UNAVAILABLE", "Stored log metadata is invalid", 502); }
  if (meta.schemaVersion !== undefined && meta.schemaVersion > LOG_SCHEMA_VERSION) throw new LogsV2Error("UNSUPPORTED_SCHEMA", "Stored log uses a newer schema", 422);
  const paths = new Set(files.map((file) => file.path));
  const raw = { ...meta, problems: await Promise.all((meta.problems || []).map(async (problem, index) => {
    const fileIndex = Number.isInteger(problem.fileIndex) ? problem.fileIndex : index;
    return { ...problem, fileIndex, description: paths.has(`${root}/${fileIndex}-desc.md`) ? await snapshot.readFile(`${root}/${fileIndex}-desc.md`) : "", takeaway: paths.has(`${root}/${fileIndex}-takeaway.md`) ? await snapshot.readFile(`${root}/${fileIndex}-takeaway.md`) : "", code: paths.has(`${root}/${fileIndex}-solution.cpp`) ? await snapshot.readFile(`${root}/${fileIndex}-solution.cpp`) : "" };
  })) };
  // validateLogInput also normalizes v3 records into the v4 compatible shape.
  const parsed = validateLogInput(raw);
  return { exists: true, root, files, log: parsed, interval: { startedOn: parsed.startedOn, solvedOn: parsed.solvedOn } };
}

async function snapshotDate(git, head, member, date) {
  const snapshot = { head, readFile: (path) => git.readFile(head, path), readBytes: (path) => git.readBytes(head, path) };
  // The date version is a fingerprint of { path, blob sha }, so the adapter must
  // list entries with their Git blob SHA. `listFiles` only returns paths and
  // would silently produce a manifest without hashes. Both listing methods use
  // the same (snapshot, prefix) call shape as `listFiles`.
  const listEntries = async (prefix) => {
    if (typeof git.listFileEntries === "function") return git.listFileEntries({ head }, prefix);
    const paths = await git.listFiles({ head }, prefix);
    return paths.map((entry) => (typeof entry === "string" ? { path: entry } : entry));
  };
  for (const root of roots(member, date)) {
    const files = await listEntries(`${root}/`);
    if (files.length) return { snapshot, ...(await decodeLog(snapshot, root, files)) };
  }
  const root = roots(member, date)[0];
  return { snapshot, ...(await decodeLog(snapshot, root, [])) };
}

function receiptResult(receipt, hash) {
  if (!receipt || receipt.requestHash !== hash) throw new LogsV2Error("IDEMPOTENCY_CONFLICT", "operationId was used for another request", 409);
  return receipt.result;
}

export function createLogsV2Service({ git, now = () => new Date().toISOString(), planAuxiliaryChanges = async () => [] } = {}) {
  if (!git || !["getHead", "listFiles", "readFile", "readBytes", "commit"].every((name) => typeof git[name] === "function")) throw new TypeError("git must provide getHead, listFiles, readFile, readBytes, commit");

  async function read({ member, date }) {
    assertDate(date); const state = await snapshotDate(git, await git.getHead(), member, date);
    return { log: state.log, version: state.exists ? await revisionFromEntries(state.files) : null };
  }

  async function save({ memberId, member, date, operationId, expectedVersion, log, attachmentChanges, attachments = new Map(), images = new Map() }) {
    assertDate(date); assertUuid(operationId); checkLogVersion(log);
    // A replace request may carry only pageRange in the JSON; the server derives
    // hash, byte length and MIME from the actual multipart bytes below.
    const validationLog = structuredClone(log);
    for (const change of attachmentChanges || []) {
      if (change?.action !== "replace") continue;
      const upload = attachments.get(change.partName);
      const entry = validationLog.problems?.find((problem) => problem?.id === change.recordId);
      if (upload && entry) entry.statementAttachment = { sha256: upload.sha256, fileName: upload.fileName, bytes: upload.bytes.byteLength, mimeType: upload.mimeType, ...(entry.statementAttachment?.pageRange ? { pageRange: entry.statementAttachment.pageRange } : {}) };
    }
      const parsed = validateLogInput(validationLog);
    // Assign stable per-day file slots before constructing text and PDF paths.
    const occupied = new Set(parsed.problems.filter((problem) => Number.isInteger(problem.fileIndex)).map((problem) => problem.fileIndex));
    let nextFileIndex = 0;
    for (const problem of parsed.problems) {
      if (Number.isInteger(problem.fileIndex)) continue;
      while (occupied.has(nextFileIndex)) nextFileIndex += 1;
      problem.fileIndex = nextFileIndex;
      occupied.add(nextFileIndex);
      nextFileIndex += 1;
    }
    if (typeof expectedVersion !== "string" && expectedVersion !== null) throw new LogsV2Error("MALFORMED_REQUEST", "expectedVersion must be a version or null", 400);
    const requestHash = await digest(encoder.encode(canonical({ date, expectedVersion, log: parsed, attachmentChanges: attachmentChanges || [], attachments: [...attachments.entries()].map(([name, file]) => ({ name, sha256: file.sha256 })), images: [...images.keys()] })));
    const receiptPath = operationPath(memberId, operationId);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const head = await git.getHead();
      const oldReceipt = await git.readFile(head, receiptPath);
      if (oldReceipt) { try { return receiptResult(JSON.parse(oldReceipt), requestHash); } catch (error) { if (error instanceof LogsV2Error) throw error; throw new LogsV2Error("STORAGE_UNAVAILABLE", "Stored operation receipt is invalid", 502, { cause: error }); } }
      const state = await snapshotDate(git, head, member, date); const currentVersion = state.exists ? await revisionFromEntries(state.files) : null;
      if (currentVersion !== expectedVersion) throw new LogsV2Error("VERSION_CONFLICT", "The log changed; reload before saving", 409, { currentRevision: currentVersion });
      const changesById = validateChanges(attachmentChanges, parsed.problems, attachments, attachments.size > 0);
      const oldById = new Map(state.log.problems.map((problem) => [problem.id, problem]));
      let newBytes = 0;
      let newImageBytes = 0;
      const existingPaths = new Set(state.files.map((file) => file.path));
      for (const problem of parsed.problems) {
        const old = oldById.get(problem.id); const action = changesById.get(problem.id)?.action || "keep";
        // 旧客户端不带 statementImages：沿用服务端已有的引用，不能当成「清空」。
        if (!own(problem, "statementImages") && old?.statementImages?.length) problem.statementImages = old.statementImages;
        if (action === "keep") {
          if (old?.statementAttachment) {
            if (own(problem, "statementAttachment") && !attachmentEqual(problem.statementAttachment, old.statementAttachment)) throw new LogsV2Error("INVALID_ATTACHMENT_REFERENCE", "keep cannot change an attachment");
            problem.statementAttachment = old.statementAttachment;
          } else if (own(problem, "statementAttachment")) throw new LogsV2Error("INVALID_ATTACHMENT_REFERENCE", "A new attachment requires replace");
        } else if (action === "remove") {
          if (own(problem, "statementAttachment")) throw new LogsV2Error("INVALID_ATTACHMENT_REFERENCE", "remove must omit statementAttachment");
        } else {
          const upload = attachments.get(changesById.get(problem.id).partName); newBytes += upload.bytes.byteLength;
          problem.statementAttachment = { sha256: upload.sha256, fileName: upload.fileName, bytes: upload.bytes.byteLength, mimeType: upload.mimeType, ...(problem.statementAttachment?.pageRange ? { pageRange: problem.statementAttachment.pageRange } : {}) };
        }
      }
      const declaredImages = validateStatementImages(parsed.problems, images, state.root, existingPaths);
      for (const image of images.values()) if (!existingPaths.has(`${state.root}/${image.fileName}`)) newImageBytes += image.bytes.byteLength;
      if (newImageBytes > MAX_NEW_STATEMENT_IMAGE_BYTES) throw new LogsV2Error("ATTACHMENT_TOO_LARGE", "New statement images exceed 2 MiB", 413);
      if (newBytes > MAX_NEW_ATTACHMENT_BYTES) throw new LogsV2Error("ATTACHMENT_TOO_LARGE", "New PDFs exceed 10 MiB", 413);
      // Date files and everything else are tracked separately: the date version is
      // a fingerprint of this day's own files (plus attachment blobs), so personal
      // indexes written moment-to-moment elsewhere in the repository can never
      // change it. Only changes under the resolved log root count.
      const dateChanges = new Map();
      const sideChanges = new Map();
      for (const change of textChanges(state.root, state.log.problems, parsed.problems, parsed, now())) dateChanges.set(change.path, change);
      for (const old of state.log.problems) {
        const next = parsed.problems.find((problem) => problem.id === old.id);
        if (old.statementAttachment && (!next || !attachmentEqual(old.statementAttachment, next.statementAttachment))) dateChanges.set(statementPath(state.root, old), { path: statementPath(state.root, old), delete: true });
      }
      for (const problem of parsed.problems) {
        const action = changesById.get(problem.id);
        if (action?.action === "replace") {
          const upload = attachments.get(action.partName); const path = statementPath(state.root, problem);
          dateChanges.set(path, { path, content: base64(upload.bytes), encoding: "base64", binary: upload.bytes });
        }
      }
      // 题面图片：上传本次新增的，删掉这一天里已不再被任何题目引用的。
      for (const image of images.values()) {
        const path = `${state.root}/${image.fileName}`;
        if (existingPaths.has(path)) continue;
        dateChanges.set(path, { path, content: base64(image.bytes), encoding: "base64", binary: image.bytes });
      }
      for (const path of existingPaths) {
        if (!path.startsWith(`${state.root}/`) || !STATEMENT_IMAGE_ORPHAN.test(path.slice(state.root.length + 1))) continue;
        if (!declaredImages.has(path)) dateChanges.set(path, { path, delete: true });
      }
      for (const extra of await planAuxiliaryChanges({ snapshot: state.snapshot, memberId, member, date, problems: parsed.problems })) sideChanges.set(extra.path, extra);
      // The version this save reports must equal the version a later read computes
      // for the same snapshot, and it must only cover this day's own files: the
      // personal index is rewritten elsewhere in the repository and would make the
      // version change on its own. Attachment blobs live under the log root, so
      // they stay covered.
      const inDate = (path) => path.startsWith(`${state.root}/`);
      const predicted = new Map(state.files.filter((file) => inDate(file.path)).map((file) => [file.path, file.sha]));
      for (const item of dateChanges.values()) {
        if (item.delete) predicted.delete(item.path);
        else predicted.set(item.path, await gitBlobSha(item.binary || item.content));
      }
      const result = { log: { ...parsed, updatedAt: undefined }, version: await revisionFromEntries([...predicted.entries()].map(([path, sha]) => ({ path, sha }))), publicationStatus: "pending" };
      const receipt = { schemaVersion: 1, operationId, memberId, requestHash, recordedAt: now(), result };
      const changes = new Map([...dateChanges, ...sideChanges]);
      changes.set(receiptPath, { path: receiptPath, content: `${canonical(receipt)}\n` });
      try {
        const commit = await git.commit({ head, changes: [...changes.values()], message: `save(${member}): training log for ${date}` });
        return { ...result, commitSha: commit.commitSha || commit.sha };
      } catch (error) {
        if (error?.code !== "REF_CONFLICT" || attempt === MAX_RETRIES - 1) {
          if (error?.code === "REF_CONFLICT") throw new LogsV2Error("WRITE_CONTENTION", "The log changed repeatedly while saving", 409);
          throw error;
        }
      }
    }
  }

  async function remove({ memberId, member, date, operationId, expectedVersion }) {
    assertDate(date); assertUuid(operationId);
    const requestHash = await digest(encoder.encode(canonical({ date, expectedVersion, delete: true })));
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const head = await git.getHead(); const receiptPath = operationPath(memberId, operationId); const receipt = await git.readFile(head, receiptPath);
      if (receipt) return receiptResult(JSON.parse(receipt), requestHash);
      const state = await snapshotDate(git, head, member, date); const version = state.exists ? await revisionFromEntries(state.files) : null;
      if (version !== expectedVersion) throw new LogsV2Error("VERSION_CONFLICT", "The log changed; reload before deleting", 409, { currentRevision: version });
      if (!state.exists) throw new LogsV2Error("NOT_FOUND", "Log does not exist", 404);
      const changes = state.files.map((file) => ({ path: file.path, delete: true }));
      for (const extra of await planAuxiliaryChanges({ snapshot: state.snapshot, memberId, member, date, problems: [] })) changes.push(extra);
      const result = { deleted: true, version: null, publicationStatus: "pending" };
      changes.push({ path: receiptPath, content: `${canonical({ schemaVersion: 1, operationId, memberId, requestHash, recordedAt: now(), result })}\n` });
      try { const commit = await git.commit({ head, changes, message: `delete(${member}): training log for ${date}` }); return { ...result, commitSha: commit.commitSha || commit.sha }; }
      catch (error) { if (error?.code !== "REF_CONFLICT" || attempt === MAX_RETRIES - 1) throw error?.code === "REF_CONFLICT" ? new LogsV2Error("WRITE_CONTENTION", "The log changed repeatedly while deleting", 409) : error; }
    }
  }

  async function statement({ member, date, recordId }) {
    const state = await snapshotDate(git, await git.getHead(), member, date);
    const problem = state.log.problems.find((item) => item.id === recordId);
    if (!problem?.statementAttachment) throw new LogsV2Error("NOT_FOUND", "Statement attachment not found", 404);
    const bytes = await state.snapshot.readBytes(statementPath(state.root, problem));
    if (!bytes) throw new LogsV2Error("STORAGE_UNAVAILABLE", "Statement attachment is missing", 502);
    return { bytes, fileName: safeAttachmentName(problem.statementAttachment.fileName), sha256: problem.statementAttachment.sha256 };
  }

  /** 已归档的题面图片：只认 meta 里登记过的引用，路径由文件名（内容哈希）拼出。 */
  async function statementImage({ member, date, recordId, fileName }) {
    const image = parseStatementImageName(fileName);
    if (!image) throw new LogsV2Error("NOT_FOUND", "Statement image not found", 404);
    const state = await snapshotDate(git, await git.getHead(), member, date);
    const problem = state.log.problems.find((item) => item.id === recordId);
    if (!problem?.statementImages?.some((entry) => entry.sha256 === image.sha256)) throw new LogsV2Error("NOT_FOUND", "Statement image not found", 404);
    const bytes = await state.snapshot.readBytes(statementImagePath(state.root, image));
    if (!bytes) throw new LogsV2Error("STORAGE_UNAVAILABLE", "Statement image is missing", 502);
    return { bytes, fileName: image.fileName, sha256: image.sha256, mimeType: image.mimeType };
  }

  return Object.freeze({ read, save, remove, statement, statementImage });
}

function base64(bytes) {
  let result = ""; const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) result += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  return btoa(result);
}
