export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

export function renderMarkdown(text) {
  if (!text) return "";

  const preserved = [];
  let processed = text.replace(/```(\w*)\s*\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = preserved.length;
    const languageClass = lang ? `language-${lang}` : "language-text";
    preserved.push(`<pre class="line-numbers"><code class="${languageClass}">${escapeHtml(code.trim())}</code></pre>`);
    return `\x00P${idx}\x00`;
  });

  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
    const idx = preserved.length;
    preserved.push(`$$${escapeHtml(formula.trim())}$$`);
    return `\x00P${idx}\x00`;
  });

  processed = processed.replace(/(?<!\$)\$(?!\$)([^$]+?)\$(?!\$)/g, (_, formula) => {
    const idx = preserved.length;
    preserved.push(`$${escapeHtml(formula.trim())}$`);
    return `\x00P${idx}\x00`;
  });

  processed = processed.replace(/`([^`]+)`/g, (_, codeContent) => {
    const idx = preserved.length;
    preserved.push(`<code class="language-text">${escapeHtml(codeContent)}</code>`);
    return `\x00P${idx}\x00`;
  });

  processed = processed.replace(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*#*$/gm, (_, marks, heading) => {
    const idx = preserved.length;
    const level = marks.length;
    preserved.push(`<h${level}>${escapeHtml(heading.trim())}</h${level}>`);
    return `\x00P${idx}\x00`;
  });

  return escapeHtml(processed)
    .replace(/\n/g, "<br>")
    .replace(/\x00P(\d+)\x00/g, (_, idx) => preserved[Number(idx)]);
}
