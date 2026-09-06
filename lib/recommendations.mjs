export const RECOMMENDATION_ALGORITHM_VERSION = "recommend-v1";

export const REASON_CODES = Object.freeze({
  REVIEW_DUE: "REVIEW_DUE",
  UPSOLVE_PENDING: "UPSOLVE_PENDING",
  FOCUS_NODE: "FOCUS_NODE",
  NEXT_NODE: "NEXT_NODE",
  PREREQUISITE_SELF_ASSESSED: "PREREQUISITE_SELF_ASSESSED",
  NO_EVIDENCE: "NO_EVIDENCE",
  NO_CANDIDATES: "NO_CANDIDATES",
});

const ACTIVE_PLAN_STATUSES = new Set(["queued", "started", "completed"]);
const DEFAULT_ITEM_MINUTES = 20;
const DEFAULT_ITEM_LIMIT = 3;
const DEFAULT_DAILY_BUDGET = 60;

function array(value) {
  return Array.isArray(value) ? value : [];
}

function sortedStrings(values) {
  return [...new Set(array(values).filter((value) => typeof value === "string" && value))].sort((a, b) => a.localeCompare(b));
}

function nodeList(curriculum) {
  if (Array.isArray(curriculum?.nodes)) return curriculum.nodes;
  if (curriculum?.nodes && typeof curriculum.nodes === "object") return Object.values(curriculum.nodes);
  return [];
}

function routeNodeIds(curriculum) {
  const ids = [];
  for (const phase of array(curriculum?.phases)) {
    for (const nodeId of array(phase?.nodes)) {
      if (typeof nodeId === "string" && nodeId && !ids.includes(nodeId)) ids.push(nodeId);
    }
  }
  for (const node of nodeList(curriculum)) {
    if (typeof node?.id === "string" && node.id && !ids.includes(node.id)) ids.push(node.id);
  }
  return ids;
}

function nodesById(curriculum) {
  return new Map(nodeList(curriculum).filter((node) => typeof node?.id === "string" && node.id).map((node) => [node.id, node]));
}

function normalizeProblem(candidate) {
  if (!candidate || typeof candidate.subjectKey !== "string" || !candidate.subjectKey) return null;
  const problem = candidate.problem && typeof candidate.problem === "object" ? candidate.problem : candidate;
  return { subjectKey: candidate.subjectKey, problem };
}

function nodeEvidence(evidence, nodeId) {
  const entries = evidence?.nodeEvidence;
  if (Array.isArray(entries)) return entries.find((entry) => entry?.nodeId === nodeId) || {};
  return entries?.[nodeId] || {};
}

function independentKeys(evidence) {
  return new Set(sortedStrings(evidence?.independentSubjectKeys));
}

function historicalKeys(evidence) {
  const keys = new Set(sortedStrings(evidence?.historicalSubjectKeys));
  for (const candidate of array(evidence?.history)) {
    if (typeof candidate?.subjectKey === "string" && candidate.subjectKey) keys.add(candidate.subjectKey);
  }
  return keys;
}

function selfAssessment(evidence, nodeId) {
  const assessments = evidence?.selfAssessments;
  if (Array.isArray(assessments)) return assessments.find((entry) => entry?.nodeId === nodeId)?.level;
  return assessments?.[nodeId]?.level ?? assessments?.[nodeId];
}

function prerequisiteStatus(node, evidence, independent) {
  const selfAssessed = [];
  for (const prerequisite of array(node?.prerequisites)) {
    const prerequisiteEvidence = nodeEvidence(evidence, prerequisite);
    const independentlyCompleted = independent.has(prerequisite)
      || array(prerequisiteEvidence.independentSubjectKeys).some((key) => independent.has(key))
      || Number(prerequisiteEvidence.independentProblems) > 0;
    if (independentlyCompleted) continue;
    if (selfAssessment(evidence, prerequisite) === "comfortable") {
      selfAssessed.push(prerequisite);
      continue;
    }
    return { eligible: false, selfAssessed };
  }
  return { eligible: true, selfAssessed };
}

function candidateFrom(value, kind, reasonCodes, support = {}) {
  const normalized = normalizeProblem(value);
  if (!normalized) return null;
  return {
    ...normalized,
    kind,
    plannedMinutes: DEFAULT_ITEM_MINUTES,
    reasonCodes,
    ...support,
  };
}

function compareReviews(left, right) {
  return String(left.dueOn).localeCompare(String(right.dueOn))
    || String(left.subjectKey).localeCompare(String(right.subjectKey));
}

