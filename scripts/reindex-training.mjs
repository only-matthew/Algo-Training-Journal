import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { normalizeMeta } from "../lib/log-schema.mjs";
import { subjectKeyForProblem } from "../lib/problem-identity.mjs";
import { catalogProblem } from "../lib/recommendations.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const MEMBER_IDS = Object.freeze({
  "廖夏": "only-matthew",
  "王梓豪": "wzzzzhhhhh",
  "郭一鸣": "seanist-isx",
});
const CATALOG_PATH = "training/indexes/catalog.json";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function serialized(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function buildTrainingCatalog() {
  const roadmap = readJson("curriculum/roadmap.json");
  if (!Array.isArray(roadmap)) throw new TypeError("curriculum/roadmap.json 必须是阶段数组");
  const ids = roadmap.flatMap((phase) => phase.nodes || []);
  const nodes = ids.map((id) => {
    if (!/^[a-z0-9-]+$/.test(id)) throw new TypeError(`无效的训练节点 ID: ${id}`);
    const source = readJson(`curriculum/nodes/${id}.json`);
    if (source.id !== id || !Array.isArray(source.problems)) throw new TypeError(`训练节点缺失或无效: ${id}`);
    return {
      id,
      title: source.title,
      prerequisites: source.prerequisites || [],
      problems: source.problems.map(catalogProblem),
    };
  });
  return { schemaVersion: 1, curriculumHash: stableHash({ roadmap, nodes }), nodes };
}

function walkMetaFiles(directory, result = []) {
  if (!existsSync(directory)) return result;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walkMetaFiles(path, result);
    else if (entry.name === "meta.json") result.push(path);
  }
  return result;
}

function dateFromMetaPath(memberRoot, path) {
  const value = relative(memberRoot, path).split(sep).join("/");
  let match = /^(\d{4})\/(\d{2})\/(\d{2})\/meta\.json$/.exec(value);
  if (match) return { date: match.slice(1).join("-"), current: true };
  match = /^(\d{4})-(\d{2})-(\d{2})\/meta\.json$/.exec(value);
  return match ? { date: match.slice(1).join("-"), current: false } : null;
}

export function legacyIndexPath(memberId) {
  return `training/members/${memberId}/indexes/legacy.json`;
}

export function buildLegacyIndex(member, memberId) {
  const memberRoot = resolve(ROOT, "logs", member);
  const byDate = new Map();
  for (const path of walkMetaFiles(memberRoot)) {
    const parsed = dateFromMetaPath(memberRoot, path);
    if (!parsed) continue;
    if (!byDate.has(parsed.date) || parsed.current) byDate.set(parsed.date, path);
  }
  const records = [];
  for (const [date, path] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
    const meta = normalizeMeta(JSON.parse(readFileSync(path, "utf8")), { legacyIdPrefix: `${member}-${date}` });
    for (const problem of meta.problems) {
      const recordRef = { memberId, date, recordId: problem.id };
      records.push({
        subjectKey: subjectKeyForProblem({ ...recordRef, ...problem }),
        date,
        recordRef,
        problem: catalogProblem(problem),
        reviewStatus: problem.reviewStatus,
        ...(problem.reviewDue ? { reviewDue: problem.reviewDue } : {}),
        href: `/problem/${[member, date, problem.id].map(encodeURIComponent).join("/")}/`,
      });
    }
  }
  return { schemaVersion: 1, memberId, member, records };
}

export function buildTrainingReadModels() {
  const files = new Map([[CATALOG_PATH, buildTrainingCatalog()]]);
  for (const [member, memberId] of Object.entries(MEMBER_IDS)) {
    files.set(legacyIndexPath(memberId), buildLegacyIndex(member, memberId));
  }
  return files;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const write = args.has("--write");
  const check = args.has("--check");
  if (write && check) throw new TypeError("--write 与 --check 不能同时使用");
  const changed = [];
  for (const [path, value] of buildTrainingReadModels()) {
    const absolute = resolve(ROOT, path);
    const expected = serialized(value);
    const actual = existsSync(absolute) ? readFileSync(absolute, "utf8").replace(/\r\n/g, "\n") : null;
    if (actual === expected) continue;
    changed.push(path);
    if (write) {
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, expected, "utf8");
    }
  }
  if (check && changed.length) {
    console.error(`训练读取索引已过期：${changed.join(", ")}。请运行 npm run training:reindex -- --write`);
    process.exitCode = 1;
    return;
  }
  if (write) console.log(changed.length ? `已更新 ${changed.length} 个训练读取索引。` : "训练读取索引无需更新。");
  else console.log(changed.length ? `将更新 ${changed.length} 个训练读取索引：${changed.join(", ")}` : "训练读取索引已是最新。");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
