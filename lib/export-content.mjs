// 导出内容生成器（纯函数，不依赖 DOM / window）。
//
// 放在这里是为了让 Node 侧测试直接 import 与 lib/renderer.mjs 共用同一份实现，
// 避免测试里复制一份逻辑、线上改了而测试没跟着改。
import { escapeHtml } from "./escape-html.mjs";

export const BATCH_MAX_MD = 500;
export const BATCH_MAX_PDF = 100;

/* ------------------------------------------------------------------ *
 * Markdown 导出
 * ------------------------------------------------------------------ */

// 表格单元格里的 | 和换行会破坏 Markdown 表格结构
function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

// 代码里若出现 ``` 会提前结束围栏，这里挑一个比代码中最长反引号串更长的围栏
function markdownFence(code) {
  const longest = Math.max(0, ...(String(code).match(/`+/g) || []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

export function buildMDContent(log) {
  if (!log) return "";
  const reviewLabel = { none: "非错题", todo: "待复习", mastered: "已掌握" }[log.reviewStatus] || "";

  const tableHeader = "| 字段 | 内容 |\n|------|------|\n";
  const tableRows = [
    `| 题目 | ${markdownCell(log.problem)} |`,
    `| 队员 | ${markdownCell(log.member)} |`,
    `| 日期 | ${markdownCell(log.date)} |`,
    `| 平台 | ${markdownCell(log.platform)} |`,
    `| 题号 | ${markdownCell(log.problemNumber)} |`,
    `| 难度 | ${markdownCell(log.difficulty)} |`,
    `| 标签 | ${markdownCell((log.tags || []).join(", "))} |`,
    `| 错题状态 | ${markdownCell(reviewLabel)} |`,
  ].join("\n");

  const parts = [
    `# ${String(log.problem || "题目").replace(/\r?\n/g, " ").trim()}`,
    "",
    tableHeader + tableRows,
    "",
  ];
  if (log.description) parts.push("## 题目描述", "", String(log.description).trim(), "");
  if (log.takeaway) parts.push("## 收获 / 题解", "", String(log.takeaway).trim(), "");
  if (log.code) {
    const fence = markdownFence(log.code);
    parts.push("## 代码", "", fence + "cpp", String(log.code).replace(/\s+$/, ""), fence, "");
  }
  return parts.join("\n");
}

/* ------------------------------------------------------------------ *
 * LaTeX：文本转义
 *
 * 两个坑必须同时处理：
 *   1. 文本模式下的特殊字符（\ { } $ & # % _ ~ ^ < > |）不转义会直接编译失败；
 *   2. Unicode 数学/标点符号（≤ ≥ × ∼ …）在 CTeX 默认正文字体里没有字形，
 *      LaTeX 只会丢一句 "Missing character" 然后安静地把字符丢掉。
 * ------------------------------------------------------------------ */

const LATEX_ESCAPES = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "$": "\\$",
  "&": "\\&",
  "#": "\\#",
  "%": "\\%",
  "_": "\\_",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
  "<": "\\textless{}",
  ">": "\\textgreater{}",
  "|": "\\textbar{}",
};
const LATEX_SPECIALS_RE = /[\\{}$&#%_~^<>|]/g;

// 这些字符在正文/数学模式里都要换成 LaTeX 命令（数学模式用 \le，正文模式再用 $...$ 包起来）
const LATEX_SYMBOLS = {
  "≤": "\\le", "≥": "\\ge", "≠": "\\ne", "≈": "\\approx", "≡": "\\equiv", "≃": "\\simeq",
  "∼": "\\sim", "≅": "\\cong", "∝": "\\propto",
  "×": "\\times", "÷": "\\div", "±": "\\pm", "∓": "\\mp", "⋅": "\\cdot", "∗": "\\ast",
  "∞": "\\infty", "∑": "\\sum", "∏": "\\prod", "∫": "\\int", "∂": "\\partial", "√": "\\surd",
  "∈": "\\in", "∉": "\\notin", "∋": "\\ni", "⊂": "\\subset", "⊆": "\\subseteq",
  "⊃": "\\supset", "⊇": "\\supseteq", "∪": "\\cup", "∩": "\\cap", "∅": "\\varnothing",
  "∧": "\\wedge", "∨": "\\vee", "¬": "\\neg", "∀": "\\forall", "∃": "\\exists",
  "→": "\\to", "←": "\\leftarrow", "↔": "\\leftrightarrow",
  "⇒": "\\Rightarrow", "⇐": "\\Leftarrow", "⇔": "\\Leftrightarrow",
  "⌊": "\\lfloor", "⌋": "\\rfloor", "⌈": "\\lceil", "⌉": "\\rceil",
  "∥": "\\parallel", "⊥": "\\perp", "∠": "\\angle", "△": "\\triangle", "□": "\\square",
  "⋯": "\\cdots", "…": "\\dots", "°": "^\\circ", "′": "'", "″": "''",
  "−": "-", "–": "--", "—": "---", "‘": "`", "’": "'", "“": "``", "”": "''",
  "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta", "ε": "\\varepsilon",
  "ζ": "\\zeta", "η": "\\eta", "θ": "\\theta", "ι": "\\iota", "κ": "\\kappa",
  "λ": "\\lambda", "μ": "\\mu", "ν": "\\nu", "ξ": "\\xi", "π": "\\pi", "ρ": "\\rho",
  "σ": "\\sigma", "τ": "\\tau", "υ": "\\upsilon", "φ": "\\varphi", "χ": "\\chi",
  "ψ": "\\psi", "ω": "\\omega", "Γ": "\\Gamma", "Δ": "\\Delta", "Θ": "\\Theta",
  "Λ": "\\Lambda", "Ξ": "\\Xi", "Π": "\\Pi", "Σ": "\\Sigma", "Φ": "\\Phi",
  "Ψ": "\\Psi", "Ω": "\\Omega",
};
const LATEX_SYMBOLS_RE = new RegExp(`[${Object.keys(LATEX_SYMBOLS).join("")}]`, "g");

export function escapeLatexText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(LATEX_SPECIALS_RE, (ch) => LATEX_ESCAPES[ch])
    .replace(LATEX_SYMBOLS_RE, (ch) => `$${LATEX_SYMBOLS[ch]}$`);
}

// 数学模式内部：只把缺字形的 Unicode 符号换成命令，其余原样交给 LaTeX
function renderMath(formula) {
  return String(formula ?? "").replace(LATEX_SYMBOLS_RE, (ch) => LATEX_SYMBOLS[ch]);
}

/* ------------------------------------------------------------------ *
 * LaTeX：行内 / 块级 Markdown → LaTeX 正文
 * ------------------------------------------------------------------ */

const INLINE_SPECIALS_RE = /[\\`$*_[\]]/;

// \href{...} 的参数不能出现 # % \ { } 与空格，这里就地百分号编码
function escapeLatexUrl(value) {
  return String(value ?? "").replace(/[\\{}%#\s]/g, (ch) =>
    ch.trim() ? `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}` : "%20");
}

// 行内代码里的长标识符/长语句没有断行机会，会把整行顶出页面；
// 长片段先打标记再转义，最后换成 \allowbreak{}，避免切断转义产生的命令名。
const CODE_BREAK = "\u0000";
function latexCodeSpan(code) {
  const raw = String(code ?? "");
  const marked = raw.length > 16 ? [...raw].join(CODE_BREAK) : raw;
  return `\\texttt{${escapeLatexText(marked).replaceAll(CODE_BREAK, "\\allowbreak{}")}}`;
}

function renderInline(text) {
  const source = String(text ?? "");
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];

    // \ $ → 字面量美元符号；其它反斜杠字面输出（避免 \\ 变成换行、表格里变成换行）
    if (ch === "\\") {
      if (source[i + 1] === "$") { out += "\\$"; i += 2; continue; }
      out += "\\textbackslash{}";
      i += 1;
      continue;
    }

    // `code` → \texttt{}
    if (ch === "`") {
      const fence = /^`+/.exec(source.slice(i))[0];
      const end = source.indexOf(fence, i + fence.length);
      if (end !== -1) {
        out += latexCodeSpan(source.slice(i + fence.length, end));
        i = end + fence.length;
      } else {
        out += escapeLatexText(fence);
        i += fence.length;
      }
      continue;
    }

    // $$display$$ / $inline$ → 原样保留数学内容（单字符如 $n$ 也必须认得出来）
    if (ch === "$") {
      const display = source.startsWith("$$", i);
      const delimiter = display ? "$$" : "$";
      const from = i + delimiter.length;
      const end = source.indexOf(delimiter, from);
      const body = end === -1 ? "" : source.slice(from, end);
      const usable = end !== -1 && body.length > 0 && (display || !body.includes("\n\n"));
      if (usable) {
        out += display ? `\\[${renderMath(body)}\\]` : `$${renderMath(body)}$`;
        i = end + delimiter.length;
      } else {
        out += "\\$";
        i += delimiter.length;
      }
      continue;
    }

    // **粗体** / __粗体__ / *斜体* / _斜体_
    if (ch === "*" || ch === "_") {
      const doubled = source[i + 1] === ch;
      const marker = doubled ? ch + ch : ch;
      const previous = source[i - 1] || "";
      const midWord = !doubled && /[\p{L}\p{N}]/u.test(previous);
      const end = source.indexOf(marker, i + marker.length);
      const body = end === -1 ? "" : source.slice(i + marker.length, end);
      if (end !== -1 && body && !body.includes("\n") && !midWord) {
        out += doubled ? `\\textbf{${renderInline(body)}}` : `\\emph{${renderInline(body)}}`;
        i = end + marker.length;
      } else {
        out += escapeLatexText(marker);
        i += marker.length;
      }
      continue;
    }

    // [文字](地址) → \href{}{}
    if (ch === "[") {
      const link = /^\[([^\]\n]*)\]\(([^)\s]+)\)/.exec(source.slice(i));
      if (link) {
        out += `\\href{${escapeLatexUrl(link[2])}}{${renderInline(link[1])}}`;
        i += link[0].length;
        continue;
      }
    }

    const next = source.slice(i).search(INLINE_SPECIALS_RE);
    if (next === -1) { out += escapeLatexText(source.slice(i)); break; }
    if (next === 0) { out += escapeLatexText(ch); i += 1; continue; }
    out += escapeLatexText(source.slice(i, i + next));
    i += next;
  }
  return out;
}

const HEADING_COMMANDS = ["section", "subsection", "subsubsection", "paragraph", "subparagraph"];

// listings 的语言名要求固定拼写，写错会编译失败
const LISTINGS_LANGUAGES = {
  cpp: "C++", "c++": "C++", cxx: "C++", cc: "C++", hpp: "C++", h: "C++",
  c: "C", java: "Java", js: "Java", javascript: "Java", ts: "Java", typescript: "Java",
  python: "Python", py: "Python", pas: "Pascal", pascal: "Pascal", plain: "", text: "", txt: "",
};

// 从 ```cpp 这种围栏信息推断 listings 语言
function listingLanguage(hint, fallback = "C++") {
  const key = String(hint || "").trim().toLowerCase();
  if (!key) return fallback;
  return LISTINGS_LANGUAGES[key] ?? fallback;
}

// listings 是 verbatim 环境：正文不能转义，但必须打断提前出现的 \end{lstlisting}
function listingBlock(code, language) {
  const name = listingLanguage(language);
  const options = name ? `[language=${name}]` : "";
  const body = String(code ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\\end\s*\{lstlisting\}/g, "\\end {lstlisting}")
    .replace(/[ \t]+$/gm, "")
    .replace(/\s+$/, "");
  return `\\begin{lstlisting}${options}\n${body}\n\\end{lstlisting}`;
}

// 把一段 Markdown 正文转成 LaTeX；headingLevel 表示正文允许的最高层级
function renderProse(markdown, headingLevel = 3) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let paragraph = [];
  let list = null;
  let quote = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(renderInline(paragraph.join("\n")));
    paragraph = [];
  };
  const closeList = () => { if (list) { out.push(`\\end{${list}}`); list = null; } };
  const flushQuote = () => {
    if (!quote.length) return;
    out.push("\\begin{quote}", renderInline(quote.join("\n")), "\\end{quote}");
    quote = [];
  };
  // 块状结构切换前必须先把悬挂的段落 / 列表 / 引用收尾
  const flushAll = () => { flushParagraph(); closeList(); flushQuote(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = /^\s*`{3,}\s*([\w+#.-]*)\s*$/.exec(line);
    if (fence) {
      flushAll();
      const body = [];
      i += 1;
      while (i < lines.length && !/^\s*`{3,}\s*$/.test(lines[i])) { body.push(lines[i]); i += 1; }
      out.push(listingBlock(body.join("\n"), fence[1]));
      continue;
    }

    if (!line.trim()) { flushAll(); continue; }

    // $$...$$ 公式块（单行或跨行）→ \[...\]
    if (/^\s*\$\$/.test(line)) {
      const after = line.replace(/^\s*\$\$/, "");
      flushAll();
      const singleLine = after.indexOf("$$");
      if (singleLine !== -1) {
        out.push(`\\[${renderMath(after.slice(0, singleLine).trim())}\\]`);
        continue;
      }
      const body = [after];
      i += 1;
      while (i < lines.length) {
        const closing = lines[i].indexOf("$$");
        if (closing !== -1) { body.push(lines[i].slice(0, closing)); break; }
        body.push(lines[i]);
        i += 1;
      }
      out.push(`\\[${renderMath(body.join("\n").trim())}\\]`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = Math.min(headingLevel + heading[1].length - 1, HEADING_COMMANDS.length);
      out.push(`\\${HEADING_COMMANDS[level - 1]}{${renderInline(heading[2].trim())}}`);
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushAll();
      out.push("\\par\\medskip\\hrule\\medskip\\par");
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      flushQuote();
      const want = bullet ? "itemize" : "enumerate";
      if (list !== want) { closeList(); out.push(`\\begin{${want}}`); list = want; }
      out.push(`  \\item ${renderInline((bullet || numbered)[1].trim())}`);
      continue;
    }

    const quoted = /^\s*>\s?(.*)$/.exec(line);
    if (quoted) {
      flushParagraph();
      closeList();
      quote.push(quoted[1].trim());
      continue;
    }

    flushQuote();
    closeList();
    paragraph.push(line.trim());
  }

  flushAll();
  return out.filter((part) => part !== "").join("\n");
}

