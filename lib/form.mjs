import { createProblemId, LOG_LIMITS, LOG_SCHEMA_VERSION, logInputBytes, validateLogInput } from "./log-schema.mjs";
import { normalizeLearningState, MASTERY_STATUSES, REVIEW_STATUSES } from "./learning-state.mjs";
import { apiRequest, deleteDateLog, loadDateLog, saveDateLog, saveDateLogV2, statementUrl, statementImageUrl, importCodeforces, importLuogu, importAtCoder, fetchProblemStatement, parseProblemStatementHtml } from "./journal-api.js";
import { PLATFORMS, toDateString, toUtc8, formatUpdateTime } from "./constants.mjs";
import { currentUser } from "./auth.mjs";
import { CANONICAL_TAGS, normalizeTagList } from "./tag-catalog.mjs";
import { createDraftStore } from "./draft-store.mjs";
import { createAttachmentStore, sha256Hex, validateAttachmentFile } from "./attachment-store.mjs";
import { MAX_NEW_STATEMENT_IMAGE_BYTES, MAX_STATEMENT_IMAGES, MAX_STATEMENT_IMAGE_BYTES, base64ToBytes, parseStatementImageName } from "./statement-images.mjs";
import { STANDARD_RATINGS, parseRatingLabel, ratingLabel, resolveDifficultyRating } from "./rating.mjs";
import { validateTrainingInterval } from "./training-interval.mjs";
import { createAnalysisRequest, buildAnalysisPrompt, validateAnalysisResult, applyAnalysis } from "./problem-analysis.mjs";
export { patchProblemReview, dueDateInDays } from "./review-utils.mjs";

export let activeFormDate = "";
export let activeFormExists = false;
export let activeFormInitialized = false;
export let activeFormLoadState = "idle";
export let dateLoadSequence = 0;
// 该日期在服务端的版本（不存在时为 null）。每次保存都必须回传，否则服务端拒绝写入。
let activeFormRevision = null;
let activeFormConflictRevision;
let activeFormDirty = false;
export const dateDrafts = new Map();

// v2 草稿由账号和日期隔离。旧的 journal-drafts-v1 保留在浏览器中，但绝不自动读取或迁移。
const draftStore = createDraftStore();
// 已选好但尚未随保存上传到仓库的题面 PDF，按 (账号, 日期, 题目) 存在 IndexedDB 里。
const attachmentStore = createAttachmentStore();

/**
 * 本次编辑中待处理的附件动作，problemId -> 动作。
 * 没有条目表示「不改动」——沿用服务端已有附件，或本来就没有附件。
 * 因此「移除」必须显式记账，不能只靠删掉条目来表达。
 */
const pendingAttachments = new Map();

/**
 * 抓取题面时一并下载、还没上传到仓库的题面图片：problemId -> [{ fileName, sha256, mimeType, blob }]。
 *
 * 图片是否随保存上传由正文决定：只有正文里仍然写着该文件名的图片才会声明给服务端。
 * 题面被 AI 概括或被手工改写后，不再引用的图片不会被上传，服务端也会删掉同名旧文件，
 * 仓库里不会留下没人看的图片。
 */
const pendingStatementImages = new Map();

function serverStatementImages(block) {
  if (!block.dataset.serverImages) return [];
  try {
    const value = JSON.parse(block.dataset.serverImages);
    return Array.isArray(value) ? value.filter((image) => parseStatementImageName(image?.fileName)) : [];
  } catch {
    return [];
  }
}

/** 正文里仍然引用的图片（服务端已归档的 + 本次抓取待上传的），也就是保存时要声明的集合。 */
function declaredStatementImages(block) {
  const description = block.querySelector(".problem-description")?.value || "";
  const images = new Map();
  for (const image of serverStatementImages(block)) images.set(image.fileName, image);
  for (const image of pendingStatementImages.get(block.dataset.problemId) || []) {
    images.set(image.fileName, { fileName: image.fileName, sha256: image.sha256, mimeType: image.mimeType, bytes: image.blob.size });
  }
  return [...images.values()].filter((image) => description.includes(image.fileName));
}

/** 这一天是否涉及题面图片：涉及就必须走 v2 附件接口，旧接口无法上传图片字节。 */
function hasStatementImages() {
  return [...document.querySelectorAll(".problem-block")].some((block) => serverStatementImages(block).length || (pendingStatementImages.get(block.dataset.problemId) || []).length);
}

// 抓取失败原因的中文说明。blocked 指题面页被反爬/限流拦下（CF 的 Cloudflare 挑战页、
// AtCoder 的 429），且兜底来源（洛谷镜像）也没取到正文——只显示英文代号时用户无法判断该怎么办。
const STATEMENT_REASON_TEXT = {
  blocked: "官方页与镜像都没取到（blocked），可上传 PDF 或手动粘贴",
  "not-found": "没有这道题（not-found）",
  unsupported: "官方题面只有 PDF（unsupported），请下载后作为附件上传",
  timeout: "抓取超时（timeout），请重试",
  "parse-failed": "页面结构无法解析（parse-failed），可上传 PDF 或手动粘贴",
  "too-large": "题面过长（too-large）",
  "upstream-error": "上游暂时不可用（upstream-error），请稍后重试",
};

// 能抓官方题面的平台：其余平台没有可解析的公开题面页，按钮只作提示。
const STATEMENT_PLATFORMS = new Set([PLATFORMS.CODEFORCES, PLATFORMS.ATCODER]);
// AtCoder 的题号就是任务 ID（abc381_a）：没有下划线的写法拼不出题目页。
const ATCODER_NUMBER = /^[A-Za-z0-9]+_[A-Za-z0-9_]+$/;
const TAG_SEPARATOR = /[,，、]/;

/**
 * 把抓取结果里的算法标签并入本题标签框：去重、保留用户已填的，返回真正新增的标签。
 *
 * AtCoder 的标签来自洛谷镜像（站内规范标签），是「顺手带上」的增强，不能覆盖用户输入。
 */
function mergeFetchedTags(block, tags) {
  const input = block.querySelector(".problem-tags");
  if (!input || !Array.isArray(tags) || !tags.length) return [];
  const current = input.value.split(TAG_SEPARATOR).map((tag) => tag.trim()).filter(Boolean);
  const added = tags.filter((tag) => !current.includes(tag));
  if (added.length) input.value = [...current, ...added].join(", ");
  return added;
}

function readTrainingInterval() {
  return {
    startedOn: document.getElementById("submit-started-on")?.value || undefined,
    solvedOn: document.getElementById("submit-solved-on")?.value || undefined,
  };
}

function setTrainingInterval(interval = {}) {
  const start = document.getElementById("submit-started-on");
  const end = document.getElementById("submit-solved-on");
  if (start) start.value = interval.startedOn || "";
  if (end) end.value = interval.solvedOn || "";
}
const draftSavedAts = new Map();
const draftMemoryVersions = new Map();
let draftOwnerLogin = "";

function currentDraftOwner() {
  return typeof currentUser?.login === "string" ? currentUser.login : "";
}

function ensureDraftOwner() {
  const owner = currentDraftOwner();
  if (owner !== draftOwnerLogin) {
    dateDrafts.clear();
    draftSavedAts.clear();
    draftMemoryVersions.clear();
    draftOwnerLogin = owner;
  }
  return owner;
}

function rememberDraft(date, snapshot, savedAt) {
  dateDrafts.set(date, snapshot);
  draftMemoryVersions.set(date, (draftMemoryVersions.get(date) || 0) + 1);
  if (typeof savedAt === "string") draftSavedAts.set(date, savedAt);
  return draftMemoryVersions.get(date);
}

function persistDraft(date, snapshot) {
  const memberId = ensureDraftOwner();
  const memoryVersion = rememberDraft(date, snapshot);
  if (!memberId || !snapshot || !Array.isArray(snapshot.problems)) {
    return { savedAt: null, memoryVersion };
  }
  const result = draftStore.save({ memberId, date, problems: snapshot.problems, exists: snapshot.exists, interval: snapshot.interval });
  if (result.status === "saved") draftSavedAts.set(date, result.draft.savedAt);
  return { savedAt: result.status === "saved" ? result.draft.savedAt : null, memoryVersion };
}

function removeStoredDraft(date, { expectedSavedAt, expectedMemoryVersion } = {}) {
  if (expectedMemoryVersion !== undefined && draftMemoryVersions.get(date) !== expectedMemoryVersion) return;
  dateDrafts.delete(date);
  draftMemoryVersions.delete(date);
  draftSavedAts.delete(date);
  const memberId = ensureDraftOwner();
  // 没有已知版本时不删除持久化内容，避免存储暂不可用后误删较新的草稿。
  if (memberId && typeof expectedSavedAt === "string") {
    draftStore.delete(memberId, date, { expectedSavedAt });
  }
}

let submitting = false;

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const debouncedUpdateSummary = debounce(updateSubmissionSummary, 300);

// 难度下拉统一为 Codeforces Rating（选项形如「★ 1200」）。
// 传入已有 Rating 时优先用它；只有历史脏值时动态补一个选项，保证旧记录仍可原样保存。
function setDifficultyValue(select, rating, fallback) {
  if (!select) return;
  const value = Number(rating) > 0 ? `★ ${Number(rating)}` : String(fallback || "");
  if (value && ![...select.options].some((option) => option.value === value)) {
    select.add(new Option(value, value));
  }
  select.value = value || "未标注";
}

function extractProblemFields(block) {
  // 已归档的题面图片引用：只有「服务端告知过」这一题才有这个字段（dataset.serverImages）。
  // 不知道与「没有图片」必须分开：字段缺席时服务端沿用旧引用（旧客户端、草稿丢字段都不会
  // 误删），显式空数组才表示「这一题不再引用任何图片」。
  const archived = block.dataset.serverImages === undefined ? null : serverStatementImages(block);
  return {
    id: block.dataset.problemId,
    fileIndex: block.dataset.fileIndex === "" || block.dataset.fileIndex === undefined ? undefined : Number(block.dataset.fileIndex),
    name: block.querySelector(".problem-name").value,
    platform: block.querySelector(".problem-platform").value,
    problemNumber: block.querySelector(".problem-number").value,
    difficulty: block.querySelector(".problem-difficulty").value,
    tags: block.querySelector(".problem-tags").value,
    reviewStatus: block.querySelector(".problem-review-status").value,
    reviewDue: block.querySelector(".problem-review-due").value,
    outcome: block.querySelector(".problem-outcome:checked")?.value || "",
    masteryStatus: block.querySelector(".problem-mastery-status")?.value,
    isMistake: block.querySelector(".problem-is-mistake")?.checked === true,
    description: block.querySelector(".problem-description").value,
    takeaway: block.querySelector(".problem-takeaway").value,
    code: block.querySelector(".problem-code").value,
    ...(block.dataset.enrichment ? JSON.parse(block.dataset.enrichment) : {}),
    // 已归档的图片引用要跟着草稿一起往返：草稿恢复后如果不知道服务端归档了哪些图，
    // 保存时就会把它们当成「不再被描述引用」而删掉，正文里的链接随之失效。
    ...(archived ? { statementImages: archived } : {}),
  };
}

