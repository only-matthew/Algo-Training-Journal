import { createAnalysisRequest, buildAnalysisPrompt, validateAnalysisResult, applyAnalysis } from "./problem-analysis.mjs";

function validateAnalysisForBlock(div, { parseRatingLabel, isReady }) {
  const request = JSON.parse(div.dataset.analysisRequest || "null");
  if (!request) throw new Error("请先生成本题提示词");
  const result = validateAnalysisResult(div.querySelector(".analysis-json").value, request);
  div.dataset.analysisResult = JSON.stringify(result);
  const preview = div.querySelector(".analysis-preview");
  preview.hidden = false;
  preview.textContent = `摘要：${result.summary}\n标签：${result.tags.join(", ") || "无"}\n估计：${result.difficulty.estimate ?? "无"}\n${result.missingInformation.length ? `缺失：${result.missingInformation.join("；")}` : ""}`;
  div.querySelector(".analysis-apply-description").checked = !div.querySelector(".problem-description").value.trim();
  div.querySelector(".analysis-apply-difficulty").checked = !parseRatingLabel(div.querySelector(".problem-difficulty").value) && result.difficulty.estimate !== null && !result.missingInformation.length;
  div.querySelector(".analysis-apply-tags").checked = true;
  div.querySelector(".btn-apply-analysis").disabled = !isReady();
  return result;
}

function cachedAnalysisResult(div) {
  try { return JSON.parse(div.dataset.analysisResult || "null"); } catch { return null; }
}

export function bindProblemAnalysis(div, { extractProblemFields, parseRatingLabel, setDifficultyValue, legalTags, isReady, markFormEdited }) {
  div.querySelector(".btn-ai-enrich").addEventListener("click", async () => {
    const status = div.querySelector(".summarize-status"); const panel = div.querySelector(".problem-enrichment"); panel.hidden = false;
    try {
      const problem = { ...extractProblemFields(div), tags: div.querySelector(".problem-tags").value.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean) };
      const request = await createAnalysisRequest(problem);
      div.dataset.analysisRequest = JSON.stringify(request);
      const prompt = buildAnalysisPrompt(request, { existingDifficultyRating: parseRatingLabel(div.querySelector(".problem-difficulty").value), tags: problem.tags, legalTags });
      try { await navigator.clipboard.writeText(prompt); } catch { /* Text remains available via the preview panel. */ }
      window.open("https://chat.deepseek.com/", "_blank", "noopener");
      panel.querySelector(".analysis-preview").hidden = false;
      panel.querySelector(".analysis-preview").textContent = prompt;
      status.textContent = "已打开 DeepSeek 并准备提示词；可从预览手动复制，稍后再粘贴 JSON。";
    } catch (error) { status.textContent = `无法生成提示词：${error.message}`; }
  });
  const analysisInput = div.querySelector(".analysis-json");
  const analysisApplyButton = div.querySelector(".btn-apply-analysis");
  analysisInput.addEventListener("input", () => {
    delete div.dataset.analysisResult;
    analysisApplyButton.disabled = !isReady() || !analysisInput.value.trim();
  });
  div.querySelector(".btn-parse-analysis").addEventListener("click", () => {
    const status = div.querySelector(".summarize-status");
    try {
      validateAnalysisForBlock(div, { parseRatingLabel, isReady });
      status.textContent = "JSON 已验证，请选择需要应用的字段。";
    } catch (error) {
      analysisApplyButton.disabled = true;
      status.textContent = `JSON 未应用：${error.message}`;
    }
  });
  analysisApplyButton.addEventListener("click", () => {
    const status = div.querySelector(".summarize-status");
    try {
      const result = cachedAnalysisResult(div) || validateAnalysisForBlock(div, { parseRatingLabel, isReady });
      const fields = [["description", ".analysis-apply-description"], ["difficultyRating", ".analysis-apply-difficulty"], ["tags", ".analysis-apply-tags"]]
        .filter(([, selector]) => div.querySelector(selector).checked).map(([field]) => field);
      const problem = { ...extractProblemFields(div), tags: div.querySelector(".problem-tags").value.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean) };
      const next = applyAnalysis(problem, result, { fields });
      if (fields.includes("description")) div.querySelector(".problem-description").value = next.description || "";
      if (fields.includes("difficultyRating")) setDifficultyValue(div.querySelector(".problem-difficulty"), next.difficultyRating, problem.difficulty);
      if (fields.includes("tags")) div.querySelector(".problem-tags").value = (next.tags || []).join(", ");
      div.dataset.enrichment = JSON.stringify(Object.fromEntries(Object.entries(next).filter(([key]) => ["statementAttachment", "statementSource", "metadataSources", "aiAnalysis"].includes(key))));
      status.textContent = fields.length ? "已应用选择的建议，保存后才会写入记录。" : "未选择字段，未修改记录。";
      markFormEdited();
    } catch (error) { status.textContent = `应用失败：${error.message}`; }
  });
}
