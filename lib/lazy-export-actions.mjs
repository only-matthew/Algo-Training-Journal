// Export converters are only needed after an export click.
export async function exportToMD(log) {
  return (await import("./export-actions.mjs")).exportToMD(log);
}

export async function exportToLatex(log) {
  return (await import("./export-actions.mjs")).exportToLatex(log);
}

export async function exportSelectedToMD(logs) {
  return (await import("./export-actions.mjs")).exportSelectedToMD(logs);
}

export async function exportSelectedToLatex(logs) {
  return (await import("./export-actions.mjs")).exportSelectedToLatex(logs);
}

function printAfterImport(action, records) {
  if (!records || (Array.isArray(records) && !records.length)) return;
  // Reserve the popup synchronously while the browser still has the click gesture.
  const popup = window.open("", "_blank");
  if (!popup) return;
  popup.document.body.textContent = "正在准备打印内容…";
  return import("./export-actions.mjs")
    .then((module) => { if (!popup.closed) return module[action](records, popup); })
    .catch((error) => { popup.close(); alert(`导出失败：${error.message}`); });
}

export function exportToPDF(log) { return printAfterImport("exportToPDF", log); }
export function exportSelectedToPDF(logs) { return printAfterImport("exportSelectedToPDF", logs); }
