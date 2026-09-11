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
    const addStylesheet = (path) => {
      const link = win.document.createElement("link");
      link.rel = "stylesheet";
      link.href = assetUrl(path);
      win.document.head.appendChild(link);
    };
    const loadScript = (path, onload, onerror) => {
      const script = win.document.createElement("script");
      script.src = assetUrl(path);
      script.onload = () => { if (!win.closed) onload(); };
      script.onerror = () => { if (!win.closed) onerror(); };
      win.document.head.appendChild(script);
    };

    addStylesheet("vendor/prism/prism-tomorrow.min.css");
    addStylesheet("vendor/katex/katex.min.css");

    const print = () => {
      if (win.closed) return;
      if (win.Prism) win.Prism.highlightAll();
      win.print();
    };

    // 正文里的 $...$ / $$...$$ 需要 KaTeX 才会渲染成公式，否则打印出来是裸美元符号
    const renderMath = () => {
      if (typeof win.renderMathInElement !== "function") return print();
      try {
        win.renderMathInElement(win.document.body, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ],
          throwOnError: false,
        });
      } catch (error) {
        console.error(error);
      }
      return print();
    };
    const loadKatex = () => loadScript("vendor/katex/katex.min.js",
      () => loadScript("vendor/katex/auto-render.min.js", renderMath, renderMath),
      print);

    // 代码高亮失败不能阻塞打印；没有公式时也不必加载 KaTeX
    const needsMath = /\$[^$\n]+\$/.test(html);
    loadScript("vendor/prism/prism.min.js",
      () => loadScript("vendor/prism/prism-cpp.min.js", needsMath ? loadKatex : print, print),
      print);
  } catch (error) {
    if (!win.closed) win.close();
    alert(`准备打印失败：${error.message}`);
  }
}
