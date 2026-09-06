const DRAFT_PREFIX = "journal-drafts-v2:";
export const DRAFT_VERSION = 2;
export const MAX_DRAFT_BYTES = Math.floor(1.2 * 1024 * 1024);
export const MAX_TOTAL_DRAFT_BYTES = 4 * 1024 * 1024;

const MEMBER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;

export function utf8ByteLength(value) {
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
}

export function draftStorageKey(memberId, date) {
  return `${DRAFT_PREFIX}${memberId}:${date}`;
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isScope(memberId, date) {
  return typeof memberId === "string" && MEMBER_ID_PATTERN.test(memberId) && isDate(date);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseDraft(raw, memberId, date) {
  if (typeof raw !== "string") return null;
  try {
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== "object" || Array.isArray(draft)
      || draft.draftVersion !== DRAFT_VERSION
      || draft.memberId !== memberId
      || draft.date !== date
      || !Array.isArray(draft.problems)
      || (draft.exists !== undefined && typeof draft.exists !== "boolean")
      || (draft.baseRevision !== null && typeof draft.baseRevision !== "string")
      || typeof draft.savedAt !== "string"
      || Number.isNaN(Date.parse(draft.savedAt))) {
      return null;
    }
    return clone(draft);
  } catch {
    return null;
  }
}

/**
 * Creates the browser-only v2 draft repository. `storage` follows the small
 * localStorage surface, so callers and tests can provide an in-memory adapter.
 */
export function createDraftStore({
  storage = globalThis.localStorage,
  now = () => new Date().toISOString(),
  maxDraftBytes = MAX_DRAFT_BYTES,
  maxTotalBytes = MAX_TOTAL_DRAFT_BYTES,
} = {}) {
  let lastSavedAt = -Infinity;

  function nextSavedAt() {
    const current = now();
    const timestamp = Date.parse(current);
    if (typeof current !== "string" || Number.isNaN(timestamp)) return null;
    const nextTimestamp = Math.max(timestamp, lastSavedAt + 1);
    lastSavedAt = nextTimestamp;
    return new Date(nextTimestamp).toISOString();
  }

  function totalBytes(replaceKey, replaceRaw) {
    let total = 0;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(DRAFT_PREFIX)) continue;
      const raw = key === replaceKey ? replaceRaw : storage.getItem(key);
      if (raw !== null) total += utf8ByteLength(key) + utf8ByteLength(raw);
    }
    if (replaceRaw !== null && storage.getItem(replaceKey) === null) {
      total += utf8ByteLength(replaceKey) + utf8ByteLength(replaceRaw);
    }
    return total;
  }

  return Object.freeze({
    load(memberId, date) {
      if (!isScope(memberId, date)) return { status: "invalid_scope", draft: null };
      try {
        const raw = storage.getItem(draftStorageKey(memberId, date));
        if (raw === null) return { status: "missing", draft: null };
        const draft = parseDraft(raw, memberId, date);
        return draft ? { status: "found", draft } : { status: "invalid_draft", draft: null };
      } catch {
        return { status: "unavailable", draft: null };
      }
    },

    save({ memberId, date, baseRevision = null, problems, exists } = {}) {
      if (!isScope(memberId, date) || !Array.isArray(problems)
        || (baseRevision !== null && typeof baseRevision !== "string")
        || (exists !== undefined && typeof exists !== "boolean")) {
        return { status: "invalid_draft", draft: null };
      }

      let draft;
      let raw;
      try {
        const savedAt = nextSavedAt();
        if (!savedAt) return { status: "invalid_draft", draft: null };
        draft = { draftVersion: DRAFT_VERSION, memberId, date, baseRevision, problems: clone(problems), ...(exists === undefined ? {} : { exists }), savedAt };
        raw = JSON.stringify(draft);
      } catch {
        return { status: "invalid_draft", draft: null };
      }

      if (utf8ByteLength(raw) > maxDraftBytes) return { status: "draft_too_large", draft: null };
      const key = draftStorageKey(memberId, date);
      try {
        if (totalBytes(key, raw) > maxTotalBytes) return { status: "total_too_large", draft: null };
        // localStorage keeps the old value when setItem throws (for example, on quota failure).
        storage.setItem(key, raw);
        return { status: "saved", draft: clone(draft) };
      } catch {
        return { status: "unavailable", draft: null };
      }
    },

    delete(memberId, date, { expectedSavedAt } = {}) {
      if (!isScope(memberId, date)) return { status: "invalid_scope" };
      if (expectedSavedAt !== undefined && typeof expectedSavedAt !== "string") return { status: "invalid_draft" };
      const key = draftStorageKey(memberId, date);
      try {
        const raw = storage.getItem(key);
        if (raw === null) return { status: "missing" };
        if (expectedSavedAt !== undefined) {
          const draft = parseDraft(raw, memberId, date);
          if (!draft || draft.savedAt !== expectedSavedAt) return { status: "changed" };
        }
        storage.removeItem(key);
        return { status: "deleted" };
      } catch {
        return { status: "unavailable" };
      }
    },
  });
}
