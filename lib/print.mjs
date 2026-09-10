// Reserve the popup during the click, before loading Markdown or fetching logs.
export async function printMarkdownDocument(renderDocument) {
  const win = window.open("", "_blank");
  if (!win) return;
  try {
    win.document.body.textContent = "正在准备打印内容…";
    const { renderMarkdown } = await import("./render-safety.mjs");
    if (win.closed) return;
    const html = await renderDocument(renderMarkdown);
    if (win.closed) return;
    if (!html) { win.close(); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();

    const assetUrl = (path) => new URL(path, window.location.origin + "/").href;
    const link = win.document.createElement("link");
    link.rel = "stylesheet";
    link.href = assetUrl("vendor/prism/prism-tomorrow.min.css");
    win.document.head.appendChild(link);
    const print = () => {
      if (win.closed) return;
      if (win.Prism) win.Prism.highlightAll();
      win.print();
    };
    const prismJs = win.document.createElement("script");
    prismJs.src = assetUrl("vendor/prism/prism.min.js");
    prismJs.onerror = print;
    prismJs.onload = () => {
      if (win.closed) return;
      const cppJs = win.document.createElement("script");
      cppJs.src = assetUrl("vendor/prism/prism-cpp.min.js");
      cppJs.onload = print;
      cppJs.onerror = print;
      win.document.head.appendChild(cppJs);
    };
    win.document.head.appendChild(prismJs);
  } catch (error) {
    if (!win.closed) win.close();
    alert(`准备打印失败：${error.message}`);
  }
}
