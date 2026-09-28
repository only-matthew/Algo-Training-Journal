import { isDateString } from "../../lib/log-schema.mjs";
import { trainingPaths } from "../services/training.mjs";
import { planLegacyIndexChange } from "../services/log-planning.mjs";
import { createLogsV2Service, parseLogsV2Request } from "../services/logs-v2.mjs";
import { readLog, saveLog } from "../services/legacy-logs.mjs";
import { trainingGit } from "../storage/training-git.mjs";

// v2 日志路由：整日读写/删除与题面 PDF/图片附件。这是 logs-v2 服务唯一的对外入口，
// 负责把 HTTP 语义（幂等键、条件版本、multipart、Content-Disposition）接到纯业务服务上。
export async function handleLogsV2(request, user, url, { v2Json, readJsonBody, requireIdempotencyKey, requireObject }) {
  const suffix = url.pathname.slice("/api/v2".length);
  const recordMatch = /^\/me\/logs\/dates\/(\d{4}-\d{2}-\d{2})\/records\/([^/]+)$/.exec(suffix);
  const dateMatch = /^\/logs\/dates\/(\d{4}-\d{2}-\d{2})$/.exec(suffix);
  const statementMatch = /^\/logs\/dates\/(\d{4}-\d{2}-\d{2})\/problems\/([^/]+)\/statement$/.exec(suffix);
  const imageMatch = /^\/logs\/dates\/(\d{4}-\d{2}-\d{2})\/problems\/([^/]+)\/images\/([^/]+)$/.exec(suffix);
  if (!recordMatch && !dateMatch && !statementMatch && !imageMatch) return null;
  const date = (recordMatch || dateMatch || statementMatch || imageMatch)[1];

  if (recordMatch) {
    if (request.method !== "PATCH") return null;
    const recordId = decodeURIComponent(recordMatch[2]);
    const patch = requireObject(await readJsonBody(request, 32 * 1024));
    const allowed = new Set(["reviewStatus", "reviewDue"]);
    if (Object.keys(patch).some((key) => !allowed.has(key))) {
      throw Object.assign(new Error("单题复习命令只能修改复习状态和日期"), { code: "MALFORMED_REQUEST", status: 400 });
    }
    if (!['todo', 'archived'].includes(patch.reviewStatus)) {
      throw Object.assign(new Error("复习状态无效"), { code: "VALIDATION_FAILED", status: 422 });
    }
    if (patch.reviewDue !== undefined && patch.reviewDue !== null && !isDateString(patch.reviewDue)) {
      throw Object.assign(new Error("复习日期无效"), { code: "VALIDATION_FAILED", status: 422 });
    }
    const current = await readLog(user, date);
    const index = current.problems.findIndex((problem) => problem.id === recordId);
    if (index < 0) throw Object.assign(new Error("未找到这条题目记录"), { code: "NOT_FOUND", status: 404 });
    const problems = current.problems.map((problem, problemIndex) => problemIndex === index ? {
      ...problem,
      reviewStatus: patch.reviewStatus,
      ...(patch.reviewStatus === "archived" || patch.reviewDue == null ? { reviewDue: undefined } : { reviewDue: patch.reviewDue }),
    } : problem);
    const result = await saveLog(user, date, {
      problems,
      ...(current.startedOn ? { startedOn: current.startedOn } : {}),
      ...(current.solvedOn ? { solvedOn: current.solvedOn } : {}),
    }, current.revision);
    return v2Json(request, { record: result.problems[index], revision: result.revision }, { revision: result.revision });
  }
  const git = trainingGit(user.token);
  const legacyIndexPath = trainingPaths(user.memberId).legacyIndex;
  // 附件、正文与个人训练索引必须落在同一个 commit；索引缺失时按既有语义报 INDEX_STALE。
  const auxiliaryChanges = async ({ snapshot, date: logDate, problems }) => {
    const raw = await git.readFile(snapshot.head, legacyIndexPath);
    const change = planLegacyIndexChange({ memberId: user.memberId, member: user.member }, logDate, problems, raw);
    return change ? [change] : [];
  };
  const service = createLogsV2Service({ git, planAuxiliaryChanges: auxiliaryChanges });

  if (statementMatch) {
    if (request.method !== "GET") return null;
    const recordId = decodeURIComponent(statementMatch[2]);
    const attachment = await service.statement({ member: user.member, date, recordId });
    const fileName = attachment.fileName.replace(/[\r\n]/g, " ").trim() || "statement.pdf";
    return new Response(attachment.bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        ETag: `"sha256:${attachment.sha256}"`,
      },
    });
  }

  if (imageMatch) {
    if (request.method !== "GET") return null;
    const recordId = decodeURIComponent(imageMatch[2]);
    const image = await service.statementImage({ member: user.member, date, recordId, fileName: decodeURIComponent(imageMatch[3]) });
    return new Response(image.bytes, {
      status: 200,
      headers: {
        "Content-Type": image.mimeType,
        // 图片要在题面里内联显示：文件名即内容哈希，可以长缓存，但附件接口需要会话。
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=86400",
        ETag: `"sha256:${image.sha256}"`,
      },
    });
  }

  if (request.method === "GET") {
    const current = await service.read({ member: user.member, date });
    return v2Json(request, { ...current.log, version: current.version, revision: current.version });
  }

  if (request.method === "PUT" || request.method === "DELETE") {
    const operationId = requireIdempotencyKey(request);
    let requestBody;
    let expectedVersion;
    let attachmentChanges;
    let attachments;
    let images;
    if (request.method === "PUT") {
      const parsed = await parseLogsV2Request(request);
      const payload = requireObject(parsed.payload);
      requestBody = payload.log;
      expectedVersion = payload.expectedVersion;
      attachmentChanges = payload.attachmentChanges;
      attachments = parsed.attachments;
      images = parsed.images;
    } else {
      const payload = requireObject(await readJsonBody(request, 64 * 1024));
      expectedVersion = payload.expectedVersion;
    }
    const base = { memberId: user.memberId, member: user.member, date, operationId, expectedVersion };

    if (request.method === "PUT") {
      const result = await service.save({ ...base, log: requestBody, attachmentChanges, attachments, images });
      // `revision` is the name every client reads; keep it in the body as well as the
      // ETag so a save and a read are interchangeable for the caller.
      return v2Json(request, { ...result, revision: result.version }, { revision: result.version });
    }

    const result = await service.remove(base);
    return v2Json(request, { ...result, revision: null });
  }

  return null;
}