/* ------------------------------------------------------------------ *
 * LaTeX：单题 / 批量文档
 * ------------------------------------------------------------------ */

const REVIEW_LABELS_LATEX = { none: "非错题", todo: "待复习", mastered: "已掌握" };
// 用相对宽度的 p{} 列而不是 l，超长题名/标签会自动折行，也不会随 geometry 变化捅出页面
const TABLE_COLUMNS = "|>{\\raggedright\\arraybackslash}p{0.18\\textwidth}|>{\\raggedright\\arraybackslash}p{0.74\\textwidth}|";

function buildLatexContent(log) {
  if (!log) return "";
  const reviewLabel = REVIEW_LABELS_LATEX[log.reviewStatus] || "";
  // 防止 \section{ 后紧跟 [ 被 LaTeX 解析为可选参数
  const sectionTitle = escapeLatexText(log.problem || "题目").trim().replace(/^\[/, "{}[");

  const lines = [
    `\\section{${sectionTitle}}`,
    // \noindent：tabular 会被 \parindent 顶出去，导致整张表溢出页面
    `\\noindent\\begin{tabular}{${TABLE_COLUMNS}}`,
    "\\hline",
    `队员 & ${escapeLatexText(log.member).trim()} \\\\ \\hline`,
    `日期 & ${escapeLatexText(log.date).trim()} \\\\ \\hline`,
    `平台 & ${escapeLatexText(log.platform).trim()} \\\\ \\hline`,
    `题号 & ${escapeLatexText(log.problemNumber).trim()} \\\\ \\hline`,
    `难度 & ${escapeLatexText(log.difficulty).trim()} \\\\ \\hline`,
    `标签 & ${escapeLatexText((log.tags || []).join(", ")).trim()} \\\\ \\hline`,
    `错题状态 & ${escapeLatexText(reviewLabel).trim()} \\\\ \\hline`,
    "\\end{tabular}",
    "",
  ];

  if (log.description) {
    lines.push("\\subsection{题目描述}", renderProse(log.description), "");
  }
  if (log.takeaway) {
    lines.push("\\subsection{题解}", renderProse(log.takeaway), "");
  }
  if (log.code) {
    lines.push("\\subsection{代码}", listingBlock(log.code, "cpp"), "");
  }
  return lines.join("\n");
}

function latexPreamble(title, { toc = false } = {}) {
  const safeTitle = escapeLatexText(String(title ?? "").replace(/\s+/g, " ").trim());
  return `% !TEX program = xelatex
% 本文件由「算法训练日志」导出。推荐用 XeLaTeX 编译；
% 代码块里的中文注释依赖下面的 extendedchars=false，请勿删除。
\\documentclass[12pt,a4paper]{ctexart}
\\usepackage[top=2cm,bottom=2cm,left=2.5cm,right=2.5cm]{geometry}
\\usepackage{array}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{listings}
\\usepackage{xcolor}
\\usepackage{hyperref}
\\hypersetup{colorlinks=true,linkcolor=blue,urlcolor=blue}
\\setlength{\\tabcolsep}{4pt}
\\lstset{
  basicstyle=\\ttfamily\\small,
  breaklines=true,
  breakatwhitespace=false,
  columns=fixed,
  keepspaces=true,
  extendedchars=false,
  showstringspaces=false,
  frame=single,
  numbers=left,
  numberstyle=\\tiny,
  backgroundcolor=\\color{gray!5},
  keywordstyle=\\color{blue},
  commentstyle=\\color{green!40!black},
  stringstyle=\\color{red}
}
\\title{${safeTitle}}
\\date{\\today}
\\begin{document}
\\maketitle
${toc ? "\\tableofcontents\n\\newpage\n" : ""}`;
}

function latexPostamble() {
  return "\\end{document}\n";
}

export function buildSingleLatexDocument(log) {
  return latexPreamble(log?.problem || "题目") + buildLatexContent(log) + "\n" + latexPostamble();
}

export function buildBatchLatexDocument(logs) {
  const list = Array.isArray(logs) ? logs : [];
  const body = list.map((log) => buildLatexContent(log)).join("\n\n");
  return latexPreamble(`训练记录 · ${list.length} 题`, { toc: list.length > 1 }) + body + "\n" + latexPostamble();
}

/* ------------------------------------------------------------------ *
 * 文件名 / 打印
 * ------------------------------------------------------------------ */

export function safeFilename(log) {
  const problem = String(log?.problem || "problem").replace(/[\\/:*?"<>|\r\n\t]/g, "_").trim();
  return `${log?.member || "unknown"}-${log?.date || "unknown"}-${problem.slice(0, 60) || "problem"}`;
}

export const PRINT_CSS = `
  body { font-family: "Microsoft YaHei", "Segoe UI", sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1f2a37; line-height: 1.7; }
  h1 { border-bottom: 2px solid #16a34a; padding-bottom: 8px; }
  h2 { margin-top: 28px; color: #16a34a; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #e4e8ef; padding: 8px 12px; text-align: left; }
  th { background: #f0fdf4; }
  pre { box-sizing: border-box; max-width: 100%; background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 6px; font-size: 0.8rem; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
  code { font-family: "Cascadia Code", "Fira Code", "Consolas", monospace; }
  .katex-display { overflow-x: auto; overflow-y: hidden; }
  .page-break { page-break-before: always; }
  @media print {
    body { margin: 0; padding: 20px; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    pre, pre[class*="language-"] { overflow: visible !important; max-height: none !important; max-width: 100% !important; white-space: pre-wrap !important; overflow-wrap: anywhere !important; }
    code, code[class*="language-"] { white-space: pre-wrap !important; overflow-wrap: anywhere !important; }
  }
`;

export function mdToPrintableHTML(md, title, renderMarkdown) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8" /><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head>
<body>${renderMarkdown(md)}</body></html>`;
}
