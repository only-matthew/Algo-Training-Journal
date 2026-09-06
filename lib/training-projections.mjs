// Pure projections for training events.  The caller supplies the event snapshot
// and (where relevant) its calendar implementation; this module never reads a
// clock, the DOM, or storage.

const KNOWN_OUTCOMES = new Set(["unfinished", "independent", "hinted", "editorial"]);
const ASSISTED_OUTCOMES = new Set(["hinted", "editorial"]);

function compareSequence(a, b) {
  return Number(a.sequence) - Number(b.sequence);
}

function ordered(events) {
  return [...(events || [])].sort(compareSequence);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function defaultAddDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

export function createUtcDateMath() {
  return { addDays: defaultAddDays };
}

function dateMathFrom(options) {
  const supplied = options?.dateMath;
  if (supplied?.addDays) return supplied;
  return createUtcDateMath();
}

/**
 * Applies immutable correction and void events to their original attempts.
 * Corrections retain the original attempt sequence: a correction must not make
 * an old training result outrank a newer review action.
 */
export function foldTrainingEvents(events) {
  const attempts = new Map();

  for (const event of ordered(events)) {
    if (event?.type === "attempt.recorded" && event.id) {
      attempts.set(event.id, { ...event, originalSequence: event.sequence, correctionSequence: null, voided: false });
      continue;
    }

    if (event?.type === "attempt.corrected") {
      const target = attempts.get(event.targetAttemptId);
      if (!target || target.voided) continue;
      const patch = event.patch || {};
      for (const field of ["outcome", "performedOn", "durationMinutes", "errorTags", "note"]) {
        if (Object.hasOwn(patch, field)) target[field] = patch[field];
      }
      target.correctionSequence = event.sequence;
      continue;
    }

    if (event?.type === "attempt.voided") {
      const target = attempts.get(event.targetAttemptId);
      if (target) target.voided = true;
    }
  }

  return [...attempts.values()]
    .filter((attempt) => !attempt.voided)
    .sort((a, b) => a.performedOn.localeCompare(b.performedOn) || Number(a.originalSequence) - Number(b.originalSequence));
}

export const resolveEffectiveAttempts = foldTrainingEvents;

function reviewResultsByDay(attempts) {
  const byDay = new Map();
  for (const attempt of attempts) {
    if (attempt.mode !== "review" || !KNOWN_OUTCOMES.has(attempt.outcome)) continue;
    const previous = byDay.get(attempt.performedOn);
    if (!previous || Number(attempt.originalSequence) > Number(previous.originalSequence)) byDay.set(attempt.performedOn, attempt);
  }
  return [...byDay.values()].sort((a, b) => a.performedOn.localeCompare(b.performedOn) || Number(a.originalSequence) - Number(b.originalSequence));
}

function automaticReview(attempts, dateMath) {
  let successStreak = 0;
  let dueOn = null;
  let lastAttempt = null;

  for (const attempt of reviewResultsByDay(attempts)) {
    lastAttempt = attempt;
    if (attempt.outcome === "unfinished") {
      successStreak = 0;
      dueOn = dateMath.addDays(attempt.performedOn, 1);
    } else if (ASSISTED_OUTCOMES.has(attempt.outcome)) {
      successStreak = 0;
      dueOn = dateMath.addDays(attempt.performedOn, 3);
    } else if (attempt.outcome === "independent") {
      successStreak += 1;
      dueOn = dateMath.addDays(attempt.performedOn, [3, 7, 14, 30][Math.min(successStreak, 4) - 1]);
    }
  }

  return { successStreak, dueOn, lastAttempt };
}

function latestScheduleEvent(events) {
  return ordered(events)
    .filter((event) => ["review.scheduled", "review.deferred", "review.paused", "review.archived"].includes(event?.type))
    .at(-1) || null;
}

function legacyFallback(legacyReviews) {
  const active = asArray(legacyReviews)
    .filter((review) => review?.reviewStatus === "todo" || review?.reviewDue)
    .sort((a, b) => (a.reviewDue || "9999-12-31").localeCompare(b.reviewDue || "9999-12-31"));
  if (!active.length) return null;
  return { state: "scheduled", dueOn: active[0].reviewDue || null, source: "legacy" };
}

/** Projects one subject's review state from all of that subject's events. */
export function projectReviewSchedule({ memberId, subjectKey, events = [], legacyReviews = [], dateMath } = {}) {
  const memberEvents = asArray(events).filter((event) => !memberId || event.memberId === memberId);
  const subjectAttemptIds = new Set(memberEvents
    .filter((event) => event?.type === "attempt.recorded" && (!subjectKey || event.subjectKey === subjectKey))
    .map((event) => event.id));
  // Correction and void events deliberately do not repeat subjectKey.  Fold the
  // member snapshot first, then select the effective attempts for this subject.
  const attempts = foldTrainingEvents(memberEvents).filter((attempt) => !subjectKey || attempt.subjectKey === subjectKey);
  const relevantSchedules = memberEvents.filter((event) => !subjectKey || event.subjectKey === subjectKey);
  const automatic = automaticReview(attempts, dateMathFrom({ dateMath }));
  const explicit = latestScheduleEvent(relevantSchedules);
  const lastAttemptSequence = automatic.lastAttempt ? Number(automatic.lastAttempt.originalSequence) : -Infinity;

  let state;
  let dueOn;
  let source;
  if (explicit && Number(explicit.sequence) > lastAttemptSequence) {
    state = explicit.type === "review.paused" ? "paused" : explicit.type === "review.archived" ? "archived" : "scheduled";
    dueOn = state === "scheduled" ? explicit.dueOn : null;
    source = "explicit";
  } else if (automatic.lastAttempt) {
    state = "scheduled";
    dueOn = automatic.dueOn;
    source = "automatic";
  } else {
    const legacy = legacyFallback(legacyReviews);
    state = legacy?.state || "scheduled";
    dueOn = legacy?.dueOn || null;
    source = legacy?.source || "none";
  }

  return {
    schemaVersion: 1,
    ...(memberId ? { memberId } : {}),
    ...(subjectKey ? { subjectKey } : {}),
    state,
    dueOn,
    successStreak: automatic.successStreak,
    lastAttemptId: automatic.lastAttempt?.id || null,
    lastReviewedOn: automatic.lastAttempt?.performedOn || null,
    appliedSequence: Math.max(-1, ...memberEvents
      .filter((event) => !subjectKey || event.subjectKey === subjectKey || subjectAttemptIds.has(event.id) || subjectAttemptIds.has(event.targetAttemptId))
      .map((event) => Number(event.sequence) || -1)),
    source,
  };
}

export const projectReview = projectReviewSchedule;

function eligibleSubject(subjectKeys, subjectKey) {
  return !subjectKeys || subjectKeys.has(subjectKey);
}

/** Builds the evidence-v1 card for a node from an already-read event snapshot. */
export function buildEvidenceV1({ attempts = [], legacyRecords = [], reviews = [], subjectKeys, selfAssessment = null, today, dateMath } = {}) {
  const filter = subjectKeys == null ? null : new Set(subjectKeys);
  const effective = asArray(attempts).filter((attempt) => eligibleSubject(filter, attempt.subjectKey));
  const legacy = asArray(legacyRecords).filter((record) => eligibleSubject(filter, record.subjectKey));
  const allSubjects = new Set([...effective, ...legacy].map((item) => item.subjectKey).filter(Boolean));
  const independent = new Set(effective.filter((attempt) => attempt.outcome === "independent").map((attempt) => attempt.subjectKey));
  const assisted = new Set(effective
    .filter((attempt) => ASSISTED_OUTCOMES.has(attempt.outcome) && !independent.has(attempt.subjectKey))
    .map((attempt) => attempt.subjectKey));
  const dueReviews = asArray(reviews).filter((review) =>
    eligibleSubject(filter, review.subjectKey) && review.state === "scheduled" && review.dueOn && today && review.dueOn <= today,
  ).length;
  const dates = [...effective, ...legacy].map((item) => item.performedOn || item.date).filter(Boolean).sort();
  const recordRefs = new Map();
  for (const item of [...effective, ...legacy]) {
    const ref = item.recordRef || (item.id ? { id: item.id } : null);
    if (ref) recordRefs.set(JSON.stringify(ref), ref);
  }

  const reasons = [];
  let state;
  if (dueReviews) {
    state = "review_due";
    reasons.push("REVIEW_DUE");
  } else if (!effective.length && !legacy.length) {
    state = "no_evidence";
    reasons.push("NO_EVIDENCE");
  } else if (independent.size) {
    state = "independent_evidence";
    reasons.push("INDEPENDENT_EVIDENCE");
  } else {
    state = "practiced";
    reasons.push("PRACTICED");
  }
  const lastPracticedOn = dates.at(-1) || null;
  if (today && lastPracticedOn && dateMathFrom({ dateMath }).addDays(lastPracticedOn, 90) < today) reasons.push("RECENT_EVIDENCE_INSUFFICIENT");

  return {
    distinctProblems: allSubjects.size,
    attempts: effective.length,
    independentProblems: independent.size,
    assistedProblems: assisted.size,
    legacyUnknownRecords: legacy.length,
    dueReviews,
    lastPracticedOn,
    selfAssessment,
    state,
    reasons,
    recordRefs: [...recordRefs.values()],
  };
}

export const buildEvidence = buildEvidenceV1;
