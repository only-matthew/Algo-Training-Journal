import { LOG_LIMITS } from "./log-schema.mjs";

// 单份 PDF 上限与服务端一致；一次保存的新增总量上限见 MAX_NEW_ATTACHMENT_BYTES。
export const MAX_ATTACHMENT_BYTES = LOG_LIMITS.attachmentBytes;
export const MAX_NEW_ATTACHMENT_BYTES = 2 * MAX_ATTACHMENT_BYTES;
export const ATTACHMENT_MIME = "application/pdf";

const DB_NAME = "journal-attachments";
const DB_VERSION = 1;
const STORE = "pending";

const MEMBER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isScope(memberId, date) {
  return typeof memberId === "string" && MEMBER_ID_PATTERN.test(memberId) && isDate(date);
}

/** 一个日期一条记录：避免为「列出某天全部附件」引入索引与 key range。 */
export function attachmentRecordKey(memberId, date) {
  return `${memberId}\u0000${date}`;
}

/**
 * 客户端校验，与服务端 normalizeAttachmentPart 保持同一口径：扩展名、MIME 与
 * `%PDF-` magic 三者都要对，否则用户会先看到「已选择」再在保存时被打回。
 */
export function validateAttachmentFile(file) {
  if (!file || typeof file !== "object") return "请选择 PDF 文件";
  const name = typeof file.name === "string" ? file.name : "";
  if (!name.toLowerCase().endsWith(".pdf")) return "只支持 PDF 文件";
  const type = String(file.type || "").toLowerCase();
  if (type !== ATTACHMENT_MIME) return `文件类型不是 PDF（浏览器报告为 ${file.type || "未知"}）`;
  const size = Number(file.size);
  if (!Number.isFinite(size) || size < 1) return "PDF 文件为空";
  if (size > MAX_ATTACHMENT_BYTES) return `单个 PDF 不能超过 ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MiB`;
  return null;
}

export async function sha256Hex(bytes) {
  const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 请求失败"));
  });
}

/**
 * 待上传附件的浏览器本地存储。
 *
 * 附件字节不能进 localStorage（配额小且只能存字符串），所以单独用 IndexedDB 保存
 * 「已经选好但还没成功保存到仓库」的 PDF 与抓取到本地的题面图片，让刷新或误关页面
 * 之后仍能继续提交。所有方法都返回状态而不抛异常：存储不可用（隐私模式、配额、旧
 * 浏览器）时表单必须仍能正常填写与提交——只是丢掉了本地恢复能力。
 */
