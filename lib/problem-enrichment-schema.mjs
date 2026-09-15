import { validateAnalysisResult, PROBLEM_ANALYSIS_PROMPT_VERSION } from "./problem-analysis.mjs";
import { normalizeTagList } from "./tag-catalog.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;

function fields(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError(`${label}字段无效`);
}

function string(value, label, max, { optional = false } = {}) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${label}无效`);
  return value;
}

function timestamp(value, label, optional = true) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) throw new TypeError(`${label}时间无效`);
  return value;
}

function attachment(value) {
  if (value === undefined) return undefined;
  fields(value, ["sha256", "fileName", "bytes", "mimeType", "pageRange"], "题面附件");
  if (typeof value.sha256 !== "string" || !HASH.test(value.sha256)
    || !Number.isInteger(value.bytes) || value.bytes < 1 || value.bytes > 5_242_880
    || value.mimeType !== "application/pdf") throw new TypeError("题面附件无效");
  const fileName = string(value.fileName, "附件文件名", 200);
  if (/[\r\n\0]/.test(fileName)) throw new TypeError("附件文件名无效");
  let pageRange;
  if (value.pageRange !== undefined) {
    fields(value.pageRange, ["from", "to"], "PDF 页码范围");
    const { from, to } = value.pageRange;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > 10000) throw new TypeError("PDF 页码范围无效");
    pageRange = { from, to };
  }
  return { sha256: value.sha256, fileName, bytes: value.bytes, mimeType: "application/pdf", ...(pageRange ? { pageRange } : {}) };
}

function statementSource(value) {
  if (value === undefined) return undefined;
  fields(value, ["kind", "url", "fetchedAt", "parserVersion"], "题面来源");
  if (!["manual", "codeforces-html", "ai-summary"].includes(value.kind)) throw new TypeError("题面来源无效");
  if (value.url !== undefined) {
    string(value.url, "题面来源地址", 2048);
    let url;
    try { url = new URL(value.url); } catch { throw new TypeError("题面来源地址无效"); }
    if (url.protocol !== "https:" || url.hostname !== "codeforces.com" || url.username || url.password || url.port
      || !/^\/(?:problemset\/problem\/\d+\/[A-Z]\d*|(?:contest|gym)\/\d+\/problem\/[A-Z]\d*)\/?$/i.test(url.pathname)) throw new TypeError("题面来源地址无效");
  }
  timestamp(value.fetchedAt, "题面抓取");
  string(value.parserVersion, "解析版本", 80, { optional: true });
  return { ...value };
}

function metadataSources(value, problemTags) {
  if (value === undefined) return undefined;
  fields(value, ["difficultyRating", "tags"], "元数据来源");
  const normalized = {};
  if (value.difficultyRating !== undefined) {
    const rating = value.difficultyRating;
    fields(rating, ["kind", "reference", "acceptedAt"], "难度来源");
    if (!["official", "manual", "ai-estimate", "legacy-unknown"].includes(rating.kind)) throw new TypeError("难度来源无效");
    string(rating.reference, "难度来源参考", 2048, { optional: true });
    timestamp(rating.acceptedAt, "难度应用");
    normalized.difficultyRating = { ...rating };
  }
  if (value.tags !== undefined) {
    if (!Array.isArray(value.tags) || value.tags.length > 10) throw new TypeError("标签来源无效");
    const rawTags = Array.isArray(problemTags) ? problemTags : typeof problemTags === "string" ? problemTags.split(/[,，、]/) : [];
    const current = new Set(normalizeTagList(rawTags));
    const seen = new Set();
    normalized.tags = [];
    for (const entry of value.tags) {
      fields(entry, ["tag", "kind"], "标签来源");
      string(entry.tag, "来源标签", 30);
      if (!["official", "manual", "ai-suggested", "legacy-unknown"].includes(entry.kind)) throw new TypeError("标签来源无效");
      for (const tag of normalizeTagList([entry.tag])) {
        if (!current.has(tag) || seen.has(tag)) continue;
        seen.add(tag);
        normalized.tags.push({ tag, kind: entry.kind });
      }
    }
  }
  return normalized;
}

function aiAnalysis(value) {
  if (value === undefined) return undefined;
  fields(value, ["schemaVersion", "requestId", "inputFingerprint", "provider", "promptVersion", "acceptedAt", "result", "appliedFields"], "AI 分析");
  if (value.schemaVersion !== 1 || typeof value.requestId !== "string" || !UUID.test(value.requestId)
    || typeof value.inputFingerprint !== "string" || !HASH.test(value.inputFingerprint)
    || !["deepseek-web", "other-web"].includes(value.provider) || value.promptVersion !== PROBLEM_ANALYSIS_PROMPT_VERSION
    || !Array.isArray(value.appliedFields) || !value.appliedFields.length || value.appliedFields.length > 3
    || new Set(value.appliedFields).size !== value.appliedFields.length
    || value.appliedFields.some((field) => !["description", "difficultyRating", "tags"].includes(field))) throw new TypeError("AI 分析无效");
  timestamp(value.acceptedAt, "AI 应用", false);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 32 * 1024) throw new RangeError("AI 分析不能超过 32 KiB");
  // A saved analysis describes the original input; the current description may
  // already be its applied summary. Validate its full protocol, not a new input hash.
  const result = validateAnalysisResult(value.result, {
    requestId: value.requestId,
    inputFingerprint: value.inputFingerprint,
    input: value.result?.problem || {},
  });
  if (value.appliedFields.includes("difficultyRating") && (result.difficulty.estimate === null || result.missingInformation.length)) throw new TypeError("资料不足的 AI 分析不能应用难度");
  return { ...value, result, appliedFields: [...value.appliedFields] };
}

export function normalizeEnrichment(problem = {}) {
  const values = {
    statementAttachment: attachment(problem.statementAttachment),
    statementSource: statementSource(problem.statementSource),
    metadataSources: metadataSources(problem.metadataSources, problem.tags),
    aiAnalysis: aiAnalysis(problem.aiAnalysis),
  };
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}
