/**
 * Git-backed transaction coordinator.
 *
 * The adapter deliberately has a small contract:
 *   - getHead() -> commit SHA, or { sha }
 *   - readFile(head, path) -> UTF-8 file contents, or null when absent
 *   - commit({ head, changes, message }) -> { commitSha }, or throws an error
 *
 * `commit` must create the tree/commit and perform a non-force ref update using
 * `head` as its expected parent.  It must mark that ref-update race with
 * `error.code === "REF_CONFLICT"`; other upstream errors are not retried.
 */

const MAX_ATTEMPTS = 3;

export class GitTransactionError extends Error {
  constructor(code, message, { status, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "GitTransactionError";
    this.code = code;
    this.status = status;
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function operationFile(memberId, operationId) {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(memberId)) {
    throw new TypeError("memberId must be a configured member slug");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
    throw new TypeError("operationId must be a UUID");
  }
  return `training/members/${memberId}/operations/${operationId}.json`;
}

function headSha(head) {
  const sha = typeof head === "string" ? head : head?.sha;
  if (!sha || typeof sha !== "string") throw new TypeError("git.getHead() must return a commit SHA");
  return sha;
}

function parseReceipt(raw, path) {
  try {
    const receipt = JSON.parse(raw);
    if (!receipt || typeof receipt !== "object" || typeof receipt.requestHash !== "string" || !Object.hasOwn(receipt, "result")) {
      throw new Error("missing required receipt fields");
    }
    return receipt;
  } catch (cause) {
    throw new GitTransactionError("INVALID_RECEIPT", `Invalid operation receipt at ${path}`, { status: 502, cause });
  }
}

function isRefConflict(error) {
  return error?.code === "REF_CONFLICT";
}

/**
 * Run one atomic Git transaction with durable idempotency receipts.
 *
 * `validate(snapshot)` and `plan(snapshot)` are invoked only after the receipt
 * is checked in that exact snapshot. `plan` returns `{ changes, result,
 * message? }`; its changes and the new receipt are committed together.
 */
export async function runGitTransaction({
  git,
  memberId,
  operationId,
  requestHash,
  validate = async () => {},
  plan,
  message = "save training data",
  now = () => new Date().toISOString(),
  maxAttempts = MAX_ATTEMPTS,
}) {
  if (!git || typeof git.getHead !== "function" || typeof git.readFile !== "function" || typeof git.commit !== "function") {
    throw new TypeError("git adapter must provide getHead, readFile, and commit");
  }
  if (typeof requestHash !== "string" || !requestHash) throw new TypeError("requestHash is required");
  if (typeof plan !== "function") throw new TypeError("plan callback is required");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new TypeError("maxAttempts must be a positive integer");

  const receiptPath = operationFile(memberId, operationId);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const head = headSha(await git.getHead());
    const snapshot = Object.freeze({
      head,
      attempt,
      memberId,
      operationId,
      requestHash,
      readFile: (path) => git.readFile(head, path),
    });

    // This lookup intentionally precedes validation: retrying a saved command
    // must succeed even if its original resource versions are now stale.
    const receiptRaw = await snapshot.readFile(receiptPath);
    if (receiptRaw !== null && receiptRaw !== undefined) {
      const receipt = parseReceipt(receiptRaw, receiptPath);
      if (receipt.requestHash !== requestHash) {
        throw new GitTransactionError("IDEMPOTENCY_REUSE", "Idempotency key was already used for a different request", { status: 409 });
      }
      return {
        ...receipt.result,
        operation: { id: operationId, state: "saved", replayed: true },
        snapshotCommitSha: head,
      };
    }

    await validate(snapshot);
    const planned = await plan(snapshot);
    if (!planned || !Array.isArray(planned.changes) || !Object.hasOwn(planned, "result")) {
      throw new TypeError("plan callback must return { changes, result, message? }");
    }
    if (planned.changes.some((change) => change?.path === receiptPath)) {
      throw new TypeError("plan callback must not write the operation receipt path");
    }

    const receipt = {
      schemaVersion: 1,
      operationId,
      memberId,
      requestHash,
      recordedAt: now(),
      result: planned.result,
    };
    const changes = [...planned.changes, { path: receiptPath, content: `${canonicalJson(receipt)}\n` }];
    try {
      const committed = await git.commit({ head, changes, message: planned.message || message });
      const snapshotCommitSha = committed?.commitSha || committed?.sha;
      if (typeof snapshotCommitSha !== "string" || !snapshotCommitSha) {
        throw new TypeError("git.commit() must return the committed SHA");
      }
      return {
        ...planned.result,
        operation: { id: operationId, state: "saved", replayed: false },
        snapshotCommitSha,
      };
    } catch (error) {
      if (!isRefConflict(error)) throw error;
      if (attempt === maxAttempts) {
        throw new GitTransactionError("WRITE_CONTENTION", "Git reference changed repeatedly while saving", { status: 409, cause: error });
      }
    }
  }
  throw new Error("unreachable");
}

