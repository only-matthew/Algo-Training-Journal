import { isDateString } from "../../lib/log-schema.mjs";
import { todayUtc8 } from "../../lib/constants.mjs";
import { isUuidV4 } from "../../lib/training-schema.mjs";
import { subjectKeyForProblem } from "../../lib/problem-identity.mjs";
import { buildEvidenceV1, foldTrainingEvents } from "../../lib/training-projections.mjs";
import { recommendV1 } from "../../lib/recommendations.mjs";
import { createTrainingService, sha256Hex, trainingPaths } from "../services/training.mjs";
import { readCatalog, readTrainingContext, workbenchResponse } from "../services/training-read.mjs";
import { trainingGit } from "../storage/training-git.mjs";

async function readTrainingDocument(git, memberId, resourceKey, path) {
  const head = await git.getHead();
  const raw = await git.readFile(head, path);
  if (raw === null) return { exists: false, data: null, revision: null, snapshotCommitSha: head };
  let data;
  try { data = JSON.parse(raw); } catch { throw Object.assign(new Error("Stored training document is invalid"), { code: "UPSTREAM_UNAVAILABLE", status: 502 }); }
  if (data.memberId !== memberId) throw Object.assign(new Error("Stored document is not owned by this member"), { code: "FORBIDDEN", status: 403 });
  const revision = `sha256:${await sha256Hex({ resourceKey, document: data })}`;
  return { exists: true, data, revision, snapshotCommitSha: head };
}

