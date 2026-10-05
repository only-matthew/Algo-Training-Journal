import { escapeHtml } from "./escape-html.mjs";
import { BATCH_MAX_MD, BATCH_MAX_PDF, PRINT_CSS, buildBatchLatexDocument, buildMDContent, buildSingleLatexDocument, mdToPrintableHTML, safeFilename } from "./export-content.mjs";
import { printMarkdownDocument } from "./print.mjs";
import { loadProblemDetail } from "./data.mjs";

const FETCH_CONCURRENCY = 10;

async function fetchFullLogs(selectedLogs, maxCount) {
  if (selectedLogs.length > maxCount) {
    alert(`单次最多导出 ${maxCount} 题，当前选中 ${selectedLogs.length} 题。请缩小时间范围。`);
    return [];
  }
  const results = new Array(selectedLogs.length);
  let completed = 0;
  const statusEl = () => document.getElementById("export-status");

  async function fetchOne(index) {
    const s = selectedLogs[index];
    try {
      const full = await loadProblemDetail(s.member, s.date, s.problemId || s.problemIndex || 0);
      results[index] = { ...s, ...full };
    } catch {
      results[index] = s;
    }
    completed += 1;
    const el = statusEl();
    if (el) el.textContent = `正在获取题目详情 ${completed}/${selectedLogs.length}...`;
  }

  const workers = [];
  for (let i = 0; i < Math.min(FETCH_CONCURRENCY, selectedLogs.length); i++) {
    workers.push((async () => {
      for (let j = i; j < selectedLogs.length; j += FETCH_CONCURRENCY) {
        await fetchOne(j);
      }
    })());
  }
  await Promise.all(workers);

  const el = statusEl();
  if (el) el.textContent = "正在生成文件...";
  return results;
}


export function exportToMD(log) {
  if (!log) return;
  downloadBlob(buildMDContent(log), `${safeFilename(log)}.md`);
}

export function exportToPDF(log, popup) {
  if (!log) return;
  // Reserve the popup in the original click, then fetch details inside it.
  return printMarkdownDocument(async (renderMarkdown) => {
    const record = typeof log === 'function' ? await log() : log;
    return record ? mdToPrintableHTML(buildMDContent(record), record.problem || "题目", renderMarkdown) : '';
  }, popup);
}

export function exportToLatex(log) {
  if (!log) return;
  downloadBlob(buildSingleLatexDocument(log), `${safeFilename(log)}.tex`, "application/x-tex;charset=utf-8");
}

export async function exportSelectedToMD(logs) {
  if (!logs || !logs.length) return;
  const fullLogs = await fetchFullLogs(logs, BATCH_MAX_MD);
  if (!fullLogs.length) return;
  const parts = fullLogs.map((log, i) => {
    const md = buildMDContent(log);
    return i === 0 ? md : `\n---\n\n${md}`;
  });
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadBlob(parts.join("\n\n"), `训练记录-${timestamp}.md`);
  const el = document.getElementById("export-status");
  if (el) el.textContent = "";
}

export async function exportSelectedToPDF(logs, popup) {
  if (!logs || !logs.length) return;
  await printMarkdownDocument(async (renderMarkdown) => {
    const fullLogs = await fetchFullLogs(logs, BATCH_MAX_PDF);
    if (!fullLogs.length) return;
    const parts = fullLogs.map((log, i) => {
      const md = buildMDContent(log);
      const isFirst = log === fullLogs[0];
      return isFirst ? renderMarkdown(md) : `<div class="page-break"></div>${renderMarkdown(md)}`;
    });
    const title = `训练记录 · ${fullLogs.length} 题`;
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8" /><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head>
<body><h1>${escapeHtml(title)}</h1>${parts.join("\n")}</body></html>`;
    return html;
  }, popup);
  const el = document.getElementById("export-status");
  if (el) el.textContent = "";
}

export async function exportSelectedToLatex(logs) {
  if (!logs || !logs.length) return;
  const fullLogs = await fetchFullLogs(logs, BATCH_MAX_MD);
  if (!fullLogs.length) return;
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadBlob(buildBatchLatexDocument(fullLogs), `训练记录-${timestamp}.tex`, "application/x-tex;charset=utf-8");
  const el = document.getElementById("export-status");
  if (el) el.textContent = "";
}

function downloadBlob(content, filename, mimeType = "text/markdown;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
