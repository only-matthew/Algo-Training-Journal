import assert from "node:assert/strict";
import test from "node:test";

import { MEMBER_CONFIG, memberByGithubId, memberById, memberByLogin } from "../workers/member-config.mjs";

test("member configuration uses unique stable identities and existing log directories", () => {
  assert.ok(MEMBER_CONFIG.length > 0);
  assert.equal(new Set(MEMBER_CONFIG.map((member) => member.memberId)).size, MEMBER_CONFIG.length);
  assert.equal(new Set(MEMBER_CONFIG.map((member) => member.githubUserId)).size, MEMBER_CONFIG.length);
  assert.equal(new Set(MEMBER_CONFIG.map((member) => member.login.toLowerCase())).size, MEMBER_CONFIG.length);
  for (const member of MEMBER_CONFIG) {
    assert.match(member.memberId, /^[a-z0-9][a-z0-9-]{0,47}$/);
    assert.ok(Number.isSafeInteger(member.githubUserId) && member.githubUserId > 0);
    assert.ok(member.logDirectory);
    assert.equal(memberByGithubId(member.githubUserId)?.memberId, member.memberId);
    assert.equal(memberByLogin(member.login.toUpperCase())?.memberId, member.memberId);
    assert.equal(memberById(member.memberId)?.githubUserId, member.githubUserId);
  }
});

test("unknown identities are never accepted by a fallback lookup", () => {
  assert.equal(memberByGithubId(0), null);
  assert.equal(memberByLogin("unknown-user"), null);
  assert.equal(memberById("unknown-member"), null);
});