export function collectProblems() {
  const blocks = document.querySelectorAll(".problem-block");
  const problems = [];
  for (const block of blocks) {
    const f = extractProblemFields(block);
    const name = f.name.trim();
    if (!name) continue;
    problems.push({
      id: f.id,
      ...(Number.isInteger(f.fileIndex) ? { fileIndex: f.fileIndex } : {}),
      problem: name,
      name,
      platform: f.platform,
      problemNumber: f.problemNumber.trim(),
      difficulty: f.difficulty,
      difficultyRating: parseRatingLabel(f.difficulty),
      tags: f.tags,
      reviewStatus: f.reviewStatus,
      reviewDue: f.reviewDue,
      outcome: f.outcome,
      masteryStatus: f.masteryStatus,
      isMistake: f.isMistake,
      description: f.description.trim(),
      takeaway: f.takeaway.trim(),
      code: f.code.trim(),
      ...Object.fromEntries(Object.entries(f).filter(([key]) => ["statementAttachment", "statementImages", "statementSource", "metadataSources", "aiAnalysis"].includes(key))),
    });
  }
  return problems;
}

export function captureProblemDrafts() {
  return [...document.querySelectorAll(".problem-block")].map((block) => {
    const f = extractProblemFields(block);
    return {
      id: f.id,
      ...(Number.isInteger(f.fileIndex) ? { fileIndex: f.fileIndex } : {}),
      problem: f.name,
      platform: f.platform,
      problemNumber: f.problemNumber,
      difficulty: f.difficulty,
      tags: f.tags,
      reviewStatus: f.reviewStatus,
      reviewDue: f.reviewDue,
      outcome: f.outcome,
      masteryStatus: f.masteryStatus,
      isMistake: f.isMistake,
      description: f.description,
      takeaway: f.takeaway,
      code: f.code,
      ...Object.fromEntries(Object.entries(f).filter(([key]) => ["statementAttachment", "statementImages", "statementSource", "metadataSources", "aiAnalysis"].includes(key))),
    };
  });
}

function submissionUrl(date = "", problemId = "") {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (problemId !== "" && problemId != null) params.set("problem", String(problemId));
  return `/submit/${params.size ? `?${params}` : ""}`;
}

function navigateToSubmission(date = "", problemId = "") {
  const url = submissionUrl(date, problemId);
  window.history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// 兼容旧调用名：原来的模态框入口现在统一进入独立提交页。
export function openModal() {
  navigateToSubmission();
}

export async function openSubmissionPage() {
  const gate = document.getElementById("submission-auth-gate");
  const workspace = document.getElementById("submission-workspace");
  if (!currentUser) {
    gate.hidden = false;
    workspace.hidden = true;
    document.getElementById("journal-editor-title")?.focus({ preventScroll: true });
    return false;
  }

  gate.hidden = true;
  workspace.hidden = false;
  // 草稿跨会话保留（内存 + localStorage），提交/删除成功后才清除对应日期。
  activeFormDate = "";
  activeFormExists = false;
  activeFormInitialized = false;
  activeFormDirty = false;
  activeFormLoadState = "idle";
  dateLoadSequence += 1;
  submitting = false;
  const dateInput = document.getElementById("submit-date");
  const params = new URLSearchParams(window.location.search);
  const requestedDate = params.get("date") || toDateString(new Date());
  const today = toUtc8(new Date().toISOString()).slice(0, 10);
  // 不允许选择未来日期（按 UTC+8 今天为上限）
  dateInput.max = today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || requestedDate > today) {
    dateInput.value = "";
    setDateLoadState("error");
    document.getElementById("submit-msg").textContent = "日期无效或晚于今天，请重新选择训练日期。";
    document.getElementById("journal-editor-title")?.focus({ preventScroll: true });
    return false;
  }
  dateInput.value = requestedDate;
  setTrainingInterval({});
  document.getElementById("submit-msg").textContent = "";
  resetProblems();
  await onDateChange({ syncUrl: !params.has("date") });
  const problemId = params.get("problem");
  if (problemId) focusProblemBlock(problemId);
  document.getElementById("journal-editor-title")?.focus({ preventScroll: true });
  return true;
}

export function closeModal(force = false) {
  if (!force && activeFormDate && activeFormDirty) persistDraft(activeFormDate, { problems: captureProblemDrafts(), exists: activeFormExists, interval: readTrainingInterval() });
  window.history.pushState(null, "", "/analysis/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// 打开表单并加载指定日期的记录；传 problemId 时定位并高亮该题块。
// 供题目详情页「编辑此题」等入口使用（renderer 通过动态 import 调用，保持表单模块按需加载）。
export async function openModalForDate(date, problemId) {
  if (!currentUser) {
    alert("请先登录 GitHub");
    return false;
  }
  navigateToSubmission(date, problemId);
  return true;
}

function focusProblemBlock(problemId) {
  const blocks = [...document.querySelectorAll(".problem-block")];
  const block = blocks.find((item, index) => item.dataset.problemId === String(problemId) || String(index) === String(problemId));
  if (!block) {
    document.getElementById("submit-msg").textContent = "没有找到要定位的题目，已显示这一天的全部记录。";
    return false;
  }
  block.scrollIntoView({ block: "center", behavior: "smooth" });
  block.classList.add("review-highlight");
  block.querySelector(".problem-name")?.focus({ preventScroll: true });
  setTimeout(() => block.classList.remove("review-highlight"), 1200);
  return true;
}

/**
 * 刷新某一题附件区的显示。
 *
 * 三种来源要分清：服务端已归档的附件、本地已选但还没保存的 PDF、以及用户刚刚
 * 点下的「移除」。这三者的区别正是用户需要看到的，所以提示文案不合并。
 */
function renderStatementState(block) {
  const problemId = block.dataset.problemId;
  const status = block.querySelector(".statement-status");
  const dropBtn = block.querySelector(".btn-drop-statement");
  const pickBtn = block.querySelector(".btn-pick-statement");
  if (!status) return;

  const pending = pendingAttachments.get(problemId);
  const existing = block.dataset.serverAttachment ? JSON.parse(block.dataset.serverAttachment) : null;
  status.innerHTML = "";

  if (pending?.action === "replace") {
    status.textContent = `待保存：${pending.fileName}（${formatBytes(pending.blob.size)}），点击「保存」后归档到仓库。`;
  } else if (pending?.action === "remove") {
    status.textContent = existing ? `已标记移除：保存后不再关联 ${existing.fileName}。` : "尚未归档题面 PDF";
  } else if (existing) {
    status.append(document.createTextNode(`已归档：${existing.fileName}（${formatBytes(existing.bytes)}）`));
    const link = document.createElement("a");
    link.href = statementUrl(activeFormDate, problemId);
    link.textContent = "下载";
    link.className = "statement-download";
    link.rel = "noopener";
    status.append(document.createTextNode(" "), link);
  } else {
    status.textContent = "尚未归档题面 PDF";
  }
  if (dropBtn) dropBtn.hidden = !(existing || pending?.action === "replace");
  if (pickBtn) pickBtn.textContent = existing || pending?.action === "replace" ? "替换题面 PDF" : "选择题面 PDF";

  // 题面图片：数量、待保存状态，以及「已不再被描述引用」的提示。
  // 图片不能单独点「移除」——它就是正文里的一行 Markdown，删掉正文引用即删除图片。
  // 直接把文本接在同一段状态里（不再嵌一个块级元素：status 本身是 <p>）。
  const pendingImages = pendingStatementImages.get(problemId) || [];
  const archivedImages = serverStatementImages(block);
  if (pendingImages.length || archivedImages.length) {
    const declared = new Set(declaredStatementImages(block).map((image) => image.fileName));
    const stale = [...pendingImages, ...archivedImages].filter((image) => !declared.has(image.fileName)).length;
    const parts = [];
    if (pendingImages.length) parts.push(`待保存题面图片 ${pendingImages.length} 张`);
    if (archivedImages.length) parts.push(`已归档题面图片 ${archivedImages.length} 张`);
    status.append(document.createElement("br"), document.createTextNode(`${parts.join("，")}；只有描述里仍引用的图片会随保存保留${stale ? `（当前有 ${stale} 张未被描述引用，保存后会删除）` : ""}。`));
    if (archivedImages.length) {
      const link = document.createElement("a");
      link.href = statementImageUrl(activeFormDate, problemId, archivedImages[0].fileName);
      link.textContent = "预览";
      link.className = "statement-download";
      link.rel = "noopener";
      link.target = "_blank";
      status.append(document.createTextNode(" "), link);
    }
  }
}

export function refreshStatementStates() {
  for (const block of document.querySelectorAll(".problem-block")) renderStatementState(block);
}

/**
 * 把抓取结果里的题面图片落到某一题：base64 → Blob，记账，并写进本地恢复存储。
 *
 * 只接受文件名与内容哈希自洽的图片（抓取端与服务端用同一套命名），坏数据直接丢弃，
 * 不会留下一个永远上传失败的僵尸条目。
 */
async function registerStatementImages(block, images) {
  const problemId = block.dataset.problemId;
  const decoded = [];
  let total = 0;
  for (const image of Array.isArray(images) ? images.slice(0, MAX_STATEMENT_IMAGES) : []) {
    const meta = parseStatementImageName(image?.fileName);
    const bytes = base64ToBytes(image?.data);
    if (!meta || !bytes || meta.sha256 !== image.sha256 || meta.mimeType !== image.mimeType || bytes.byteLength !== image.bytes) continue;
    // 与服务端同一套限额：坏数据宁可在这里丢掉，也不能等到保存时整次 413/422。
    if (bytes.byteLength > MAX_STATEMENT_IMAGE_BYTES || total + bytes.byteLength > MAX_NEW_STATEMENT_IMAGE_BYTES) continue;
    total += bytes.byteLength;
    decoded.push({ fileName: meta.fileName, sha256: meta.sha256, mimeType: meta.mimeType, blob: new Blob([bytes], { type: meta.mimeType }) });
  }
  if (decoded.length) pendingStatementImages.set(problemId, decoded);
  else pendingStatementImages.delete(problemId);
  const memberId = currentDraftOwner();
  if (memberId && activeFormDate && decoded.length) {
    const stored = await attachmentStore.saveImages({ memberId, date: activeFormDate, problemId, images: decoded });
    if (stored.status === "too_large") {
      pendingStatementImages.delete(problemId);
      renderStatementState(block);
      return 0;
    }
  }
  renderStatementState(block);
  return decoded.length;
}

/**
 * 恢复待上传 PDF 时，草稿也要一起存：题目 id 是客户端生成的，只有草稿把它保留下来，
 * 刷新后重建表单才会得到同一批 id，附件才能重新对上题目。
 */
function persistAttachmentDraft() {
  if (!activeFormDate || !activeFormInitialized) return;
  persistDraft(activeFormDate, { problems: captureProblemDrafts(), exists: activeFormExists });
}

function bindStatementPicker(block) {
  const input = block.querySelector(".statement-file");
  const pickBtn = block.querySelector(".btn-pick-statement");
  const dropBtn = block.querySelector(".btn-drop-statement");
  if (!input || !pickBtn || !dropBtn) return;

  pickBtn.addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    // 允许重复选择同一个文件：清空后立刻返回，才能再次触发 change。
    input.value = "";
    if (!file) return;
    const invalid = validateAttachmentFile(file);
    if (invalid) {
      block.querySelector(".statement-status").textContent = `无法使用该文件：${invalid}`;
      return;
    }
    const problemId = block.dataset.problemId;
    const memberId = currentDraftOwner();
    const date = activeFormDate;
    block.querySelector(".statement-status").textContent = "正在读取 PDF…";
    try {
      // 先算哈希并落本地：即使随后保存失败，刷新后仍能恢复这次选择。
      const sha256 = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
      pendingAttachments.set(problemId, { action: "replace", blob: file, fileName: file.name, sha256 });
      if (memberId && date) {
        const stored = await attachmentStore.save({ memberId, date, problemId, blob: file, fileName: file.name, sha256 });
        if (stored.status === "too_large") {
          pendingAttachments.delete(problemId);
          block.querySelector(".statement-status").textContent = "本次新增的 PDF 合计超过 10 MiB，请分次保存。";
          return;
        }
      }
      renderStatementState(block);
      persistAttachmentDraft();
      markFormEdited();
    } catch (error) {
      pendingAttachments.delete(problemId);
      block.querySelector(".statement-status").textContent = `读取失败：${error.message}`;
    }
  });

  dropBtn.addEventListener("click", async () => {
    const problemId = block.dataset.problemId;
    const existing = block.dataset.serverAttachment ? JSON.parse(block.dataset.serverAttachment) : null;
    if (existing && !confirm(`确定要移除已归档的题面 PDF（${existing.fileName}）吗？保存后生效。`)) return;
    pendingAttachments.set(problemId, { action: "remove" });
    const memberId = currentDraftOwner();
    if (memberId && activeFormDate) await attachmentStore.remove(memberId, activeFormDate, problemId);
    renderStatementState(block);
    persistAttachmentDraft();
    markFormEdited();
  });
}