function chooseBudgeted(candidates, limit, budget) {
  const selected = [];
  let used = 0;
  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    if (selected.length > 0 && used + candidate.plannedMinutes > budget) break;
    selected.push(candidate);
    used += candidate.plannedMinutes;
  }
  return selected;
}

/**
 * Return deterministic, unsaved recommend-v1 candidates from normalized plain
 * data. Callers own validation, problem identity normalization, and persistence.
 */
export function recommendV1(input = {}) {
  const profile = input.profile || {};
  const planItems = array(input.plan?.items);
  const planned = new Set(planItems
    .filter((item) => ACTIVE_PLAN_STATUSES.has(item?.status))
    .map((item) => item?.subjectKey)
    .filter(Boolean));
  const excluded = new Set(sortedStrings(input.exclude));
  const seen = new Set([...planned, ...excluded]);
  const historical = historicalKeys(input.evidence);
  const independent = independentKeys(input.evidence);
  const nodes = nodesById(input.curriculum);
  const route = routeNodeIds(input.curriculum);
  const focusNodeIds = array(profile.focusNodeIds).filter((id) => nodes.has(id));
  const itemLimit = Math.max(0, Math.min(10, Number.isInteger(profile.dailyItemLimit) ? profile.dailyItemLimit : DEFAULT_ITEM_LIMIT));
  const availableSlots = Math.max(0, 10 - planItems.filter((item) => ACTIVE_PLAN_STATUSES.has(item?.status)).length);
  const limit = Math.min(itemLimit, availableSlots);
  const budget = Number.isInteger(profile.dailyBudgetMinutes) ? profile.dailyBudgetMinutes : DEFAULT_DAILY_BUDGET;
  const candidates = [];

  const add = (candidate) => {
    if (!candidate || seen.has(candidate.subjectKey)) return;
    seen.add(candidate.subjectKey);
    candidates.push(candidate);
  };

  for (const review of array(input.reviews).filter((entry) => entry?.state === "scheduled" && typeof entry?.dueOn === "string" && entry.dueOn <= input.today).sort(compareReviews)) {
    add(candidateFrom(review, "review", [REASON_CODES.REVIEW_DUE], { dueOn: review.dueOn, recordRef: review.recordRef }));
  }

  const upsolve = [
    ...array(input.evidence?.upsolvePending),
    ...array(input.evidence?.attempts).filter((attempt) => attempt?.mode === "upsolve" && attempt?.outcome === "unfinished"),
  ].sort((left, right) => String(left?.subjectKey).localeCompare(String(right?.subjectKey)));
  for (const item of upsolve) {
    add(candidateFrom(item, "upsolve", [REASON_CODES.UPSOLVE_PENDING], { recordRef: item?.recordRef }));
  }

  const addNodeProblems = (node, code, prerequisite) => {
    for (const problem of array(node?.problems)) {
      const normalized = normalizeProblem(problem);
      if (!normalized || historical.has(normalized.subjectKey)) continue;
      const codes = [code];
      const support = { nodeId: node.id };
      if (prerequisite?.selfAssessed?.length) {
        codes.push(REASON_CODES.PREREQUISITE_SELF_ASSESSED);
        support.prerequisiteNodeIds = [...prerequisite.selfAssessed];
      }
      add(candidateFrom(normalized, "practice", codes, support));
    }
  };

  for (const nodeId of focusNodeIds) addNodeProblems(nodes.get(nodeId), REASON_CODES.FOCUS_NODE);

  const eligibleRoute = route.map((id) => ({ node: nodes.get(id), prerequisite: prerequisiteStatus(nodes.get(id), input.evidence, independent) }))
    .filter(({ node, prerequisite }) => node && prerequisite.eligible && !focusNodeIds.includes(node.id));
  const nextNodes = focusNodeIds.length ? eligibleRoute : eligibleRoute.slice(0, 1);
  for (const { node, prerequisite } of nextNodes) addNodeProblems(node, REASON_CODES.NEXT_NODE, prerequisite);

  const selected = chooseBudgeted(candidates, limit, budget);
  const reasonCodes = selected.length ? [] : [
    !historical.size && !array(input.reviews).length && !upsolve.length ? REASON_CODES.NO_EVIDENCE : REASON_CODES.NO_CANDIDATES,
  ];
  return {
    algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
    candidates: selected,
    reasonCodes,
  };
}
