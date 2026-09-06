import assert from "node:assert/strict";
import test from "node:test";

import { createTrainingService, revisionManifest, sha256Hex, trainingPaths } from "../workers/services/training.mjs";

const MEMBER = "member-example";
const IDS = Object.freeze({
  operation: "4fd06885-a6ed-43b4-9ba6-ec8875638cdf",
  operation2: "0f7674cf-7366-4c0b-9df4-8b548c537385",
  event: "5ca1a170-b129-4df2-8f8d-c0341a213b34",
  review: "3d02d1a6-ddd3-4ff0-8d56-a0bbec564cc8",
  item: "8f1f477b-cb2e-45c8-8f07-d7c1cf3ed7f1",
});
const TIME = "2026-09-06T02:00:00.000Z";
const problem = { name: "Example", platform: "CodeForces", problemNumber: " 123a " };

function fakeGit() {
  let head = 0;
  const files = new Map([["h0", new Map()]]);
  return {
    async getHead() { return `h${head}`; },
    async readFile(current, path) { return files.get(current).get(path) ?? null; },
    async commit({ head: expected, changes }) {
      assert.equal(expected, `h${head}`);
      const next = new Map(files.get(expected));
      for (const change of changes) next.set(change.path, change.content);
      head += 1;
      files.set(`h${head}`, next);
      return { commitSha: `h${head}` };
    },
    snapshot() { return { head: `h${head}`, readFile: (path) => Promise.resolve(files.get(`h${head}`).get(path) ?? null) }; },
    content(path) { return files.get(`h${head}`).get(path); },
  };
}

async function revision(git, key, paths) {
  return revisionManifest(git.snapshot(), key, paths);
}

test("maps all persisted resources to the caller's owned training tree", async () => {
  const paths = trainingPaths(MEMBER);
  assert.equal(paths.profile, "training/members/member-example/profile.json");
  assert.equal(paths.plan("2026-09-06"), "training/members/member-example/plans/2026-09-06.json");
  assert.equal(paths.event(TIME, IDS.event), "training/members/member-example/events/2026-09/5ca1a170-b129-4df2-8f8d-c0341a213b34.json");
  assert.throws(() => paths.assessment("../outside"));
});

test("profile and plan commands validate a manifest revision and write canonical owned documents", async () => {
  const git = fakeGit();
  const service = createTrainingService({ git, now: () => TIME });
  const profile = await service.saveProfile({ memberId: MEMBER, operationId: IDS.operation, requestHash: "profile-a", profile: { dailyBudgetMinutes: 90 }, preconditions: { profile: null } });
  assert.equal(profile.data.dailyBudgetMinutes, 90);
  assert.match(git.content(trainingPaths(MEMBER).profile), /"memberId":"member-example"/);
  const planKey = "plan:2026-09-06";
  const saved = await service.savePlan({ memberId: MEMBER, operationId: IDS.operation2, requestHash: "plan-a", preconditions: { [planKey]: null }, plan: { date: "2026-09-06", items: [{ id: IDS.item, subjectKey: "problem:Codeforces|123A", problem, kind: "practice", status: "queued" }] } });
  assert.equal(saved.data.items.length, 1);
  await assert.rejects(
    service.savePlan({ memberId: MEMBER, operationId: IDS.event, requestHash: "plan-b", preconditions: { [planKey]: null }, plan: saved.data }),
    (error) => error.code === "VERSION_CONFLICT",
  );
});

test("attempt command assigns a sequence, normalizes its subject, and writes the matching review projection", async () => {
  const git = fakeGit();
  const service = createTrainingService({ git, now: () => TIME });
  const subject = "problem:Codeforces|123A";
  const reviewKey = `review:${await sha256Hex(subject)}`;
  const result = await service.recordAttempt({
    memberId: MEMBER, operationId: IDS.operation, requestHash: "attempt-a", preconditions: { [reviewKey]: null },
    attempt: { id: IDS.event, recordRef: { memberId: MEMBER, date: "2026-09-06", recordId: "record-1" }, problem, mode: "review", outcome: "independent", performedOn: "2026-09-06" },
  });
  assert.equal(result.data.subjectKey, subject);
  assert.equal(result.data.sequence, 0);
  assert.equal(result.review.dueOn, "2026-09-09");
  assert.deepEqual(JSON.parse(git.content(trainingPaths(MEMBER).sequence)), { next: 1 });
});

test("review actions use the current review manifest and sequence, then self assessments stay in their own path", async () => {
  const git = fakeGit();
  const service = createTrainingService({ git, now: () => TIME });
  const subject = "problem:Codeforces|123A";
  const subjectHash = await sha256Hex(subject);
  const key = `review:${subjectHash}`;
  const action = await service.applyReviewAction({ memberId: MEMBER, operationId: IDS.operation, requestHash: "review-a", preconditions: { [key]: null }, action: { id: IDS.review, subjectKey: subject, action: "pause" } });
  assert.equal(action.review.state, "paused");
  const assessmentKey = "assessment:dp";
  const saved = await service.saveSelfAssessment({ memberId: MEMBER, operationId: IDS.operation2, requestHash: "assessment-a", preconditions: { [assessmentKey]: null }, assessment: { nodeId: "dp", level: "learning", note: "repeat basics" } });
  assert.equal(saved.data.level, "learning");
  assert.ok(await revision(git, assessmentKey, [trainingPaths(MEMBER).assessment("dp")]));
});

test("replayed operations return the saved result before a stale precondition is checked", async () => {
  const git = fakeGit();
  const service = createTrainingService({ git, now: () => TIME });
  const request = { memberId: MEMBER, operationId: IDS.operation, requestHash: "profile-a", profile: { goalNote: "graphs" }, preconditions: { profile: null } };
  const first = await service.saveProfile(request);
  const replay = await service.saveProfile({ ...request, preconditions: { profile: "sha256:stale" } });
  assert.equal(first.data.goalNote, replay.data.goalNote);
  assert.equal(replay.operation.replayed, true);
});