/**
 * 涉及附件时保存整个日期。
 *
 * 与旧接口的分工：旧接口原样回传 `statementAttachment` 引用，v2 接口则必须**省略**它
 * ——服务端对没有 attach 动作的题目会自动沿用旧引用，对 `replace` 会用上传结果的哈希
 * 覆盖，对 `remove` 要求引用必须缺席。
 *
 * 题面图片没有单独的动作：payload 里每题的 `statementImages` 就是保存后期望的完整集合
 * （只保留正文仍引用的），本次缺的分区随表单一起上传，服务端据此写文件、删孤儿。
 */
async function saveWithAttachments(date, problems, interval, revision) {
  const blocks = new Map([...document.querySelectorAll(".problem-block")].map((block) => [block.dataset.problemId, block]));
  const declared = new Map();
  for (const problem of problems) {
    const block = blocks.get(problem.id);
    // 只有「知道服务端现状」或「本次抓到了图片」的题目才声明题面图片：字段缺席时服务端
    // 沿用旧引用，所以旧草稿（不认识这个字段）不会把别人的图片误删。
    const knows = block && (block.dataset.serverImages !== undefined || (pendingStatementImages.get(problem.id) || []).length);
    if (knows) declared.set(problem.id, declaredStatementImages(block));
  }
  const log = {
    schemaVersion: LOG_SCHEMA_VERSION,
    problems: problems.map(({ statementAttachment, statementImages, ...problem }) => (declared.has(problem.id) ? { ...problem, statementImages: declared.get(problem.id) } : problem)),
    ...interval,
  };
  const attachmentChanges = [];
  const attachments = new Map();
  for (const [recordId, action] of pendingAttachments) {
    if (action.action === "replace") {
      const partName = `pdf-${recordId}`;
      attachments.set(partName, { blob: action.blob, fileName: action.fileName });
      attachmentChanges.push({ recordId, action: "replace", partName });
    } else {
      attachmentChanges.push({ recordId, action: "remove" });
    }
  }
  // 只上传仓库里还没有的图片：文件名就是内容哈希，同名文件必然同内容。
  const images = new Map();
  for (const block of blocks.values()) {
    const archived = new Set(serverStatementImages(block).map((image) => image.sha256));
    for (const image of pendingStatementImages.get(block.dataset.problemId) || []) {
      if (!archived.has(image.sha256)) images.set(image.fileName, { blob: image.blob, fileName: image.fileName });
    }
  }
  // 同一次保存重试必须复用同一个幂等键，否则会重复提交。
  const operationId = crypto.randomUUID();
  const result = await saveDateLogV2(date, { log, expectedVersion: revision, attachmentChanges, attachments, images, operationId });
  await afterAttachmentSave(date, result);
  return result;
}

/** 保存成功后把服务端确认的附件状态写回表单，并清掉本地待上传记录。 */
async function afterAttachmentSave(date, result) {
  const saved = new Map((result?.log?.problems || []).map((problem) => [problem.id, problem.statementAttachment]));
  const savedImages = new Map((result?.log?.problems || []).map((problem) => [problem.id, problem.statementImages || []]));
  for (const block of document.querySelectorAll(".problem-block")) {
    const attachment = saved.get(block.dataset.problemId);
    if (attachment) block.dataset.serverAttachment = JSON.stringify(attachment);
    else delete block.dataset.serverAttachment;
    const images = savedImages.get(block.dataset.problemId) || [];
    if (images.length) block.dataset.serverImages = JSON.stringify(images);
    else delete block.dataset.serverImages;
    // dataset.enrichment 是旧接口保存时回传引用的来源，必须同步更新：
    // 否则下一次「只改文字」的保存会带着过期的哈希去比对，被服务端以 422 拒绝。
    const enrichment = JSON.parse(block.dataset.enrichment || "{}");
    if (attachment) enrichment.statementAttachment = attachment;
    else delete enrichment.statementAttachment;
    if (Object.keys(enrichment).length) block.dataset.enrichment = JSON.stringify(enrichment);
    else delete block.dataset.enrichment;
  }
  pendingAttachments.clear();
  pendingStatementImages.clear();
  const memberId = currentDraftOwner();
  if (memberId) await attachmentStore.clearDate(memberId, date);
  refreshStatementStates();
}

