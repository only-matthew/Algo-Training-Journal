const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { discoverDateDirs: discoverLogDateDirs } = require("./log-layout.js");

function readLogs({ root: ROOT, logsDir: LOGS_DIR, normalizeMeta, normalizeLearningState, toUtc8 }) {
  const learningState = normalizeLearningState;
// 批量获取多个文件各自的最后一次提交时间（一次 git log，替代每文件 spawn 一次进程）
function lastCommitDates(relPaths) {
  const map = new Map();
  if (!relPaths.length) return map;
  try {
    const out = execFileSync("git", ["log", "--format=%cI%x1f", "--name-only", "--", ...relPaths], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    let date = null;
    for (const line of out.split("\n")) {
      if (line.endsWith("\x1f")) {
        date = line.slice(0, -1);
        continue;
      }
      if (line && !map.has(line)) map.set(line, date);
    }
  } catch {
    // git 不可用时保持空表，调用方回退到 mtime
  }
  return map;
}

function readMeta(dateDir, member, date, commitDates) {
  const metaPath = path.join(dateDir, "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  const normalized = normalizeMeta(JSON.parse(fs.readFileSync(metaPath, "utf8")), {
    legacyIdPrefix: `${member}-${date}`,
  });
  // 旧记录没有 updatedAt 时，优先使用 git 最后一次提交时间
  // （文件 mtime 会被 clone/pull 重置为拉取时刻，不可靠），并统一转为 UTC+8
  if (!normalized.updatedAt) {
    const relPath = path.relative(ROOT, metaPath).split(path.sep).join("/");
    const commitDate = commitDates.get(relPath);
    normalized.updatedAt = toUtc8(commitDate || new Date(fs.statSync(metaPath).mtime));
  }
  return normalized;
}

function readProblemFile(dir, filename) {
  const p = path.join(dir, filename);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8").trim();
}

function readTakeawayFile(dir, filename) {
  const value = readProblemFile(dir, filename);
  return value === "未填写" ? "" : value;
}

function appendDateLogs(logs, member, date, dateDir, commitDates) {
  const meta = readMeta(dateDir, member, date, commitDates);
  if (!meta || !meta.problems || !meta.problems.length) return;

  for (let i = 0; i < meta.problems.length; i++) {
    const p = meta.problems[i];
    const slot = Number.isInteger(p.fileIndex) && p.fileIndex >= 0 ? p.fileIndex : i;
    logs.push({
      member,
      date,
      startedOn: meta.startedOn,
      solvedOn: meta.solvedOn,
      updatedAt: meta.updatedAt,
      problemIndex: i,
      problemId: p.id,
      problem: p.name || "未填写",
      platform: p.platform || "未填写",
      problemNumber: p.problemNumber || "",
      description: readProblemFile(dateDir, `${slot}-desc.md`),
      takeaway: readTakeawayFile(dateDir, `${slot}-takeaway.md`),
      blocker: p.blocker || "",
      difficulty: p.difficulty || "未标注",
      difficultyRating: Number.isFinite(Number(p.difficultyRating)) ? Number(p.difficultyRating) : 0,
      tags: p.tags || [],
      ...learningState(p),
      ...(p.reviewDue ? { reviewDue: p.reviewDue } : {}),
      code: readProblemFile(dateDir, `${slot}-solution.cpp`),
      ...(p.statementAttachment ? { statementAttachment: p.statementAttachment, statementPath: path.join(dateDir, `${slot}-statement-${p.statementAttachment.sha256}.pdf`) } : {}),
      ...(Array.isArray(p.statementImages) && p.statementImages.length ? { statementImages: p.statementImages, statementImagePaths: new Map(p.statementImages.map((image) => [image.fileName, path.join(dateDir, image.fileName)])) } : {}),
      ...(p.statementSource ? { statementSource: p.statementSource } : {}),
      ...(p.metadataSources ? { metadataSources: p.metadataSources } : {}),
      ...(p.aiAnalysis ? { aiAnalysis: p.aiAnalysis } : {}),
    });
  }
}

function collectLogs() {
  const { members, dateDirs } = discoverLogDateDirs(LOGS_DIR);

  // 一次 git log 批量取得所有 meta.json 的最后提交时间
  const commitDates = lastCommitDates(
    dateDirs.map(({ dir }) => path.relative(ROOT, path.join(dir, "meta.json")).split(path.sep).join("/")),
  );

  const logs = [];
  for (const { member, date, dir } of dateDirs) appendDateLogs(logs, member, date, dir, commitDates);

  logs.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.member.localeCompare(b.member, "zh-CN") ||
      a.problem.localeCompare(b.problem, "zh-CN"),
  );

  return { members, logs };
}

  return collectLogs();
}

module.exports = { readLogs };
