import { buildEvidenceV1, foldTrainingEvents } from "../../lib/training-projections.mjs";
import { recommendV1 } from "../../lib/recommendations.mjs";
import { sha256Hex, trainingPaths, TrainingServiceError } from "./training.mjs";

async function readJson(snapshot, path) {
  const raw = await snapshot.readFile(path);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { throw new TrainingServiceError("UPSTREAM_UNAVAILABLE", "训练数据格式有误", 502); }
}

export async function readCatalog(snapshot) {
  const catalog = await readJson(snapshot, "training/indexes/catalog.json");
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.nodes)
    || catalog.nodes.some((node) => !/^[a-z0-9-]+$/.test(node?.id || "") || !Array.isArray(node.problems))) {
    throw new TrainingServiceError("INDEX_STALE", "学习路线索引暂不可用", 503);
  }
  return catalog.nodes;
}

export async function readOwnedDocument(snapshot, memberId, resourceKey, path) {
  const data = await readJson(snapshot, path);
  if (data && data.memberId !== memberId) throw new TrainingServiceError("FORBIDDEN", "记录不属于当前队员", 403);
  return { data, revision: data ? `sha256:${await sha256Hex({ resourceKey, document: data })}` : null };
}

export async function readTrainingContext({ git, snapshot, user, date, today, includeCatalog = true }) {
  const memberId = user.login;
  const paths = trainingPaths(memberId);
  const [profile, plan, eventFiles, reviewFiles, assessmentFiles, legacyIndex, nodes] = await Promise.all([
    readOwnedDocument(snapshot, memberId, "profile", paths.profile),
    readOwnedDocument(snapshot, memberId, `plan:${date}`, paths.plan(date)),
    git.listDocuments(snapshot, memberId, "events"), git.listDocuments(snapshot, memberId, "reviews"),
    git.listDocuments(snapshot, memberId, "assessments"), readJson(snapshot, paths.legacyIndex),
    includeCatalog ? readCatalog(snapshot) : [],
  ]);
  if (legacyIndex?.schemaVersion !== 1 || legacyIndex.memberId !== memberId || legacyIndex.member !== user.member || !Array.isArray(legacyIndex.records)) {
    throw new TrainingServiceError("INDEX_STALE", "个人训练索引暂不可用", 503);
  }
  const legacyRecords = legacyIndex.records;
  const owned = (files) => files.map(({ data }) => data).filter((item) => item.memberId === memberId);
  const attempts = foldTrainingEvents(owned(eventFiles));
  const sources = new Map([...legacyRecords, ...attempts].map((item) => [item.subjectKey, item]));
  const reviewsBySubject = new Map();
  for (const record of legacyRecords) {
    if (record.reviewStatus !== "todo") continue;
    const previous = reviewsBySubject.get(record.subjectKey);
    const dueOn = record.reviewDue || null;
    if (!previous || (dueOn && (!previous.dueOn || dueOn < previous.dueOn))) reviewsBySubject.set(record.subjectKey, { ...record, state: "scheduled", dueOn, source: "legacy" });
  }
  for (const review of owned(reviewFiles)) reviewsBySubject.set(review.subjectKey, { ...sources.get(review.subjectKey), ...review, source: "events" });
  const reviews = [...reviewsBySubject.values()];
  const assessments = owned(assessmentFiles);
  const evidence = buildEvidenceV1({ attempts, legacyRecords, reviews, selfAssessment: assessments, today });
  return { profile: profile.data, plan: plan.data, attempts, legacyRecords, reviews, assessments, nodes,
    date, today, evidence, resourceVersions: { profile: profile.revision, [`plan:${date}`]: plan.revision }, snapshotCommitSha: snapshot.head };
}

export function workbenchResponse(context, exclude = []) {
  const recommendations = recommendV1({ ...context, profile: context.profile || {}, exclude });
  return { date: context.date, today: context.today, profile: context.profile, plan: context.plan,
    dueReviews: context.reviews.filter((review) => review.state === "scheduled" && (!review.dueOn || review.dueOn <= context.today)),
    evidence: context.evidence, evidenceSource: "repository-snapshot", resourceVersions: context.resourceVersions,
    snapshotCommitSha: context.snapshotCommitSha, recommendations: { ...recommendations, evidenceSnapshot: context.evidence },
    nodes: context.nodes.map(({ id, title }) => ({ id, title })) };
}
