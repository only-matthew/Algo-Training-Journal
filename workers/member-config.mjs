import members from "../config/members.json" with { type: "json" };

const byGithubId = new Map(members.map((member) => [String(member.githubUserId), Object.freeze({ ...member })]));
const byLogin = new Map(members.map((member) => [member.login.toLowerCase(), Object.freeze({ ...member })]));
const byMemberId = new Map(members.map((member) => [member.memberId, Object.freeze({ ...member })]));

export const MEMBER_CONFIG = Object.freeze([...byMemberId.values()]);

export function memberByGithubId(id) {
  return byGithubId.get(String(id || "")) || null;
}

export function memberByLogin(login) {
  return byLogin.get(String(login || "").toLowerCase()) || null;
}

export function memberById(memberId) {
  return byMemberId.get(String(memberId || "")) || null;
}