export function createAttachmentStore({ indexedDB: idb = globalThis.indexedDB, dbName = DB_NAME, maxNewBytes = MAX_NEW_ATTACHMENT_BYTES } = {}) {
  let dbPromise = null;

  function open() {
    if (!idb || typeof idb.open !== "function") return Promise.resolve(null);
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        let request;
        try {
          request = idb.open(dbName, DB_VERSION);
        } catch (error) {
          reject(error);
          return;
        }
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("无法打开附件存储"));
      }).catch(() => null);
    }
    return dbPromise;
  }

  async function readRecord(memberId, date) {
    const db = await open();
    if (!db) return null;
    try {
      const tx = db.transaction(STORE, "readonly");
      const record = await requestToPromise(tx.objectStore(STORE).get(attachmentRecordKey(memberId, date)));
      return record && typeof record === "object" && record.items && typeof record.items === "object" ? record : null;
    } catch {
      return null;
    }
  }

  async function writeRecord(memberId, date, items) {
    const db = await open();
    if (!db) return { status: "unavailable" };
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      if (Object.keys(items).length) {
        await requestToPromise(store.put({ memberId, date, items, savedAt: new Date().toISOString() }, attachmentRecordKey(memberId, date)));
      } else {
        await requestToPromise(store.delete(attachmentRecordKey(memberId, date)));
      }
      return { status: "saved" };
    } catch {
      return { status: "unavailable" };
    }
  }

  /**
   * 逐条校验并归一化：IndexedDB 里的内容可能来自旧版本（早期只存 PDF，条目本身就是
   * PDF 对象）或被外部改写，坏一条不影响其余。
   */
  function normalizeItem(item) {
    if (!item || typeof item !== "object") return null;
    // 旧格式（v1 只存 PDF）：{ blob, fileName, sha256 } 直接放在条目上。
    const pdf = item.pdf && typeof item.pdf === "object" ? item.pdf : (item.blob instanceof Blob ? item : null);
    const images = Array.isArray(item.images) ? item.images.filter((image) => image && image.blob instanceof Blob && typeof image.fileName === "string" && typeof image.sha256 === "string") : [];
    // 字节数一律以 Blob 为准：旧记录可能没写 bytes，配额统计不能因此低估。
    const validPdf = pdf && pdf.blob instanceof Blob && typeof pdf.fileName === "string" && typeof pdf.sha256 === "string" ? { ...pdf, bytes: pdf.blob.size } : null;
    if (!validPdf && !images.length) return null;
    return { ...(validPdf ? { pdf: validPdf } : {}), ...(images.length ? { images: images.map((image) => ({ ...image, bytes: image.blob.size })) } : {}) };
  }

  function normalizeItems(record) {
    const items = {};
    for (const [problemId, item] of Object.entries(record?.items || {})) {
      const normalized = normalizeItem(item);
      if (normalized) items[problemId] = normalized;
    }
    return items;
  }

  function totalBytes(items) {
    let total = 0;
    for (const item of Object.values(items)) {
      total += Number(item?.pdf?.bytes) || 0;
      for (const image of item?.images || []) total += Number(image.bytes) || 0;
    }
    return total;
  }

  async function writePart(memberId, date, problemId, apply) {
    if (!isScope(memberId, date) || typeof problemId !== "string" || !problemId) return { status: "invalid_scope" };
    const record = await readRecord(memberId, date);
    const items = normalizeItems(record);
    const next = apply(items[problemId] ? { ...items[problemId] } : {});
    if (next) items[problemId] = next;
    else delete items[problemId];
    const total = totalBytes(items);
    if (total > maxNewBytes) return { status: "too_large", items };
    return writeRecord(memberId, date, items);
  }

  return Object.freeze({
    /**
     * 读取某天已选好的 PDF。返回 `problemId -> { blob, fileName, sha256, bytes }`。
     * 存储不可用或数据损坏时返回空表，调用方不需要区分。
     */
    async loadDate(memberId, date) {
      if (!isScope(memberId, date)) return { status: "invalid_scope", items: {} };
      const record = await readRecord(memberId, date);
      if (!record) return { status: "missing", items: {} };
      const items = {};
      for (const [problemId, item] of Object.entries(normalizeItems(record))) if (item.pdf) items[problemId] = item.pdf;
      return { status: "found", items };
    },

    /** 读取某天抓取到的题面图片：`problemId -> [{ blob, fileName, sha256, bytes }]`。 */
    async loadImages(memberId, date) {
      if (!isScope(memberId, date)) return { status: "invalid_scope", items: {} };
      const record = await readRecord(memberId, date);
      if (!record) return { status: "missing", items: {} };
      const items = {};
      for (const [problemId, item] of Object.entries(normalizeItems(record))) if (item.images?.length) items[problemId] = item.images;
      return { status: "found", items };
    },

    async save({ memberId, date, problemId, blob, fileName, sha256 }) {
      if (!(blob instanceof Blob) || typeof fileName !== "string" || typeof sha256 !== "string") return { status: "invalid_attachment" };
      return writePart(memberId, date, problemId, (current) => ({ ...current, pdf: { blob, fileName, sha256, bytes: blob.size } }));
    },

    async saveImages({ memberId, date, problemId, images }) {
      const list = (Array.isArray(images) ? images : []).filter((image) => image && image.blob instanceof Blob && typeof image.fileName === "string" && typeof image.sha256 === "string" && typeof image.mimeType === "string");
      if (!list.length) return { status: "invalid_attachment" };
      return writePart(memberId, date, problemId, (current) => ({ ...current, images: list.map((image) => ({ ...image, bytes: image.blob.size })) }));
    },

    async remove(memberId, date, problemId) {
      return writePart(memberId, date, problemId, (current) => (current.images?.length ? { ...current, pdf: undefined } : null));
    },

    async removeImages(memberId, date, problemId) {
      return writePart(memberId, date, problemId, (current) => (current.pdf ? { ...current, images: undefined } : null));
    },

    async clearDate(memberId, date) {
      if (!isScope(memberId, date)) return { status: "invalid_scope" };
      return writeRecord(memberId, date, {});
    },
  });
}
