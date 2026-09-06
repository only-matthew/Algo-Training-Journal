import {
  TRAINING_SCHEMA_VERSION,
  validateAttemptEvent,
  validatePlan,
  validateProfile,
  validateReview,
  validateSelfAssessment,
} from "../../lib/training-schema.mjs";
import { subjectKeyForProblem } from "../../lib/problem-identity.mjs";
import { projectReviewSchedule } from "../../lib/training-projections.mjs";
import { runGitTransaction } from "../storage/git-transaction.mjs";

export class TrainingServiceError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.name = "TrainingServiceError";
    this.code = code;
    this.status = status;
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value) {
  return sha256(typeof value === "string" ? value : canonicalJson(value));
}

function requireMemberId(memberId) {
  if (typeof memberId !== "string" || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(memberId)) {
    throw new TrainingServiceError("VALIDATION_FAILED", "memberId is invalid");
  }
  return memberId;
}

function requireSafeNodeId(nodeId) {
  if (typeof nodeId !== "string" || !nodeId || nodeId.includes("/") || nodeId.includes("\\") || nodeId === "." || nodeId === "..") {
    throw new TrainingServiceError("VALIDATION_FAILED", "nodeId cannot be used as a storage path");
  }
  return nodeId;
}

export function trainingPaths(memberId) {
  const member = requireMemberId(memberId);
  const root = `training/members/${member}`;
  return Object.freeze({
    root,
    profile: `${root}/profile.json`,
    sequence: `${root}/sequence.json`,
    plan: (date) => `${root}/plans/${date}.json`,
    event: (recordedAt, id) => `${root}/events/${recordedAt.slice(0, 7)}/${id}.json`,
    review: (subjectHash) => `${root}/reviews/${subjectHash}.json`,
    assessment: (nodeId) => `${root}/assessments/${requireSafeNodeId(nodeId)}.json`,
  });
}

function asObject(input, name) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TrainingServiceError("VALIDATION_FAILED", `${name} must be an object`);
  return input;
}

function noUnknown(input, allowed, name) {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new TrainingServiceError("VALIDATION_FAILED", `${name} contains an unknown field: ${key}`);
  }
}

function parseJson(raw, path) {
  if (raw === null || raw === undefined) return null;
  try { return JSON.parse(raw); } catch { throw new TrainingServiceError("INVALID_STORED_DATA", `Invalid JSON at ${path}`, 502); }
}

async function manifestRevision(snapshot, resourceKey, paths) {
  const dependencies = [];
  for (const path of [...new Set(paths)].sort()) {
    const content = await snapshot.readFile(path);
    dependencies.push({ path, contentHash: content == null ? null : await sha256(content) });
  }
  if (dependencies.every((dependency) => dependency.contentHash === null)) return null;
  return `sha256:${await sha256(canonicalJson({ resourceKey, dependencies }))}`;
}

export async function revisionManifest(snapshot, resourceKey, paths) {
  return manifestRevision(snapshot, resourceKey, paths);
}

async function assertPrecondition(snapshot, preconditions, resourceKey, paths) {
  const conditions = asObject(preconditions, "preconditions");
  if (!Object.hasOwn(conditions, resourceKey)) {
    throw new TrainingServiceError("PRECONDITION_REQUIRED", `Missing precondition for ${resourceKey}`, 428);
  }
  const expected = conditions[resourceKey];
  if (expected !== null && (typeof expected !== "string" || !expected.startsWith("sha256:"))) {
    throw new TrainingServiceError("VALIDATION_FAILED", `Invalid revision for ${resourceKey}`);
  }
  const current = await manifestRevision(snapshot, resourceKey, paths);
  if (expected !== current) {
    throw new TrainingServiceError("VERSION_CONFLICT", `Version conflict for ${resourceKey}`, 409);
  }
  return current;
}

function fileChange(path, value) {
  return { path, content: `${canonicalJson(value)}\n` };
}

async function readOwned(snapshot, path, validator, memberId) {
  const value = parseJson(await snapshot.readFile(path), path);
  if (value === null) return null;
  try { validator(value); } catch (cause) { throw new TrainingServiceError("INVALID_STORED_DATA", `Invalid stored document at ${path}: ${cause.message}`, 502); }
  if (value.memberId !== memberId) throw new TrainingServiceError("FORBIDDEN", `Stored document at ${path} is not owned by this member`, 403);
  return value;
}

async function nextSequence(snapshot, paths) {
  const raw = parseJson(await snapshot.readFile(paths.sequence), paths.sequence);
  const next = raw === null ? 0 : raw.next;
  if (!Number.isInteger(next) || next < 0) throw new TrainingServiceError("INVALID_STORED_DATA", "Invalid event sequence", 502);
  return next;
}