export async function handleTrainingV2(request, user, url, { v2Error, v2Json, readJsonBody, parseConditionalRevision, requireIdempotencyKey, requireObject, withoutPreconditions }) {
  const suffix = url.pathname.slice("/api/v2".length);
  const git = trainingGit(user.token);
  const paths = trainingPaths(user.memberId);
  const today = todayUtc8();
  const service = createTrainingService({ git,
    loadEvents: ({ snapshot, memberId, subjectKey }) => git.listEvents(snapshot, memberId, subjectKey),
    validateFocus: async (snapshot, ids) => {
      if (!ids.length) return;
      const nodes = await readCatalog(snapshot);
      if (ids.some((id) => !nodes.some((node) => node.id === id))) throw Object.assign(new Error("请选择有效的学习专题"), { status: 422 });
    },
    validateSelection: async (snapshot, item, plan) => {
      if (item.kind === "manual") return;
      const context = await readTrainingContext({ git, snapshot, user, date: plan?.date || today, today });
      const available = recommendV1({ ...context, profile: { ...(context.profile || {}), dailyItemLimit: 10, dailyBudgetMinutes: 240 } }).items;
      if (!available.some((candidate) => candidate.subjectKey === item.subjectKey && candidate.kind === item.kind && candidate.nodeId === item.nodeId)) throw Object.assign(new Error("候选已变化，请刷新推荐后重新选择"), { code: "VERSION_CONFLICT", status: 409 });
    },
  });
  const command = async (method, resource, payload, preconditions) => {
    const operationId = requireIdempotencyKey(request);
    const requestHash = await sha256Hex({ method: request.method, path: suffix, body: payload, preconditions });
    return method({ memberId: user.memberId, operationId, requestHash, [resource]: payload, preconditions });
  };

  if (request.method === "GET" && (suffix === "/me/reviews" || suffix === "/me/workbench" || suffix === "/me/recommendations")) {
    const head = await git.getHead();
    const snapshot = { head, readFile: (path) => git.readFile(head, path) };
    const date = url.searchParams.get("date") || today;
    if (!isDateString(date)) throw Object.assign(new Error("Invalid date"), { code: "MALFORMED_REQUEST", status: 400 });
    const exclude = url.searchParams.getAll("exclude");
    if (exclude.length > 50 || exclude.some((key) => key.length > 500)) return v2Error(request, "MALFORMED_REQUEST", "排除列表过长", 400);
    const context = await readTrainingContext({ git, snapshot, user, date, today, includeCatalog: suffix !== "/me/reviews" });
    if (suffix === "/me/reviews") return v2Json(request, { data: context.reviews, snapshotCommitSha: head });
    const result = workbenchResponse(context, exclude);
    if (suffix === "/me/recommendations") return v2Json(request, { ...result.recommendations, today, snapshotCommitSha: head });
    return v2Json(request, result);
  }

  if (suffix === "/me/plan-actions" && request.method === "POST") {
    const { body: action, preconditions } = withoutPreconditions(await readJsonBody(request));
    return v2Json(request, await command(service.applyPlanAction, "action", action, preconditions));
  }

  if (suffix === "/me/profile") {
    if (request.method === "GET") return v2Json(request, await readTrainingDocument(git, user.memberId, "profile", paths.profile));
    if (request.method === "PUT") {
      const profile = requireObject(await readJsonBody(request));
      const result = await command(service.saveProfile, "profile", profile, { profile: parseConditionalRevision(request) });
      return v2Json(request, result, { revision: result.resourceVersions.profile });
    }
  }

  const planMatch = /^\/me\/plans\/(\d{4}-\d{2}-\d{2})$/.exec(suffix);
  if (planMatch) {
    const date = planMatch[1];
    if (!isDateString(date)) throw Object.assign(new Error("Invalid plan date"), { code: "MALFORMED_REQUEST", status: 400 });
    const key = `plan:${date}`;
    if (request.method === "GET") return v2Json(request, await readTrainingDocument(git, user.memberId, key, paths.plan(date)));
    if (request.method === "PUT") {
      const incoming = requireObject(await readJsonBody(request));
      if (Object.hasOwn(incoming, "date") && incoming.date !== date) throw Object.assign(new Error("Plan date does not match URL"), { code: "MALFORMED_REQUEST", status: 400 });
      const plan = { ...incoming, date };
      const result = await command(service.savePlan, "plan", plan, { [key]: parseConditionalRevision(request) });
      return v2Json(request, result, { revision: result.resourceVersions[key] });
    }
  }

  if (suffix === "/me/attempts" && request.method === "POST") {
    const { body: attempt, preconditions } = withoutPreconditions(await readJsonBody(request));
    const result = await command(service.recordAttempt, "attempt", attempt, preconditions);
    return v2Json(request, result, { status: 201, revision: Object.values(result.resourceVersions)[0] });
  }
  if (suffix === "/me/attempts" && request.method === "GET") {
    const subjectKey = url.searchParams.get("subjectKey") || null;
    if (subjectKey && subjectKey.length > 500) throw Object.assign(new Error("subjectKey is too long"), { code: "MALFORMED_REQUEST", status: 400 });
    const limit = Number(url.searchParams.get("limit") || 50);
    const offset = Number(url.searchParams.get("cursor") || 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) throw Object.assign(new Error("Invalid attempts pagination"), { code: "MALFORMED_REQUEST", status: 400 });
    const head = await git.getHead();
    const snapshot = { head, readFile: (path) => git.readFile(head, path) };
    const events = (await git.listDocuments(snapshot, user.memberId, "events")).map(({ data }) => data).filter((event) => event?.memberId === user.memberId);
    const attempts = foldTrainingEvents(events).filter((attempt) => !subjectKey || attempt.subjectKey === subjectKey);
    const data = attempts.slice(offset, offset + limit);
    return v2Json(request, { data, nextCursor: offset + data.length < attempts.length ? String(offset + data.length) : null, snapshotCommitSha: head });
  }

  const attemptMutation = /^\/me\/attempts\/([^/]+)\/(corrections|void)$/.exec(suffix);
  if (attemptMutation && request.method === "POST") {
    const targetAttemptId = decodeURIComponent(attemptMutation[1]);
    if (!isUuidV4(targetAttemptId)) throw Object.assign(new Error("Invalid attempt id"), { code: "MALFORMED_REQUEST", status: 400 });
    const incoming = requireObject(await readJsonBody(request));
    const head = await git.getHead();
    const snapshot = { head, readFile: (path) => git.readFile(head, path) };
    const events = await git.listEvents(snapshot, user.memberId);
    const target = events.find((event) => event?.type === "attempt.recorded" && event.id === targetAttemptId);
    if (!target) throw Object.assign(new Error("Attempt not found"), { code: "NOT_FOUND", status: 404 });
    const subjectHash = await sha256Hex(target.subjectKey);
    const preconditions = { [`review:${subjectHash}`]: parseConditionalRevision(request) };
    if (attemptMutation[2] === "corrections") {
      const correction = { targetAttemptId, patch: requireObject(incoming.patch, "patch") };
      const result = await command(service.correctAttempt, "correction", correction, preconditions);
      return v2Json(request, result, { status: 201, revision: result.resourceVersions[`review:${subjectHash}`] });
    }
    const voidCommand = { targetAttemptId, reason: incoming.reason };
    const result = await command(service.voidAttempt, "voidCommand", voidCommand, preconditions);
    return v2Json(request, result, { status: 201, revision: result.resourceVersions[`review:${subjectHash}`] });
  }

  const evidenceMatch = /^\/me\/evidence\/([^/]+)$/.exec(suffix);
  if (evidenceMatch && request.method === "GET") {
    const nodeId = decodeURIComponent(evidenceMatch[1]);
    const offset = Number(url.searchParams.get("cursor") || 0);
    if (!Number.isInteger(offset) || offset < 0) throw Object.assign(new Error("Invalid evidence cursor"), { code: "MALFORMED_REQUEST", status: 400 });
    const head = await git.getHead();
    const snapshot = { head, readFile: (path) => git.readFile(head, path) };
    const context = await readTrainingContext({ git, snapshot, user, date: today, today });
    const node = context.nodes.find((entry) => entry.id === nodeId);
    if (!node) throw Object.assign(new Error("Learning node not found"), { code: "NOT_FOUND", status: 404 });
    const subjectKeys = new Set(node.problems.map((problem) => subjectKeyForProblem(problem)).filter(Boolean));
    const attempts = context.attempts.filter((attempt) => subjectKeys.has(attempt.subjectKey));
    const data = attempts.slice(offset, offset + 50);
    return v2Json(request, {
      node: { id: node.id, title: node.title },
      evidence: buildEvidenceV1({ attempts: context.attempts, legacyRecords: context.legacyRecords, reviews: context.reviews, selfAssessment: context.assessments.find((item) => item.nodeId === nodeId) || null, subjectKeys, today }),
      attempts: data, nextCursor: offset + data.length < attempts.length ? String(offset + data.length) : null, snapshotCommitSha: head,
    });
  }
  if (suffix === "/me/review-actions" && request.method === "POST") {
    const { body: action, preconditions } = withoutPreconditions(await readJsonBody(request));
    const result = await command(service.applyReviewAction, "action", action, preconditions);
    return v2Json(request, result, { status: 201, revision: Object.values(result.resourceVersions)[0] });
  }

  const assessmentMatch = /^\/me\/assessments\/([^/]+)$/.exec(suffix);
  if (assessmentMatch) {
    const nodeId = decodeURIComponent(assessmentMatch[1]);
    const key = `assessment:${nodeId}`;
    if (request.method === "GET") return v2Json(request, await readTrainingDocument(git, user.memberId, key, paths.assessment(nodeId)));
    if (request.method === "PUT") {
      const incoming = requireObject(await readJsonBody(request));
      if (Object.hasOwn(incoming, "nodeId") && incoming.nodeId !== nodeId) throw Object.assign(new Error("Assessment nodeId does not match URL"), { code: "MALFORMED_REQUEST", status: 400 });
      const assessment = { ...incoming, nodeId };
      const result = await command(service.saveSelfAssessment, "assessment", assessment, { [key]: parseConditionalRevision(request) });
      return v2Json(request, result, { revision: result.resourceVersions[key] });
    }
  }

  const operationMatch = /^\/me\/operations\/([^/]+)$/.exec(suffix);
  if (operationMatch && request.method === "GET") {
    const operationId = decodeURIComponent(operationMatch[1]);
    if (!isUuidV4(operationId)) throw Object.assign(new Error("Invalid operation id"), { code: "MALFORMED_REQUEST", status: 400 });
    const document = await readTrainingDocument(git, user.memberId, `operation:${operationId}`, `training/members/${user.memberId}/operations/${operationId}.json`);
    return v2Json(request, document.exists ? { exists: true, operation: { id: operationId, state: "saved" }, result: document.data.result, snapshotCommitSha: document.snapshotCommitSha } : { exists: false, operation: { id: operationId, state: "unknown" }, snapshotCommitSha: document.snapshotCommitSha });
  }

  return null;
}
