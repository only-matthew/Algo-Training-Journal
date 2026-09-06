import { normalizeMeta, isDateString } from "../../lib/log-schema.mjs";
import { subjectKeyForProblem } from "../../lib/problem-identity.mjs";
import { buildEvidenceV1, foldTrainingEvents } from "../../lib/training-projections.mjs";
import { recommendV1, catalogProblem } from "../../lib/recommendations.mjs";
import { sha256Hex, trainingPaths, TrainingServiceError } from "./training.mjs";

async function readJson(snapshot, path) {
  const raw = await snapshot.readFile(path);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { throw new TrainingServiceError("UPSTREAM_UNAVAILABLE", "训练数据格式有误", 502); }
}

async function mapLimited(items, mapper) {
  const result = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; result[index] = await mapper(items[index]); }
  }));
  return result;
}

export async function readCatalog(snapshot) {
  const roadmap = await readJson(snapshot, "curriculum/roadmap.json");
  const phases = Array.isArray(roadmap) ? roadmap : roadmap?.phases;
  if (!Array.isArray(phases)) throw new TrainingServiceError("UPSTREAM_UNAVAILABLE", "学习路线暂不可用", 502);
  const ids = phases.flatMap((phase) => phase.nodes || []);
  if (ids.some((id) => !/^[a-z0-9-]+$/.test(id))) throw new TrainingServiceError("UPSTREAM_UNAVAILABLE", "学习节点无效", 502);
  const nodes = await mapLimited(ids, (id) => readJson(snapshot, `curriculum/nodes/${id}.json`));
  if (nodes.some((node, index) => node?.id !== ids[index] || !Array.isArray(node.problems))) throw new TrainingServiceError("UPSTREAM_UNAVAILABLE", "学习节点缺失", 502);
  return nodes;
}

export async function readOwnedDocument(snapshot, memberId, resourceKey, path) {
  const data = await readJson(snapshot, path);
  if (data && data.memberId !== memberId) throw new TrainingServiceError("FORBIDDEN", "记录不属于当前队员", 403);
  return { data, revision: data ? `sha256:${await sha256Hex({ resourceKey, document: data })}` : null };
}

export async function readTrainingContext({ git, snapshot, user, date, today, includeCatalog = true }) {
  const memberId = user.login;
  const paths = trainingPaths(memberId);
  const [profile, plan, eventFiles, reviewFiles, assessmentFiles, logFiles, nodes] = await Promise.all([
    readOwnedDocument(snapshot, memberId, "profile", paths.profile),
    readOwnedDocument(snapshot, memberId, `plan:${date}`, paths.plan(date)),
    git.listDocuments(snapshot, memberId, "events"), git.listDocuments(snapshot, memberId, "reviews"),
    git.listDocuments(snapshot, memberId, "assessments"), git.listFiles(snapshot, `logs/${user.member}/`),
    includeCatalog ? readCatalog(snapshot) : [],
  ]);
  const byDate = new Map();
  for (const path of logFiles) {
    const relative = path.slice(`logs/${user.member}/`.length);
    const match = /^(\d{4})\/(\d{2})\/(\d{2})\/meta\.json$/.exec(relative) || /^(\d{4})-(\d{2})-(\d{2})\/meta\.json$/.exec(relative);
    if (!match) continue;
    const logDate = match.slice(1).join("-");
    if (!isDateString(logDate)) continue;
    if (!byDate.has(logDate) || /^\d{4}\//.test(relative)) byDate.set(logDate, path);
  }
  const legacyRecords = (await mapLimited([...byDate], async ([logDate, path]) => {
    const meta = await readJson(snapshot, path);
    if (!meta) throw new TrainingServiceError("UPSTREAM_UNAVAILABLE", "日志快照缺失", 502);
    return normalizeMeta(meta, { legacyIdPrefix: `${user.member}-${logDate}` }).problems.map((problem) => {
      const recordRef = { memberId, date: logDate, recordId: problem.id };
      return { subjectKey: subjectKeyForProblem({ ...recordRef, ...problem }), date: logDate, recordRef,
        problem: catalogProblem(problem), reviewStatus: problem.reviewStatus, reviewDue: problem.reviewDue,
        href: `/problem/${[user.member, logDate, problem.id].map(encodeURIComponent).join("/")}/` };
    });
  })).flat();
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