function attemptInput(command, memberId, timestamp, sequence) {
  const input = asObject(command, "attempt");
  noUnknown(input, ["id", "recordRef", "problem", "mode", "outcome", "performedOn", "durationMinutes", "errorTags", "note", "preconditions"], "attempt");
  const recordRef = asObject(input.recordRef, "recordRef");
  if (recordRef.memberId !== memberId) throw new TrainingServiceError("FORBIDDEN", "An attempt can only reference the caller's record", 403);
  const subjectKey = subjectKeyForProblem({ ...recordRef, ...input.problem });
  if (!subjectKey) throw new TrainingServiceError("VALIDATION_FAILED", "Attempt requires a stable problem or record identity");
  return validateAttemptEvent({
    schemaVersion: TRAINING_SCHEMA_VERSION,
    id: input.id,
    type: "attempt.recorded",
    memberId,
    recordedAt: timestamp,
    sequence,
    subjectKey,
    recordRef,
    problem: input.problem,
    performedOn: input.performedOn,
    mode: input.mode,
    outcome: input.outcome,
    ...(input.durationMinutes === undefined ? {} : { durationMinutes: input.durationMinutes }),
    ...(input.errorTags === undefined ? {} : { errorTags: input.errorTags }),
    ...(input.note === undefined ? {} : { note: input.note }),
    source: { kind: "manual" },
  });
}

function eventsFrom(loader, snapshot, memberId, subjectKey) {
  return Promise.resolve(loader({ snapshot, memberId, subjectKey })).then((events) => {
    if (!Array.isArray(events)) throw new TypeError("loadEvents must return an array");
    return events.filter((event) => event?.memberId === memberId);
  });
}

function actionType(action) {
  return ({ schedule: "review.scheduled", defer: "review.deferred", pause: "review.paused", archive: "review.archived" })[action] || null;
}

function persistedReview(projection) {
  // `source` is useful to readers of the pure projection, but it is deliberately
  // not part of the persisted Review schema.
  const { source, ...review } = projection;
  // A brand-new member's first event has sequence zero.  The projection uses -1
  // as its in-memory "no applied event" sentinel; persisted reviews use the
  // schema's non-negative representation.
  if (review.appliedSequence < 0) review.appliedSequence = 0;
  return validateReview(review);
}

