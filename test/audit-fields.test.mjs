// 审计字段（difficultyLegacy / difficultySource / difficultyRatingSource / problemNumberLegacy）
// 的往返保护。这些字段由 backfill/repair 脚本写入，记录"改动前的原值"，无法从当前值反推：
// 任何一次保存把它们弄丢都是永久性数据损失。
// 背景见 docs/Audit/AUDIT-2026-10-02.md §2.2。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AUDIT_PROBLEM_FIELDS,
  LOG_SCHEMA_VERSION,
  metaFromProblems,
  normalizeMeta,
  problemAuditFields,
  validateLogInput,
} from "../lib/log-schema.mjs";
import { ENRICHMENT_KEYS, normalizeEnrichment } from "../lib/problem-enrichment-schema.mjs";
import { createLogsV2Service } from "../workers/services/logs-v2.mjs";
import { gitBlobSha } from "../workers/services/log-paths.mjs";

const MEMBER = "廖夏";
const MEMBER_ID = "only-matthew";
const DATE = "2026-10-02";
const ROOT = `logs/${MEMBER}/2026/10/02`;

// 取自真实数据 logs/郭一鸣/2026/08/05/meta.json 的字段组合。
const STORED_PROBLEM = {
  id: "0bc639e3-1fe1-4a89-9e21-58b9ee6b4c26",
  name: "A - Riptide",
  platform: "Codeforces",
  problemNumber: "2254A",
  difficulty: "≤999",
  tags: ["模拟"],
  reviewStatus: "none",
  problemNumberLegacy: "2254A",
  difficultyLegacy: "≤1199",
  difficultySource: "CF 官方 rating 800",
  difficultyRatingSource: "CF 官方 rating 800",
};

test("problemAuditFields 只取字符串字段，并保留空串", () => {
  assert.deepEqual(problemAuditFields(STORED_PROBLEM), {
    problemNumberLegacy: "2254A",
    difficultyLegacy: "≤1199",
    difficultySource: "CF 官方 rating 800",
    difficultyRatingSource: "CF 官方 rating 800",
  });
  // 真实数据里存在空串（repair-problem-identity 没找到旧值时写 ""），不能当成"没有"。
  assert.deepEqual(problemAuditFields({ ...STORED_PROBLEM, problemNumberLegacy: "" }).problemNumberLegacy, "");
  assert.deepEqual(problemAuditFields({ difficultyLegacy: 42, problemNumberLegacy: null }), {});
  assert.deepEqual(problemAuditFields(undefined), {});
  // 上限兜底，避免客户端塞超长字符串。
  assert.equal(Object.values(problemAuditFields({ difficultyLegacy: "x".repeat(1000) }))[0].length, 200);
});

test("三个落盘白名单都透传审计字段（validateLogInput → metaFromProblems）", () => {
  const validated = validateLogInput(
    { schemaVersion: LOG_SCHEMA_VERSION, problems: [STORED_PROBLEM] },
    { recordDate: DATE, today: DATE },
  );
  for (const field of AUDIT_PROBLEM_FIELDS) {
    assert.equal(validated.problems[0][field], STORED_PROBLEM[field], `validateLogInput 丢了 ${field}`);
  }
  const meta = metaFromProblems(validated.problems, "2026-10-02T22:31:22.773+08:00", {});
  for (const field of AUDIT_PROBLEM_FIELDS) {
    assert.equal(meta.problems[0][field], STORED_PROBLEM[field], `metaFromProblems 丢了 ${field}`);
  }
  const normalized = normalizeMeta(meta);
  for (const field of AUDIT_PROBLEM_FIELDS) {
    assert.equal(normalized.problems[0][field], STORED_PROBLEM[field], `normalizeMeta 丢了 ${field}`);
  }
});

test("单题复习 PATCH 的读写往返不丢审计字段", () => {
  // 复刻 workers/services/legacy-logs.mjs:194-201 的 readLog 形状：在原始 meta 条目上
  // 展开正文，再叠加复习状态（workers/routes/logs-v2.mjs:36-45 的做法）。
  const read = { ...STORED_PROBLEM, description: "", takeaway: "…", code: "" };
  const patched = [{ ...read, reviewStatus: "todo", reviewDue: "2026-12-05" }];
  const validated = validateLogInput({ schemaVersion: LOG_SCHEMA_VERSION, problems: patched }, { recordDate: DATE, today: DATE });
  const meta = metaFromProblems(validated.problems, "2026-10-02T22:31:22.773+08:00", {});
  assert.equal(meta.problems[0].reviewStatus, "todo");
  assert.equal(meta.problems[0].reviewDue, "2026-12-05");
  for (const field of AUDIT_PROBLEM_FIELDS) {
    assert.equal(meta.problems[0][field], STORED_PROBLEM[field], `PATCH 往返丢了 ${field}`);
  }
});

