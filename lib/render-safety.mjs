import { Marked, Renderer } from "../vendor/marked/marked.esm.mjs";

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function isSafeUrl(value) {
  const url = String(value || "").trim();
  return /^(?:https?:\/\/|\/|\.\.?\/|#)/i.test(url);
}

const renderer = new Renderer();

renderer.html = function (token) {
  return escapeHtml(token.raw);
};

renderer.link = function (token) {
  const label = this.parser.parseInline(token.tokens);
  if (!isSafeUrl(token.href)) return label;

  const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
  return `<a href="${escapeHtml(token.href)}"${title} target="_blank" rel="noopener noreferrer">${label}</a>`;
};

renderer.image = function (token) {
  if (!isSafeUrl(token.href)) return escapeHtml(token.text || "");

  const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
  return `<img src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text || "")}"${title}>`;
};

const mathExtensions = [
  {
    name: "displayMath",
    level: "block",
    start(src) {
      return src.indexOf("$$");
    },
    tokenizer(src) {
      const match = /^\$\$([\s\S]+?)\$\$(?:\n|$)/.exec(src);
      if (!match) return undefined;
      return { type: "displayMath", raw: match[0], formula: match[1].trim() };
    },
    renderer(token) {
      return `$$${escapeHtml(token.formula)}$$`;
    },
  },
  {
    name: "inlineMath",
    level: "inline",
    start(src) {
      return src.indexOf("$");
    },
    tokenizer(src) {
      const match = /^\$(?!\$)([^$\n]+?)\$(?!\$)/.exec(src);
      if (!match) return undefined;
      return { type: "inlineMath", raw: match[0], formula: match[1].trim() };
    },
    renderer(token) {
      return `$${escapeHtml(token.formula)}$`;
    },
  },
];

const markdown = new Marked({
  breaks: true,
  gfm: true,
  renderer,
  extensions: mathExtensions,
});

export function renderMarkdown(text) {
  if (!text) return "";
  return markdown.parse(String(text)).trim();
}