export function createTrainingService({ git, now = () => new Date().toISOString(), loadEvents = async () => [], dateMath } = {}) {
  if (!git) throw new TypeError("git is required");
  if (typeof now !== "function" || typeof loadEvents !== "function") throw new TypeError("now and loadEvents must be functions");

  async function execute({ memberId, operationId, requestHash, validate, plan, message }) {
    requireMemberId(memberId);
    return runGitTransaction({ git, memberId, operationId, requestHash, validate, plan, message, now });
  }

  return Object.freeze({
    saveProfile: ({ memberId, operationId, requestHash, profile, preconditions }) => execute({
      memberId, operationId, requestHash, message: "save training profile",
      validate: async (snapshot) => assertPrecondition(snapshot, preconditions, "profile", [trainingPaths(memberId).profile]),
      plan: async (snapshot) => {
        const paths = trainingPaths(memberId);
        const timestamp = now();
        const input = asObject(profile, "profile");
        noUnknown(input, ["focusNodeIds", "dailyBudgetMinutes", "dailyItemLimit", "cfHandle", "atcoderHandle", "goalNote"], "profile");
        const document = validateProfile({ schemaVersion: TRAINING_SCHEMA_VERSION, memberId, updatedAt: timestamp, ...input });
        const revision = `sha256:${await sha256(canonicalJson({ resourceKey: "profile", document }))}`;
        return { changes: [fileChange(paths.profile, document)], result: { data: document, resourceVersions: { profile: revision } } };
      },
    }),

    savePlan: ({ memberId, operationId, requestHash, plan, preconditions }) => execute({
      memberId, operationId, requestHash, message: "save training plan",
      validate: async (snapshot) => {
        const date = asObject(plan, "plan").date;
        await assertPrecondition(snapshot, preconditions, `plan:${date}`, [trainingPaths(memberId).plan(date)]);
      },
      plan: async () => {
        const input = asObject(plan, "plan");
        noUnknown(input, ["date", "items", "algorithmVersion", "evidenceSnapshot"], "plan");
        const document = validatePlan({ schemaVersion: TRAINING_SCHEMA_VERSION, memberId, updatedAt: now(), ...input });
        const key = `plan:${document.date}`;
        const revision = `sha256:${await sha256(canonicalJson({ resourceKey: key, document }))}`;
        return { changes: [fileChange(trainingPaths(memberId).plan(document.date), document)], result: { data: document, resourceVersions: { [key]: revision } } };
      },
    }),

    recordAttempt: ({ memberId, operationId, requestHash, attempt, preconditions }) => execute({
      memberId, operationId, requestHash, message: "record training attempt",
      validate: async (snapshot) => {
        const input = asObject(attempt, "attempt");
        const subjectKey = subjectKeyForProblem({ ...input.recordRef, ...input.problem });
        if (!subjectKey) throw new TrainingServiceError("VALIDATION_FAILED", "Attempt requires a stable subject key");
        const hash = await sha256(subjectKey);
        await assertPrecondition(snapshot, preconditions, `review:${hash}`, [trainingPaths(memberId).review(hash)]);
      },
      plan: async (snapshot) => {
        const paths = trainingPaths(memberId);
        const event = attemptInput(attempt, memberId, now(), await nextSequence(snapshot, paths));
        const subjectHash = await sha256(event.subjectKey);
        const events = await eventsFrom(loadEvents, snapshot, memberId, event.subjectKey);
        const review = persistedReview(projectReviewSchedule({ memberId, subjectKey: event.subjectKey, events: [...events, event], dateMath }));
        const eventPath = paths.event(event.recordedAt, event.id);
        const reviewPath = paths.review(subjectHash);
        const reviewRevision = `sha256:${await sha256(canonicalJson({ resourceKey: `review:${subjectHash}`, document: review }))}`;
        return {
          changes: [fileChange(eventPath, event), fileChange(paths.sequence, { next: event.sequence + 1 }), fileChange(reviewPath, review)],
          result: { data: event, review, resourceVersions: { [`review:${subjectHash}`]: reviewRevision } },
        };
      },
    }),

    applyReviewAction: ({ memberId, operationId, requestHash, action, preconditions }) => execute({
      memberId, operationId, requestHash, message: "update training review",
      validate: async (snapshot) => {
        const input = asObject(action, "review action");
        noUnknown(input, ["id", "subjectKey", "action", "dueOn"], "review action");
        const subjectHash = await sha256(input.subjectKey);
        await assertPrecondition(snapshot, preconditions, `review:${subjectHash}`, [trainingPaths(memberId).review(subjectHash)]);
      },
      plan: async (snapshot) => {
        const input = asObject(action, "review action");
        const type = actionType(input.action);
        if (!type) throw new TrainingServiceError("VALIDATION_FAILED", "Invalid review action");
        if ((type === "review.scheduled" || type === "review.deferred") !== Object.hasOwn(input, "dueOn")) {
          throw new TrainingServiceError("VALIDATION_FAILED", "Review dueOn is required only for schedule or defer");
        }
        const paths = trainingPaths(memberId);
        const sequence = await nextSequence(snapshot, paths);
        const event = validateAttemptEvent({ schemaVersion: TRAINING_SCHEMA_VERSION, id: input.id, type, memberId, recordedAt: now(), sequence, subjectKey: input.subjectKey, ...(input.dueOn === undefined ? {} : { dueOn: input.dueOn }) });
        const subjectHash = await sha256(event.subjectKey);
        const events = await eventsFrom(loadEvents, snapshot, memberId, event.subjectKey);
        const review = persistedReview(projectReviewSchedule({ memberId, subjectKey: event.subjectKey, events: [...events, event], dateMath }));
        const revision = `sha256:${await sha256(canonicalJson({ resourceKey: `review:${subjectHash}`, document: review }))}`;
        return { changes: [fileChange(paths.event(event.recordedAt, event.id), event), fileChange(paths.sequence, { next: sequence + 1 }), fileChange(paths.review(subjectHash), review)], result: { data: event, review, resourceVersions: { [`review:${subjectHash}`]: revision } } };
      },
    }),

    saveSelfAssessment: ({ memberId, operationId, requestHash, assessment, preconditions }) => execute({
      memberId, operationId, requestHash, message: "save training self assessment",
      validate: async (snapshot) => {
        const nodeId = requireSafeNodeId(asObject(assessment, "assessment").nodeId);
        await assertPrecondition(snapshot, preconditions, `assessment:${nodeId}`, [trainingPaths(memberId).assessment(nodeId)]);
      },
      plan: async () => {
        const input = asObject(assessment, "assessment");
        noUnknown(input, ["nodeId", "level", "note"], "assessment");
        const document = validateSelfAssessment({ schemaVersion: TRAINING_SCHEMA_VERSION, memberId, updatedAt: now(), ...input });
        const key = `assessment:${document.nodeId}`;
        const revision = `sha256:${await sha256(canonicalJson({ resourceKey: key, document }))}`;
        return { changes: [fileChange(trainingPaths(memberId).assessment(document.nodeId), document)], result: { data: document, resourceVersions: { [key]: revision } } };
      },
    }),
  });
}