export // 描述里如果出现整页源码（用户可能把源码粘错框），那它显然不是题意，可以直接替换。
const PAGE_SOURCE = /^\s*(?:<!doctype\s|<html[\s>]|<\?xml)|id=["']task-statement["']/i;
// 预览面板里那份「尚未覆盖现有描述」的题面副本，用这个前缀识别，避免误清 AI 分析预览。
const STATEMENT_PREVIEW_PREFIX = "已抓取题面，尚未覆盖现有描述：";

/** 读取上一次抓取但尚未应用的题面（预览分支把它存在 dataset 上）。 */
function readStatementPreview(div) {
  try { return JSON.parse(div.dataset.statementPreview || "null"); } catch { return null; }
}

/** 用一份抓取结果覆盖描述，并登记来源。预览与「替换描述」按钮都走这里。 */
function fillStatementDescription(div, result) {
  const description = div.querySelector(".problem-description");
  description.value = result.description;
  const existing = JSON.parse(div.dataset.enrichment || "{}");
  div.dataset.enrichment = JSON.stringify({ ...existing, statementSource: result.source });
  delete div.dataset.statementPreview;
  const applyButton = div.querySelector(".btn-apply-statement");
  if (applyButton) applyButton.hidden = true;
  // 题面已经写进描述了，预览里那份「尚未覆盖」的副本就该收起来，别让用户看到过期内容。
  const preview = div.querySelector(".analysis-preview");
  if (preview && preview.textContent.startsWith(STATEMENT_PREVIEW_PREFIX)) { preview.textContent = ""; preview.hidden = true; }
  return description;
}

/** 预览分支的出口：用户点「用这份题面替换描述」时把预览内容真正写进去。 */
function applyStatementPreview(div) {
  const status = div.querySelector(".summarize-status");
  const result = readStatementPreview(div);
  if (!result?.description) { status.textContent = "没有待应用的题面，请重新抓取。"; return; }
  const description = fillStatementDescription(div, result);
  try { description.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* 不支持平滑滚动时忽略 */ }
  status.textContent = "已用抓取的题面替换描述（保存后写入记录）。";
  markFormEdited();
}

/**
 * 把一次题面抓取结果落到题目块上：图片登记、标签并入、描述填入或预览。
 *
 * 服务端直取与「浏览器小书签回传源码」两条路径共用，保证两种入口的结果一致。
 * 描述里已经有内容时**不静默覆盖**，但必须给出一键替换的入口——只给预览、让用户自己
 * 从预览里抄，等于没填（这就是「解析出来了但没填入」的成因）。
 */
async function applyStatementResult(div, platform, result) {
  const status = div.querySelector(".summarize-status");
  const imageCount = await registerStatementImages(div, result.images);
  const imageNote = imageCount ? `已随题面归档 ${imageCount} 张图片` : "";
  const externalNote = result.warnings?.includes("external-images") ? "有图片未能归档，仍是外链（站内可能无法显示）" : "";
  // 镜像来源要提示核对：CF 镜像可能是中文翻译，AtCoder 的 AT_ 镜像多是日文原题，
  // 而且 AtCoder 官方页在服务端整体被拦，镜像往往才是真正取到的那个来源。
  const sourceNote = result.source?.kind === "luogu-mirror"
    ? platform === PLATFORMS.ATCODER
      ? "AtCoder 官方页在服务端被拦截，题面取自洛谷镜像（多为日文原题），建议对照原题核对"
      : "题面取自洛谷镜像，可能是中文翻译，建议对照原题核对"
    : result.warnings?.includes("client-html")
      ? "题面取自你浏览器抓回的 AtCoder 官方页面"
      : "";
  // 少数 AtCoder 老题没有英文题面：必须说清楚抓回来的是日文原题。
  const languageNote = result.warnings?.includes("ja-statement") ? "这道题没有英文题面，正文是日文原题" : "";
  // AtCoder 的算法标签随题面一起回来（服务端已换成站内标签），直接并入标签框。
  const fetchedTags = mergeFetchedTags(div, result.tags);
  const tagNote = fetchedTags.length ? `已带标签：${fetchedTags.join("、")}` : "";
  const description = div.querySelector(".problem-description");
  const current = description.value.trim();
  const notes = [sourceNote, languageNote, tagNote, imageNote, externalNote].filter(Boolean);

  // 描述里是整页源码：那不是题意，直接替换掉，不必让用户对着几百 KB 的源码做选择。
  if (current && current !== result.description.trim() && PAGE_SOURCE.test(current)) {
    fillStatementDescription(div, result);
    status.textContent = ["描述里原本是粘贴的页面源码，已替换为解析出的题面", ...notes].join("；") + "。";
    markFormEdited();
    return;
  }
  if (current && current === result.description.trim()) {
    fillStatementDescription(div, result);
    status.textContent = "描述里已经是这份题面，未重复写入。";
    markFormEdited();
    return;
  }
  // 描述里已有别的内容：只预览，但把「替换」做成一个按钮，用户点一下就填入。
  if (current) {
    const panel = div.querySelector(".problem-enrichment");
    panel.hidden = false;
    panel.querySelector(".analysis-preview").hidden = false;
    panel.querySelector(".analysis-preview").textContent = `${STATEMENT_PREVIEW_PREFIX}\n\n${result.description}`;
    div.dataset.statementPreview = JSON.stringify(result);
    div.querySelector(".btn-apply-statement").hidden = false;
    status.textContent = ["已获取题面，但描述里已有内容（未自动覆盖）：点「用这份题面替换描述」填入，或在预览里核对后手动改", ...notes].join("；") + "。";
    if (fetchedTags.length) markFormEdited();
    return;
  }
  fillStatementDescription(div, result);
  status.textContent = notes.length ? `题面已填入；${notes.join("；")}。` : "题面已填入。";
  markFormEdited();
}

// 题号与平台校验：两条题面入口（服务端抓取 / 小书签回传源码）都要先过这一关。
function readStatementTarget(div) {
  const status = div.querySelector(".summarize-status");
  const platform = div.querySelector(".problem-platform").value;
  const problemNumber = div.querySelector(".problem-number").value.trim();
  if (!STATEMENT_PLATFORMS.has(platform) || !problemNumber) { status.textContent = "请先填写 Codeforces 或 AtCoder 题号。"; return null; }
  if (platform === PLATFORMS.ATCODER && !ATCODER_NUMBER.test(problemNumber)) { status.textContent = "AtCoder 题号要写成 abc381_a 这样的任务 ID。"; return null; }
  return { status, platform, problemNumber };
}

/** 抓取一个题目块的题面；手动按钮与 CF 快速导入共用这一条落盘链路。 */
async function fetchStatementForBlock(div) {
  const target = readStatementTarget(div);
  if (!target) return false;
  const { status, platform, problemNumber } = target;
  status.textContent = "抓取题面中…";
  try {
    const result = await fetchProblemStatement(platform, problemNumber);
    if (result.status !== "ok") {
      const blockedNote = platform === PLATFORMS.ATCODER && result.reason === "blocked"
        ? "AtCoder 官方页在服务端被拦截，且洛谷没有这道题的镜像；可用下面的「从 AtCoder 页面导入」小书签把你浏览器里的题面取回来；"
        : "";
      status.textContent = `题面暂不可用：${blockedNote}${STATEMENT_REASON_TEXT[result.reason] || result.reason}`;
      return false;
    }
    await applyStatementResult(div, platform, result);
    return true;
  } catch (error) {
    status.textContent = `抓取失败：${error.message}`;
    return false;
  }
}

/**
 * 「抓取 AtCoder 题面」小书签。
 *
 * 它只在 AtCoder 题目页里被点击：把整页 outerHTML 复制到剪贴板（服务端要用 <title>、
 * og:url 与 #task-statement，因此复制整份文档而不是单个片段），用户回到这里粘贴即可。
 * 站点 CSP 不允许在本站执行它，所以只能拖到书签栏使用——这正是它绕过跨域限制的原因。
 */
const ATCODER_BOOKMARKLET = "javascript:(()=>{try{const h=document.documentElement.outerHTML;const t=document.createElement('textarea');t.value=h;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();const ok=document.execCommand('copy');t.remove();alert(ok?('已复制 AtCoder 页面源码（'+Math.round(h.length/1024)+' KB）。回到训练日志，粘贴到「从 AtCoder 页面导入」里再点「解析并填入」。'):'复制失败，请改用 Ctrl+U 打开源码后 Ctrl+A、Ctrl+C。');}catch(e){alert('复制失败：'+e.message+'。请改用 Ctrl+U 打开源码后 Ctrl+A、Ctrl+C。');}})()";

function createProblemRow(index) {
  const div = document.createElement("div");
  div.className = "problem-block";
  div.dataset.index = index;
  const problemId = createProblemId();
  div.dataset.problemId = problemId;
  div.innerHTML = `
    <div class="problem-header">
      <span class="problem-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="problem-card-heading"><strong class="problem-card-title">新题目</strong><small class="problem-card-meta">补全名称与题号</small></span>
      <button type="button" class="btn-icon btn-remove" data-idx="${index}" aria-label="移除这道题">&times;</button>
    </div>
    <div class="form-row journal-identity-row">
      <div class="form-group">
        <label for="prob-${index}-name">题目名称</label>
        <input id="prob-${index}-name" type="text" class="form-input problem-name" maxlength="${LOG_LIMITS.name}" placeholder="如 排序" />
      </div>
      <div class="form-group">
        <label for="prob-${index}-number">题号</label>
        <input id="prob-${index}-number" type="text" class="form-input problem-number" maxlength="${LOG_LIMITS.problemNumber}" placeholder="如 P1104 或 4A" />
      </div>
    </div>
    <div class="form-row journal-meta-row">
      <div class="form-group">
        <label for="prob-${index}-platform">平台</label>
        <select id="prob-${index}-platform" class="form-input problem-platform">
          <option value="${PLATFORMS.LUOGU}">${PLATFORMS.LUOGU}</option>
          <option value="${PLATFORMS.CODEFORCES}">${PLATFORMS.CODEFORCES}</option>
          <option value="${PLATFORMS.ATCODER}">${PLATFORMS.ATCODER}</option>
          <option value="${PLATFORMS.OTHER}">${PLATFORMS.OTHER}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="prob-${index}-difficulty">难度（CF Rating）</label>
        <select id="prob-${index}-difficulty" class="form-input problem-difficulty">
          <option value="未标注">未标注</option>
          ${STANDARD_RATINGS.map((rating) => `<option value="★ ${rating}">★ ${rating}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label for="prob-${index}-tags">题目标签</label>
        <input id="prob-${index}-tags" type="text" class="form-input problem-tags" maxlength="${LOG_LIMITS.tags * (LOG_LIMITS.tag + 2)}" placeholder="如 DP、图论、二分（最多 ${LOG_LIMITS.tags} 个）" list="tag-suggestions-${index}" autocomplete="off" />
        <datalist id="tag-suggestions-${index}">${CANONICAL_TAGS.map((t) => `<option value="${t}">`).join("")}</datalist>
      </div>
    </div>
    <section class="learning-state-panel" aria-label="本次训练状态">
      <div class="learning-state-heading"><h3>完成情况</h3><p>如实记录这次训练的结果。</p></div>
      <div class="learning-state-grid">
      <fieldset class="outcome-options"><legend>完成结果</legend>
        <label><input type="radio" class="problem-outcome" name="outcome-${problemId}" value="" checked /><span>未记录</span></label>
        <label><input type="radio" class="problem-outcome" name="outcome-${problemId}" value="independent" /><span>独立完成</span></label>
        <label><input type="radio" class="problem-outcome" name="outcome-${problemId}" value="hinted" /><span>看提示完成</span></label>
        <label><input type="radio" class="problem-outcome" name="outcome-${problemId}" value="editorial" /><span>看题解完成</span></label>
        <label><input type="radio" class="problem-outcome" name="outcome-${problemId}" value="unfinished" /><span>未完成</span></label>
      </fieldset>
      </div>
      <details class="journal-disclosure review-settings">
      <summary>复习设置 <span>掌握自评、复习日期与错题标记</span></summary>
      <div class="journal-disclosure-body learning-state-grid">
      <div class="form-group">
        <label for="prob-${index}-mastery">掌握自评</label>
        <select id="prob-${index}-mastery" class="form-input problem-mastery-status">
          <option value="${MASTERY_STATUSES[0]}">尚未自评</option>
          <option value="${MASTERY_STATUSES[1]}">仍在学习</option>
          <option value="${MASTERY_STATUSES[2]}">自评已掌握</option>
        </select>
      </div>
      <div class="form-group">
        <label for="prob-${index}-review">复习安排</label>
        <select id="prob-${index}-review" class="form-input problem-review-status">
          <option value="${REVIEW_STATUSES.NONE}">未安排复习</option>
          <option value="${REVIEW_STATUSES.TODO}">待复习</option>
          <option value="${REVIEW_STATUSES.ARCHIVED}">已归档</option>
        </select>
      </div>
      <div class="form-group mistake-toggle-group">
        <span class="field-label">错题标记</span>
        <label class="mistake-toggle" for="prob-${index}-mistake"><input id="prob-${index}-mistake" type="checkbox" class="problem-is-mistake" /><span>这次有失误</span></label>
      </div>
      <div class="form-group review-due-group" hidden>
        <label for="prob-${index}-due">复习日期</label>
        <input id="prob-${index}-due" type="date" class="form-input problem-review-due" title="到期后该题会出现在首页「今日复习队列」中" />
      </div>
      </div>
      </details>
    </section>
    <div class="journal-writing-grid">
    <section class="journal-disclosure journal-statement-tools" aria-labelledby="prob-${index}-statement-heading">
      <div class="journal-section-heading"><strong id="prob-${index}-statement-heading">题面与附件</strong><span>抓取、粘贴或归档题面</span></div>
      <div class="journal-disclosure-body">
    <div class="form-group">
      <div class="form-label-row">
        <label for="prob-${index}-desc">题目描述（选填）</label>
        <span><button type="button" class="btn-fetch-statement" title="按当前的平台与题号抓取官方题面（Codeforces / AtCoder）">抓取题面</button> <button type="button" class="btn-apply-statement" hidden title="把刚抓到的题面写入题目描述（替换现有内容）">用这份题面替换描述</button> <button type="button" class="btn-ai-enrich">DeepSeek 提示词</button><button type="button" class="btn-summarize" title="强烈建议用 AI 概括题目描述，减少篇幅">AI 概括</button></span>
      </div>
      <textarea id="prob-${index}-desc" class="form-input problem-description" rows="2" maxlength="${LOG_LIMITS.description}" placeholder="粘贴题面后点击「AI 概括」，建议只保留题意、目标和关键约束"></textarea>
      <p class="summarize-status" role="status" aria-live="polite"></p>
      <details class="journal-disclosure statement-import">
        <summary>从 AtCoder 页面导入（洛谷没收录的题用这条）</summary>
        <div class="journal-disclosure-body">
          <p class="statement-import-help">AtCoder 拒绝服务器直连、浏览器又受跨域限制，只有你本机的浏览器能拿到官方题面。把下面的小书签拖到书签栏，在 AtCoder 题目页点一下（它会复制页面源码），再回来粘贴：</p>
          <p class="statement-import-actions"><a class="btn-bookmarklet" href="${ATCODER_BOOKMARKLET}" title="拖到书签栏；在 AtCoder 题目页点击即可复制该页源码">抓取 AtCoder 题面</a><button type="button" class="btn-copy-bookmarklet">复制小书签代码</button><span class="statement-import-fallback">也可以在该页按 Ctrl+U 打开源码后 Ctrl+A、Ctrl+C。</span></p>
          <textarea class="form-input statement-html" rows="3" spellcheck="false" placeholder="在这里粘贴 AtCoder 题目页源码（Ctrl+V），然后点「解析并填入」"></textarea>
          <p class="statement-import-actions"><button type="button" class="btn-parse-statement-html">解析并填入</button></p>
        </div>
      </details>
      <section class="problem-enrichment" hidden>
        <p class="enrichment-help">提示词仅包含本题身份、题面和标签目录。将 PDF（如有）一同上传到网页版模型，再把其 JSON 粘贴回来。</p>
        <label for="prob-${index}-analysis">AI 分析结果</label>
        <textarea id="prob-${index}-analysis" class="analysis-json form-input" rows="8" maxlength="65536" placeholder="粘贴 DeepSeek 返回的完整 JSON"></textarea>
        <div class="analysis-preview" hidden></div>
        <label><input type="checkbox" class="analysis-apply-description"> 应用题意摘要到描述</label>
        <label><input type="checkbox" class="analysis-apply-difficulty"> 应用难度估计</label>
        <label><input type="checkbox" class="analysis-apply-tags"> 合并建议标签</label>
        <button type="button" class="btn-parse-analysis">预览 JSON</button>
        <button type="button" class="btn-apply-analysis" disabled>应用所选字段</button>
      </section>
    </div>
    <div class="form-group statement-group">
      <div class="form-label-row">
        <label for="prob-${index}-statement">题面 PDF（选填，单份 ≤5 MiB）</label>
        <span>
          <button type="button" class="btn-pick-statement">选择题面 PDF</button>
          <button type="button" class="btn-drop-statement" hidden>移除附件</button>
        </span>
      </div>
      <input id="prob-${index}-statement" type="file" class="statement-file" accept="application/pdf,.pdf" hidden />
      <p class="statement-status" role="status" aria-live="polite">尚未归档题面 PDF</p>
    </div>
      </div>
    </section>
    <div class="journal-solution-column">
    <div class="form-group">
      <label for="prob-${index}-takeaway">收获 / 题解</label>
      <textarea id="prob-${index}-takeaway" class="form-input problem-takeaway" rows="4" maxlength="${LOG_LIMITS.takeaway}" placeholder="今天学到的内容、踩的坑，或题解..."></textarea>
    </div>
    <section class="journal-disclosure journal-code-tools" aria-labelledby="prob-${index}-code-heading">
      <div class="journal-section-heading"><strong id="prob-${index}-code-heading">代码</strong><span>直接粘贴，保存后自动高亮</span></div>
      <div class="journal-disclosure-body form-group">
      <textarea id="prob-${index}-code" class="form-input problem-code" rows="12" maxlength="${LOG_LIMITS.code}" placeholder="粘贴代码即可，自动高亮显示" spellcheck="false" aria-labelledby="prob-${index}-code-heading"></textarea>
      </div>
    </section>
    </div>
    </div>
  `;

  bindStatementPicker(div);

  // 「待复习」时显示复习日期输入，默认 +3 天
  const reviewSelect = div.querySelector(".problem-review-status");
  const dueGroup = div.querySelector(".review-due-group");
  const dueInput = div.querySelector(".problem-review-due");
  function syncDueVisibility() {
    const isTodo = reviewSelect.value === "todo";
    dueGroup.hidden = !isTodo;
    if (isTodo && !dueInput.value) {
      const due = new Date();
      due.setDate(due.getDate() + 3);
      dueInput.value = toDateString(due);
    }
    if (!isTodo) dueInput.value = "";
  }
  reviewSelect.addEventListener("change", syncDueVisibility);
  div.querySelector(".btn-fetch-statement").addEventListener("click", () => fetchStatementForBlock(div));
  // 小书签路径：AtCoder 对机房出口整体 403、浏览器又受 CORS 限制，只有跑在 atcoder.jp
  // 上的代码能拿到官方页。用户在题目页点一下书签（复制页面源码），回来粘贴即可。
  const htmlInput = div.querySelector(".statement-html");
  div.querySelector(".btn-apply-statement").addEventListener("click", () => applyStatementPreview(div));
  div.querySelector(".btn-copy-bookmarklet").addEventListener("click", async () => {
    const status = div.querySelector(".summarize-status");
    try {
      await navigator.clipboard.writeText(ATCODER_BOOKMARKLET);
      status.textContent = "小书签代码已复制：到浏览器书签管理器新建书签，把这段代码粘到「网址」里，然后打开 AtCoder 题目页点它。";
    } catch {
      status.textContent = "无法自动复制，请手动把书签链接拖到书签栏。";
    }
  });
  div.querySelector(".btn-parse-statement-html").addEventListener("click", async () => {
    const target = readStatementTarget(div);
    if (!target) return;
    const { status, platform, problemNumber } = target;
    const html = htmlInput.value.trim();
    if (!html) { status.textContent = "请先粘贴 AtCoder 题目页源码（点上面小书签，或 Ctrl+U 全选复制）。"; return; }
    if (platform !== PLATFORMS.ATCODER) { status.textContent = "「从 AtCoder 页面导入」只用于 AtCoder 题面。"; return; }
    status.textContent = "解析页面源码中…";
    try {
      const result = await parseProblemStatementHtml(platform, problemNumber, html);
      if (result.status !== "ok") {
        status.textContent = `解析失败：${STATEMENT_REASON_TEXT[result.reason] || result.reason}${result.reason === "parse-failed" ? "（源码是不是这道题的页面？题号必须与页面对应）" : ""}`;
        return;
      }
      await applyStatementResult(div, platform, result);
    } catch (error) { status.textContent = `解析失败：${error.message}`; }
  });
  div.querySelector(".btn-ai-enrich").addEventListener("click", async () => {
    const status = div.querySelector(".summarize-status"); const panel = div.querySelector(".problem-enrichment"); panel.hidden = false;
    try { const problem = { ...extractProblemFields(div), tags: div.querySelector(".problem-tags").value.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean) }; const request = await createAnalysisRequest(problem); div.dataset.analysisRequest = JSON.stringify(request); const prompt = buildAnalysisPrompt(request, { existingDifficultyRating: parseRatingLabel(div.querySelector(".problem-difficulty").value), tags: problem.tags, legalTags: CANONICAL_TAGS }); try { await navigator.clipboard.writeText(prompt); } catch { /* Text remains available via the preview panel. */ } window.open("https://chat.deepseek.com/", "_blank", "noopener"); panel.querySelector(".analysis-preview").hidden = false; panel.querySelector(".analysis-preview").textContent = prompt; status.textContent = "已打开 DeepSeek 并准备提示词；可从预览手动复制，稍后再粘贴 JSON。"; } catch (error) { status.textContent = `无法生成提示词：${error.message}`; }
  });
  div.querySelector(".btn-parse-analysis").addEventListener("click", () => {
    const status = div.querySelector(".summarize-status"); try { const request = JSON.parse(div.dataset.analysisRequest || "null"); if (!request) throw new Error("请先生成本题提示词"); const result = validateAnalysisResult(div.querySelector(".analysis-json").value, request); div.dataset.analysisResult = JSON.stringify(result); const preview = div.querySelector(".analysis-preview"); preview.hidden = false; preview.textContent = `摘要：${result.summary}\n标签：${result.tags.join(", ") || "无"}\n估计：${result.difficulty.estimate ?? "无"}\n${result.missingInformation.length ? `缺失：${result.missingInformation.join("；")}` : ""}`; div.querySelector(".analysis-apply-description").checked = !div.querySelector(".problem-description").value.trim(); div.querySelector(".analysis-apply-difficulty").checked = !parseRatingLabel(div.querySelector(".problem-difficulty").value) && result.difficulty.estimate !== null && !result.missingInformation.length; div.querySelector(".analysis-apply-tags").checked = true; div.querySelector(".btn-apply-analysis").disabled = false; status.textContent = "JSON 已验证，请选择需要应用的字段。"; } catch (error) { div.querySelector(".btn-apply-analysis").disabled = true; status.textContent = `JSON 未应用：${error.message}`; } });
  div.querySelector(".btn-apply-analysis").addEventListener("click", () => { const status = div.querySelector(".summarize-status"); try { const result = JSON.parse(div.dataset.analysisResult || "null"); if (!result) throw new Error("请先验证 JSON"); const fields = [["description", ".analysis-apply-description"], ["difficultyRating", ".analysis-apply-difficulty"], ["tags", ".analysis-apply-tags"]].filter(([, selector]) => div.querySelector(selector).checked).map(([field]) => field); const problem = { ...extractProblemFields(div), tags: div.querySelector(".problem-tags").value.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean) }; const next = applyAnalysis(problem, result, { fields }); if (fields.includes("description")) div.querySelector(".problem-description").value = next.description || ""; if (fields.includes("difficultyRating")) setDifficultyValue(div.querySelector(".problem-difficulty"), next.difficultyRating, problem.difficulty); if (fields.includes("tags")) div.querySelector(".problem-tags").value = (next.tags || []).join(", "); div.dataset.enrichment = JSON.stringify(Object.fromEntries(Object.entries(next).filter(([key]) => ["statementAttachment", "statementSource", "metadataSources", "aiAnalysis"].includes(key)))); status.textContent = fields.length ? "已应用选择的建议，保存后才会写入记录。" : "未选择字段，未修改记录。"; markFormEdited(); } catch (error) { status.textContent = `应用失败：${error.message}`; } });
  syncDueVisibility();
  return div;
}

export function resetProblems() {
  const list = document.getElementById("problem-list");
  list.innerHTML = "";
  list.appendChild(createProblemRow(0));
  updateSubmissionSummary();
}

export function addProblem() {
  const list = document.getElementById("problem-list");
  if (list.children.length >= LOG_LIMITS.maxProblems) {
    document.getElementById("submit-msg").textContent = `每个日期最多记录 ${LOG_LIMITS.maxProblems} 道题`;
    return;
  }
  const idx = Math.max(-1, ...[...list.children].map((item) => Number(item.dataset.index) || 0)) + 1;
  list.appendChild(createProblemRow(idx));
  markFormEdited();
}

export function reindexProblemBlocks() {
  [...document.querySelectorAll(".problem-block")].forEach((block, index) => {
    const label = block.querySelector(".problem-index");
    if (label) label.textContent = String(index + 1).padStart(2, "0");
  });
  updateSubmissionSummary();
}

export function markFormEdited() {
  activeFormInitialized = true;
  activeFormDirty = true;
  dateLoadSequence += 1;
  debouncedUpdateSummary();
}

export function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function updateSubmissionSummary() {
  const summary = document.getElementById("submission-summary");
  if (!summary) return;
  const problems = captureProblemDrafts();
  const bytes = logInputBytes({ problems });
  summary.textContent = `${problems.length}/${LOG_LIMITS.maxProblems} 题 · 约 ${formatBytes(bytes)} / ${formatBytes(LOG_LIMITS.maxRequestBytes)}`;
  summary.classList.toggle("limit-warning", bytes > LOG_LIMITS.maxRequestBytes || problems.length > LOG_LIMITS.maxProblems);
  renderSubmissionDirectory();
  // 当前日期的未提交内容同步到账号隔离的 v2 草稿；空表单则清理当前版本的草稿。
  if (activeFormDate && activeFormLoadState === "ready" && activeFormInitialized && activeFormDirty) {
    const hasContent = problems.some(
      (p) => p.problem || p.problemNumber || p.description || p.takeaway || p.code || p.tags
        || p.outcome || p.masteryStatus !== "unknown" || p.isMistake
        || (p.reviewStatus && p.reviewStatus !== "none") || p.reviewDue,
    );
    if (hasContent) persistDraft(activeFormDate, { problems, exists: activeFormExists, interval: readTrainingInterval() });
    else {
      removeStoredDraft(activeFormDate, {
        expectedSavedAt: draftSavedAts.get(activeFormDate),
        expectedMemoryVersion: draftMemoryVersions.get(activeFormDate),
      });
    }
  }
}

function renderSubmissionDirectory() {
  const blocks = [...document.querySelectorAll(".problem-block")];
  const index = document.getElementById("submission-problem-index");
  const capacity = document.getElementById("submission-capacity");
  const bar = document.getElementById("submission-capacity-bar");
  const dateLabel = document.getElementById("submission-index-date");
  if (!index || !capacity || !bar) return;
  index.replaceChildren(...blocks.map((block, position) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "submission-index-item";
    const name = block.querySelector(".problem-name")?.value.trim() || "未命名题目";
    const platform = block.querySelector(".problem-platform")?.value || "";
    const number = block.querySelector(".problem-number")?.value.trim() || "待补题号";
    const cardTitle = block.querySelector(".problem-card-title");
    const cardMeta = block.querySelector(".problem-card-meta");
    const cardIndex = block.querySelector(".problem-index");
    if (cardTitle) cardTitle.textContent = name;
    if (cardMeta) cardMeta.textContent = `${platform} · ${number}`;
    if (cardIndex) cardIndex.textContent = String(position + 1).padStart(2, "0");
    button.innerHTML = `<span>${String(position + 1).padStart(2, "0")}</span><strong></strong><small></small>`;
    button.querySelector("strong").textContent = name;
    button.querySelector("small").textContent = `${platform} · ${number}`;
    button.addEventListener("click", () => block.scrollIntoView({ behavior: "smooth", block: "start" }));
    return button;
  }));
  capacity.textContent = `已添加 ${blocks.length} / ${LOG_LIMITS.maxProblems} 题`;
  bar.style.width = `${Math.min(100, blocks.length / LOG_LIMITS.maxProblems * 100)}%`;
  if (dateLabel) dateLabel.textContent = document.getElementById("submit-date")?.value || "未选择日期";
  const atLimit = blocks.length >= LOG_LIMITS.maxProblems;
  for (const id of ["btn-add-problem", "btn-add-problem-aside", "btn-add-problem-toolbar"]) {
    const button = document.getElementById(id);
    if (button) { button.disabled = atLimit || activeFormLoadState !== "ready"; button.title = atLimit ? `每个日期最多记录 ${LOG_LIMITS.maxProblems} 道题` : ""; }
  }
}

export function setDateFormState(date, exists, revision = undefined) {
  const btnSave = document.getElementById("btn-save");
  const btnDelete = document.getElementById("btn-delete");
  btnSave.textContent = exists ? "更新记录" : "保存训练记录";
  btnDelete.style.display = exists ? "" : "none";
  btnDelete.onclick = exists ? () => handleDelete(date) : null;
  activeFormExists = exists;
  document.getElementById("journal-editor-title").textContent = exists ? "编辑训练日志" : "提交训练日志";
  document.getElementById("submission-breadcrumb-current").textContent = exists ? "编辑日志" : "新建日志";
  // undefined 表示「还没从服务端确认过版本」。草稿恢复路径就属于这种情况，
  // 保存前必须先读一次，否则会用一个猜测的版本去写。
  activeFormRevision = revision;
  activeFormConflictRevision = undefined;
}

/** 服务端版本未知时先读一次。只补版本与存在性，不覆盖用户已经输入的内容。 */
async function ensureFormRevision(date) {
  if (activeFormRevision !== undefined) return activeFormRevision;
  const loaded = await loadDateLog(date);
  const exists = loaded.problems.length > 0;
  activeFormExists = exists;
  activeFormRevision = loaded.revision ?? null;
  const btnDelete = document.getElementById("btn-delete");
  if (btnDelete) {
    btnDelete.style.display = exists ? "" : "none";
    btnDelete.onclick = exists ? () => handleDelete(date) : null;
  }
  const btnSave = document.getElementById("btn-save");
  if (btnSave) btnSave.textContent = exists ? "更新记录" : "提交到 GitHub";
  return activeFormRevision;
}

/**
 * 把条件写入的失败翻译成用户能照做的提示。
 *
 * 409 表示别人（或另一个标签页）先改了这一天：这里只把本地版本更新到服务端的当前版本，
 * 绝不自动重试——自动重试会覆盖对方的修改。用户的内容留在表单里，再点一次保存即可。
 * 428 表示本地根本不知道版本，同样先补上再让用户重试。
 */
async function describeWriteFailure(error, action) {
  const status = error?.status;
  if (status === 409 || status === 428) {
    const date = activeFormDate;
    try {
      const loaded = await loadDateLog(date);
      const latestRevision = loaded.revision ?? null;
      activeFormExists = loaded.problems.length > 0;
      if (status === 409) activeFormConflictRevision = latestRevision;
      else activeFormRevision = latestRevision;
    } catch {
      if (status === 409) activeFormConflictRevision = error?.currentRevision ?? error?.error?.currentRevision;
      else activeFormRevision = undefined;
    }
    return status === 409
      ? action === "保存"
        ? "该日期的记录已被其他页面或队员修改。你的草稿仍在；再次保存时会先询问是否用当前草稿覆盖最新版本。"
        : "该日期的记录已被其他页面或队员修改，未执行删除。请重新加载并核对最新内容后再删除。"
      : `本地还不确定该日期的版本，现已重新获取，请再试一次${action}。`;
  }
  return error?.message || "未知错误";
}

export function setDateLoadState(state) {
  activeFormLoadState = state;
  const blocked = state !== "ready";
  document.getElementById("btn-save").disabled = blocked;
  for (const id of ["btn-add-problem", "btn-add-problem-aside", "btn-add-problem-toolbar", "btn-save-draft"]) {
    const button = document.getElementById(id);
    if (button) button.disabled = blocked;
  }
  for (const control of document.querySelectorAll("#problem-list input, #problem-list select, #problem-list textarea, #problem-list button")) {
    control.disabled = blocked;
  }
  document.getElementById("btn-retry-date").hidden = state !== "error";
  renderSubmissionDirectory();
}

export async function onDateChange({ syncUrl = true } = {}) {
  if (!currentUser) {
    const msgEl = document.getElementById("submit-msg");
    if (msgEl) msgEl.textContent = "请先登录 GitHub，再加载或修改已有记录。";
    return;
  }

  const previousDraftOwner = draftOwnerLogin;
  const memberId = ensureDraftOwner();
  const accountChanged = Boolean(previousDraftOwner && previousDraftOwner !== memberId);
  if (activeFormDate && activeFormInitialized && activeFormDirty && !accountChanged) {
    const snapshot = { problems: captureProblemDrafts(), exists: activeFormExists, interval: readTrainingInterval() };
    persistDraft(activeFormDate, snapshot);
  }

  const date = document.getElementById("submit-date").value;
  if (!date) return;
  const today = toUtc8(new Date().toISOString()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) {
    setDateLoadState("error");
    document.getElementById("submit-msg").textContent = "日期无效或晚于今天，请重新选择训练日期。";
    return;
  }
  if (syncUrl && window.location.pathname.replace(/\/+$/, "") === "/submit") {
    const params = new URLSearchParams(window.location.search);
    params.set("date", date);
    params.delete("problem");
    window.history.replaceState(null, "", `/submit/?${params}`);
  }
  activeFormDate = date;

  const msgEl = document.getElementById("submit-msg");
  // 草稿不能跳过服务端加载：保存是整日替换，必须先知道当天已经有哪些题。
  // v1 草稿不会读取或迁移，避免不同账号之间意外恢复内容。
  const stored = memberId ? draftStore.load(memberId, date) : { status: "missing", draft: null };
  const draft = dateDrafts.get(date) || (stored.status === "found" ? {
    problems: stored.draft.problems,
    exists: stored.draft.exists,
    interval: stored.draft.interval,
  } : null);

  const sequence = ++dateLoadSequence;
  setDateFormState(date, false);
  activeFormInitialized = false;
  resetProblems();
  setDateLoadState("loading");
  msgEl.textContent = "正在加载该日期的记录...";

  try {
    const loaded = await loadDateLog(date);
    if (sequence !== dateLoadSequence || date !== activeFormDate) return;
    const exists = loaded.problems.length > 0;
    const serverProblems = loaded.problems.map((p) => ({ ...p, problem: p.name }));
    const draftProblems = draft?.problems || [];
    const restoredProblems = draft
      ? [...draftProblems, ...serverProblems.filter((p) => !draftProblems.some((d) => d.id === p.id))]
      : serverProblems;
    const recoveredCount = restoredProblems.length - draftProblems.length;
    setTrainingInterval(draft?.interval || loaded);
    if (restoredProblems.length) {
      populateProblems(restoredProblems);
      if (draft && recoveredCount) {
        msgEl.textContent = `已加载当天记录，并将本地草稿与服务器上另外 ${recoveredCount} 道题合并；保存前请核对。`;
      } else if (draft) {
        msgEl.textContent = "已加载当天记录并恢复本地草稿，请核对后保存。";
      } else {
        msgEl.textContent = loaded.updatedAt
          ? `📝 加载已有记录，最后更新于 ${formatUpdateTime(loaded.updatedAt)}，修改后点击「更新记录」即可覆盖`
          : "📝 加载已有记录，修改后点击「更新记录」即可覆盖";
      }
    } else {
      resetProblems();
      msgEl.textContent = "";
    }
    setDateFormState(date, exists, loaded.revision ?? null);
    if (draft) {
      rememberDraft(date, { problems: captureProblemDrafts(), exists, interval: readTrainingInterval() }, stored.status === "found" ? stored.draft.savedAt : undefined);
    }
    activeFormInitialized = true;
    activeFormDirty = Boolean(draft);
    setDateLoadState("ready");
  } catch (error) {
    if (sequence !== dateLoadSequence || date !== activeFormDate) return;
    setDateFormState(date, false, undefined);
    setDateLoadState("error");
    msgEl.textContent = `加载失败，尚未确认该日期是否有记录：${error.message}`;
  }
}

export function saveDraftNow() {
  const date = document.getElementById("submit-date")?.value;
  const msg = document.getElementById("submit-msg");
  if (!currentUser || !date) {
    if (msg) msg.textContent = "请先登录并选择训练日期。";
    return false;
  }
  activeFormDirty = true;
  const result = persistDraft(date, { problems: captureProblemDrafts(), exists: activeFormExists, interval: readTrainingInterval() });
  if (!result.savedAt) {
    if (msg) msg.textContent = "草稿未能保存到此浏览器，请检查浏览器存储空间后重试。";
    return false;
  }
  const savedAt = new Date(result.savedAt);
  const time = Number.isNaN(savedAt.getTime()) ? "刚刚" : savedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  if (msg) msg.textContent = `草稿已保存到此浏览器 · ${time}（已选附件由本机附件存储单独保留）`;
  const state = document.getElementById("submission-draft-state");
  if (state) state.textContent = `已保存草稿 · ${time}`;
  return true;
}

export function populateProblems(parsed) {
  const list = document.getElementById("problem-list");
  list.innerHTML = "";
  if (!parsed.length) {
    list.appendChild(createProblemRow(0));
    refreshStatementStates();
    void restorePendingAttachments();
    return;
  }
  parsed.forEach((p, i) => {
    const row = createProblemRow(i);
    row.dataset.problemId = p.id || createProblemId();
    if (Number.isInteger(p.fileIndex)) row.dataset.fileIndex = String(p.fileIndex);
    row.querySelector(".problem-name").value = p.problem || "";
    row.querySelector(".problem-platform").value = p.platform || PLATFORMS.LUOGU;
    row.querySelector(".problem-number").value = p.problemNumber || "";
    setDifficultyValue(row.querySelector(".problem-difficulty"), p.difficultyRating, p.difficulty);
    row.querySelector(".problem-tags").value = Array.isArray(p.tags) ? p.tags.join(", ") : (p.tags || "");
    const state = normalizeLearningState(p);
    row.querySelector(".problem-review-status").value = state.reviewStatus;
    row.querySelector(".problem-review-due").value = state.reviewStatus === "todo" ? (p.reviewDue || "") : "";
    const outcome = row.querySelector(`.problem-outcome[value="${CSS.escape(state.outcome || "")}"]`);
    if (outcome) outcome.checked = true;
    row.querySelector(".problem-mastery-status").value = state.masteryStatus;
    row.querySelector(".problem-is-mistake").checked = state.isMistake;
    row.querySelector(".problem-review-status").dispatchEvent(new Event("change"));
    row.querySelector(".problem-description").value = p.description || "";
    row.querySelector(".problem-takeaway").value = p.takeaway || "";
    row.querySelector(".problem-code").value = p.code || "";
    const enrichment = Object.fromEntries(Object.entries(p).filter(([key]) => ["statementAttachment", "statementSource", "metadataSources", "aiAnalysis"].includes(key)));
    if (Object.keys(enrichment).length) row.dataset.enrichment = JSON.stringify(enrichment);
    // 服务端已归档的附件单独记账：附件区只关心「仓库里有没有」，与 AI 元数据无关。
    if (p.statementAttachment) row.dataset.serverAttachment = JSON.stringify(p.statementAttachment);
    if (Array.isArray(p.statementImages) && p.statementImages.length) row.dataset.serverImages = JSON.stringify(p.statementImages);
    list.appendChild(row);
  });
  updateSubmissionSummary();
  refreshStatementStates();
  void restorePendingAttachments();
}

/**
 * 从 IndexedDB 恢复「已选好但还没保存」的 PDF。
 *
 * 恢复本身是异步的，而用户可能在等待期间切换日期，因此完成后必须重新确认当前日期
 * 没有被换掉，避免把上一天的附件贴到这一天。
 *
 * 附件按题目 id 归属，而 id 是客户端生成的：只有同时恢复了草稿，重建出来的题目才
 * 会拿到同一批 id。对不上的条目不能默默留着——那会变成一份永远不会被上传、
 * 却又一直占着提示的僵尸文件，所以这里明确清掉并如实告知用户。
 */
async function restorePendingAttachments() {
  pendingAttachments.clear();
  pendingStatementImages.clear();
  const memberId = currentDraftOwner();
  const date = activeFormDate;
  if (!memberId || !date) return;
  const stored = await attachmentStore.loadDate(memberId, date);
  const storedImages = await attachmentStore.loadImages(memberId, date);
  if (date !== activeFormDate || memberId !== currentDraftOwner()) return;

  const blockIds = new Set([...document.querySelectorAll(".problem-block")].map((block) => block.dataset.problemId));
  const orphans = [];
  let restored = 0;
  for (const [problemId, item] of Object.entries(stored.items)) {
    if (!blockIds.has(problemId)) { orphans.push(problemId); continue; }
    pendingAttachments.set(problemId, { action: "replace", blob: item.blob, fileName: item.fileName, sha256: item.sha256 });
    restored += 1;
  }
  let restoredImages = 0;
  for (const [problemId, images] of Object.entries(storedImages.items)) {
    if (!blockIds.has(problemId)) { orphans.push(problemId); continue; }
    pendingStatementImages.set(problemId, images.map((image) => ({ fileName: image.fileName, sha256: image.sha256, mimeType: image.mimeType, blob: image.blob })));
    restoredImages += images.length;
  }
  for (const problemId of [...new Set(orphans)]) {
    // 题目已经不在表单里了：PDF 与图片两部分都要清掉，不能留下永远不会上传的僵尸条目。
    await attachmentStore.remove(memberId, date, problemId);
    await attachmentStore.removeImages(memberId, date, problemId);
  }
  if (restored || restoredImages) refreshStatementStates();

  const msgEl = document.getElementById("submit-msg");
  if (!msgEl) return;
  if (restored || restoredImages) msgEl.textContent = `已恢复该日期尚未上传的题面${restored ? " PDF" : ""}${restored && restoredImages ? "与" : ""}${restoredImages ? `${restoredImages} 张图片` : ""}，保存后会归档到仓库。`;
  else if (orphans.length) msgEl.textContent = "之前选择的题面附件已无法对应到当前题目，请重新选择。";
}

async function handleDelete(date) {
  if (!currentUser) {
    alert("请先登录 GitHub");
    return;
  }
  if (!confirm(`确定要删除 ${date} 的训练记录吗？此操作不可撤销。`)) return;

  const msgEl = document.getElementById("submit-msg");
  msgEl.textContent = "删除中...";
  const btnDelete = document.getElementById("btn-delete");
  if (btnDelete) btnDelete.disabled = true;

  try {
    const revision = await ensureFormRevision(date);
    await deleteDateLog(date, revision);

    removeStoredDraft(date, {
      expectedSavedAt: draftSavedAts.get(date),
      expectedMemoryVersion: draftMemoryVersions.get(date),
    });
    activeFormRevision = null;
    msgEl.textContent = "删除成功。公开页面将在部署完成后更新。";
    setDateFormState(date, false, null);
    resetProblems();
  } catch (err) {
    msgEl.textContent = `❌ 删除失败：${await describeWriteFailure(err, "删除")}`;
  } finally {
    if (btnDelete) btnDelete.disabled = false;
  }
}

export { handleDelete };

// ── 快速导入（Codeforces / AtCoder AC 记录、洛谷题号补全）──

let importPlatform = "codeforces";
let importResults = [];
let importChecked = new Set();

// 导入结果条目里对难度的展示：统一写成 Rating（★ 1200）口径
function ratingDisplay(rating) {
  const value = Number(rating);
  return value > 0 ? ratingLabel(value) : "未标注";
}

export function openImportPanel(platform) {
  importPlatform = platform;
  importResults = [];
  importChecked = new Set();
  const panel = document.getElementById("import-panel");
  const input = document.getElementById("import-input");
  input.placeholder = platform === "codeforces"
    ? "输入 Codeforces 用户名"
    : platform === "atcoder"
      ? "输入 AtCoder 用户名"
      : "粘贴洛谷题号，空格分隔（如 P1001 P3376）";
  // 预填队员预置的用户名（可在输入框内修改）：CF 与 AtCoder 的 handle 不同名，
  // 各自来自 worker 的 CF_HANDLES / ATCODER_HANDLES，通过 /api/session 下发。
  input.value = platform === "codeforces"
    ? currentUser?.cfHandle || ""
    : platform === "atcoder"
      ? currentUser?.atcoderHandle || ""
      : "";
  document.getElementById("import-status").textContent = "";
  document.getElementById("import-list").innerHTML = "";
  document.getElementById("btn-import-add").hidden = true;
  panel.hidden = false;
  input.focus();
  input.select();
}

export function closeImportPanel() {
  document.getElementById("import-panel").hidden = true;
  document.getElementById("import-list").innerHTML = "";
  document.getElementById("btn-import-add").hidden = true;
}

export async function runImport() {
  const input = document.getElementById("import-input");
  const status = document.getElementById("import-status");
  const addBtn = document.getElementById("btn-import-add");
  const value = input.value.trim();
  if (!value) {
    status.textContent = "请先输入内容。";
    return;
  }
  status.textContent = "查询中...";
  try {
    const result = importPlatform === "codeforces"
      ? await importCodeforces(value)
      : importPlatform === "atcoder"
        ? await importAtCoder(value)
        : await importLuogu(value);
    importResults = result.problems || [];
    importChecked = new Set(importResults.map((_, i) => i));
    renderImportList();
    status.textContent = importResults.length
      ? `共找到 ${importResults.length} 题，勾选后点击「添加到表单」。${importPlatform === "codeforces"
        ? ""
        : importPlatform === "atcoder"
          ? "（标签取自洛谷镜像，洛谷未收录的题目需手动补充）"
          : "（算法标签来自洛谷公开标签字典，少数未标注题目需手动补充）"}`
      : "没有找到可导入的题目。";
    addBtn.hidden = !importResults.length;
  } catch (err) {
    status.textContent = `导入失败：${err.message}`;
  }
}

function renderImportList() {
  const listEl = document.getElementById("import-list");
  listEl.innerHTML = "";
  importResults.forEach((p, i) => {
    const label = document.createElement("label");
    label.className = "import-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = importChecked.has(i);
    cb.addEventListener("change", () => {
      if (importChecked.has(i)) importChecked.delete(i);
      else importChecked.add(i);
    });
    const span = document.createElement("span");
    // 导入结果对难度的展示：一律写成 Rating 口径（CF/AtCoder 有官方数值，洛谷按官方难度换算）
    const importedRating = resolveDifficultyRating({ rating: p.rating, difficulty: p.difficulty });
    const diff = importedRating ? ` · ${ratingDisplay(importedRating)}` : "";
    const hasDesc = p.description ? " · 含题面" : "";
    // 标签能拿到就顺手显示（AtCoder 的标签来自洛谷镜像，不是每题都有），最多列 3 个。
    const tagNote = Array.isArray(p.tags) && p.tags.length ? ` · ${p.tags.slice(0, 3).join("/")}` : "";
    span.textContent = `${p.platform} ${p.problemNumber || ""} · ${p.name}${diff}${hasDesc}${tagNote}`;
    // 提交页公开可看源码（CF 提交页受反爬保护但可在浏览器中直接打开），提供直达链接供复制
    if (p.submissionUrl) {
      const link = document.createElement("a");
      link.href = p.submissionUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "import-submission-link";
      link.title = "在新标签页打开该 AC 提交（可复制源码）";
      link.textContent = "📄 提交";
      label.append(cb, span, link);
    } else {
      label.append(cb, span);
    }
    listEl.appendChild(label);
  });
}

// 将导入项填入指定题目块（含标签中英合并、难度/题面回填）
function fillProblemRow(row, p) {
  row.querySelector(".problem-name").value = p.name || "";
  row.querySelector(".problem-platform").value = p.platform || PLATFORMS.OTHER;
  row.querySelector(".problem-number").value = p.problemNumber || "";
  // 导入的 Codeforces / AtCoder 自带与 CF 同尺度的数值难度，洛谷带官方难度标签；
  // 两者统一走 resolveDifficultyRating 落到 Rating 下拉，任何平台都不需要手工换算。
  const select = row.querySelector(".problem-difficulty");
  const importedRating = resolveDifficultyRating({ rating: p.rating, difficulty: p.difficulty });
  if (importedRating) setDifficultyValue(select, importedRating, null);
  if (Array.isArray(p.tags) && p.tags.length) {
    // CF 英文标签经 normalizeTagList 自动合并为中文标签
    row.querySelector(".problem-tags").value = [...new Set(normalizeTagList(p.tags))].join(", ");
  }
  if (p.description) {
    row.querySelector(".problem-description").value = p.description;
    // 洛谷导入的题面同样会把图片一起带回来；登记成本题的待上传图片。
    if (Array.isArray(p.statementImages) && p.statementImages.length) void registerStatementImages(row, p.statementImages);
  }
}

function appendImportedProblem(p) {
  const list = document.getElementById("problem-list");
  // 优先填补第一个未填写名称的空题目块，而不是盲目追加到末尾
  const emptyBlock = [...list.querySelectorAll(".problem-block")].find(
    (block) => !block.querySelector(".problem-name").value.trim(),
  );
  if (emptyBlock) {
    fillProblemRow(emptyBlock, p);
    markFormEdited();
    return emptyBlock;
  }
  if (list.children.length >= LOG_LIMITS.maxProblems) {
    document.getElementById("submit-msg").textContent = `每个日期最多记录 ${LOG_LIMITS.maxProblems} 道题`;
    return null;
  }
  const row = createProblemRow(list.children.length);
  fillProblemRow(row, p);
  list.appendChild(row);
  markFormEdited();
  return row;
}

export async function addImportedToForm() {
  const selected = importResults.filter((_, i) => importChecked.has(i));
  if (!selected.length) return;
  const added = selected.map((problem) => ({ problem, row: appendImportedProblem(problem) })).filter((item) => item.row);
  closeImportPanel();
  markFormEdited();

  // CF 的 AC 列表接口不带题面。加入表单后自动走与「抓取题面」按钮完全相同的
  // 服务端解析与图片归档流程；失败只留下逐题提示，不撤销已经导入的基本信息。
  const pending = added.filter(({ problem }) => problem.platform === PLATFORMS.CODEFORCES && problem.problemNumber);
  if (!pending.length) return;
  const message = document.getElementById("submit-msg");
  message.textContent = `正在为 ${pending.length} 道 Codeforces 题抓取题面…`;
  let next = 0;
  let completed = 0;
  const worker = async () => {
    while (next < pending.length) {
      const item = pending[next++];
      if (await fetchStatementForBlock(item.row)) completed += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, () => worker()));
  message.textContent = completed === pending.length
    ? `已添加 ${added.length} 道题，并自动抓取 ${completed} 道 Codeforces 题面。`
    : `已添加 ${added.length} 道题；Codeforces 题面成功抓取 ${completed}/${pending.length}，失败项可在题目块中重试。`;
}

export function isModalOpen() {
  return window.location.pathname.replace(/\/+$/, "") === "/submit";
}

export async function handleSubmit() {
  if (submitting) return;
  submitting = true;

  try {
    if (!currentUser) {
      alert("请先登录 GitHub");
      return;
    }

    const date = document.getElementById("submit-date").value;
    if (!date) {
      document.getElementById("submit-msg").textContent = "请选择日期";
      return;
    }

    if (activeFormConflictRevision !== undefined) {
      const overwrite = confirm("服务器上的这一天已被修改。是否用当前草稿覆盖最新版本？建议先取消，并在另一个页面核对改动。");
      if (!overwrite) {
        document.getElementById("submit-msg").textContent = "已取消覆盖；当前草稿仍保留在浏览器中。";
        return;
      }
      activeFormRevision = activeFormConflictRevision;
      activeFormConflictRevision = undefined;
    }

    const problems = collectProblems();
    if (!problems.length) {
      document.getElementById("submit-msg").textContent = "请至少填写一道题";
      return;
    }

    const interval = readTrainingInterval();
    try {
      validateLogInput({ problems, ...interval });
      validateTrainingInterval({ recordDate: date, ...interval, today: toUtc8(new Date().toISOString()).slice(0, 10) });
    } catch (error) {
      const msgEl = document.getElementById("submit-msg");
      msgEl.textContent = error.message;
      const firstInput = document.querySelector(".problem-name");
      if (firstInput) {
        firstInput.setAttribute("aria-describedby", "submit-msg");
        firstInput.focus();
      }
      return;
    }

    document.querySelectorAll("[aria-describedby='submit-msg']").forEach(el => el.removeAttribute("aria-describedby"));

    const msgEl = document.getElementById("submit-msg");
    msgEl.textContent = "提交中...";
    const btnSave = document.getElementById("btn-save");
    btnSave.disabled = true;

    try {
      const isEdit = activeFormExists;

      // 保存前创建一次快照；保存期间的后续输入会得到新的内存版本和 savedAt，
      // 因而不会被本次成功提交清掉。
      const savedDraft = persistDraft(date, { problems: captureProblemDrafts(), exists: activeFormExists, interval });
      // 服务端版本未知（草稿恢复路径）时先读一次，避免用过期的猜测版本写入。
      const revision = await ensureFormRevision(date);
      // 只要本次涉及附件（PDF 或题面图片的新增/替换/移除），就必须走 v2：
      // 旧接口既没有上传字节的能力，也不认识题面图片引用。
      const result = pendingAttachments.size || hasStatementImages()
        ? await saveWithAttachments(date, problems, interval, revision)
        : await saveDateLog(date, problems, interval, revision);
      // 服务端回传新版本，因此连续编辑保存不必重新加载页面。
      activeFormRevision = result?.revision ?? null;

      removeStoredDraft(date, {
        expectedSavedAt: savedDraft.savedAt,
        expectedMemoryVersion: savedDraft.memoryVersion,
      });
      activeFormDirty = false;
      msgEl.textContent = isEdit
        ? "更新已写入，公开页面将在部署完成后更新。"
        : "记录已写入，公开页面将在部署完成后更新。";
      setDateFormState(date, true, activeFormRevision);
    } catch (err) {
      msgEl.textContent = `❌ 提交失败：${await describeWriteFailure(err, "保存")}`;
    } finally {
      btnSave.disabled = false;
    }
  } finally {
    submitting = false;
  }
}