test("ENRICHMENT_KEYS 必须与 normalizeEnrichment 内部的 values 键一致（迁移守卫）", async () => {
  // 这条守卫防的是"给 normalizeEnrichment 加了第 6 个字段但忘了同步 ENRICHMENT_KEYS"——
  // 那会让该字段在表单/草稿往返中被静默丢掉。运行时也有同样的断言，这里再锁一次源码。
  const source = await readFile(new URL("../lib/problem-enrichment-schema.mjs", import.meta.url), "utf8");
  const block = /const values = \{([\s\S]*?)\n {2}\};/.exec(source);
  assert.ok(block, "找不到 normalizeEnrichment 的 values 字面量");
  const keys = [...block[1].matchAll(/^ {4}([A-Za-z]+):/gm)].map((match) => match[1]);
  assert.deepEqual(keys, [...ENRICHMENT_KEYS]);
  // 行为面：提供的已知键不能被过滤掉。
  assert.deepEqual(Object.keys(normalizeEnrichment({ statementImages: [] })), ["statementImages"]);
});

/** 最小内存版 Git 适配器：只实现 logs-v2 服务用到的契约。 */
function createMemoryGit(initial = new Map()) {
  const files = new Map(initial);
  let head = "commit-1";
  return {
    files,
    async getHead() { return head; },
    async listFiles(_snapshot, prefix) { return [...files.keys()].filter((path) => path.startsWith(prefix)); },
    async listFileEntries(_snapshot, prefix) {
      return Promise.all([...files.keys()].filter((path) => path.startsWith(prefix))
        .map(async (path) => ({ path, sha: await gitBlobSha(files.get(path)) })));
    },
    async readFile(_head, path) { return files.has(path) ? files.get(path) : null; },
    async readBytes(_head, path) { return files.has(path) ? new TextEncoder().encode(files.get(path)) : null; },
    async commit({ changes }) {
      for (const change of changes) {
        if (change.delete) files.delete(change.path);
        else files.set(change.path, change.content);
      }
      head = `commit-${Number(head.split("-")[1]) + 1}`;
      return { commitSha: head };
    },
  };
}

const OPERATION_1 = "11111111-1111-4111-8111-111111111111";
const OPERATION_2 = "22222222-2222-4222-8222-222222222222";

const clientProblem = (overrides = {}) => ({
  id: STORED_PROBLEM.id,
  name: STORED_PROBLEM.name,
  platform: STORED_PROBLEM.platform,
  problemNumber: STORED_PROBLEM.problemNumber,
  difficulty: STORED_PROBLEM.difficulty,
  tags: STORED_PROBLEM.tags,
  reviewStatus: "none",
  ...overrides,
});

test("v2 整天保存会从服务端现有记录继承审计字段（客户端从不发送它们）", async () => {
  const git = createMemoryGit();
  const service = createLogsV2Service({ git, now: () => "2026-10-02T22:31:22.773+08:00" });

  // 第一次保存：客户端没有审计字段（模拟表单/旧客户端）。
  await service.save({
    memberId: MEMBER_ID, member: MEMBER, date: DATE, operationId: OPERATION_1, expectedVersion: null,
    log: { schemaVersion: LOG_SCHEMA_VERSION, problems: [clientProblem()] },
  });
  const metaPath = `${ROOT}/meta.json`;
  assert.ok(!git.files.get(metaPath).includes("difficultyLegacy"), "初始保存不应凭空产生审计字段");

  // 模拟 backfill 脚本事后把审计字段写进仓库（真实数据就是这样来的）。
  const stored = JSON.parse(git.files.get(metaPath));
  Object.assign(stored.problems[0], problemAuditFields(STORED_PROBLEM));
  git.files.set(metaPath, `${JSON.stringify(stored, null, 2)}\n`);

  const { version } = await service.read({ member: MEMBER, date: DATE });
  const result = await service.save({
    memberId: MEMBER_ID, member: MEMBER, date: DATE, operationId: OPERATION_2, expectedVersion: version,
    log: { schemaVersion: LOG_SCHEMA_VERSION, problems: [clientProblem({ reviewStatus: "todo", reviewDue: "2026-12-05" })] },
  });

  const after = JSON.parse(git.files.get(metaPath));
  assert.equal(after.problems[0].reviewStatus, "todo", "本次修改应已生效");
  assert.equal(after.problems[0].reviewDue, "2026-12-05");
  for (const field of AUDIT_PROBLEM_FIELDS) {
    assert.equal(after.problems[0][field], STORED_PROBLEM[field], `v2 保存丢了 ${field}`);
  }
  assert.ok(result.commitSha, "保存应返回提交号");
  assert.equal(result.publicationStatus, "pending");
});

test("v2 整天保存的 meta.json 以换行结尾（与旧接口保持一致）", async () => {
  const git = createMemoryGit();
  const service = createLogsV2Service({ git, now: () => "2026-10-02T22:31:22.773+08:00" });
  await service.save({
    memberId: MEMBER_ID, member: MEMBER, date: DATE, operationId: OPERATION_1, expectedVersion: null,
    log: { schemaVersion: LOG_SCHEMA_VERSION, problems: [clientProblem()] },
  });
  const raw = git.files.get(`${ROOT}/meta.json`);
  assert.ok(raw.endsWith("}\n"), "meta.json 必须与 planLogChanges 的口径一致（尾随换行）");
});
