import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, renderMarkdown } from "../lib/render-safety.mjs";

test("backslash delimiters preserve formulas before Markdown handles escapes", () => {
  assert.equal(renderMarkdown(String.raw`行内 \(a_b < c\) 公式`), String.raw`<p>行内 \(a_b &lt; c\) 公式</p>`);
  assert.equal(renderMarkdown(String.raw`\[
\begin{aligned}
a_b &= c \\
d &= e
\end{aligned}
\]`), String.raw`\[\begin{aligned}
a_b &amp;= c \\
d &amp;= e
\end{aligned}\]`);
  assert.equal(renderMarkdown(String.raw`前面 \[a_b\] 后面`), String.raw`<p>前面 \[a_b\] 后面</p>`);
  assert.doesNotMatch(renderMarkdown(String.raw`\(<img src=x onerror=alert(1)>\)`), /<img/);
});

test("math delimiters inside code remain literal", () => {
  assert.equal(renderMarkdown('`' + String.raw`\(a_b\)` + '`'), String.raw`<p><code>\(a_b\)</code></p>`);
  assert.match(renderMarkdown('```text\n' + String.raw`\[a_b\]` + '\n```'), /<code[^>]*>\\\[a_b\\\]/);
});

test("协议相对链接与图片被丢弃，显式 HTTPS 外链与站内路径仍可用", () => {
  assert.equal(renderMarkdown('[x](//evil.example/path "title")'), "<p>x</p>");
  assert.equal(renderMarkdown('![x](//evil.example/path "title")'), "<p>x</p>");
  assert.equal(renderMarkdown('# [x](//evil.example/path)'), "<h1>x</h1>");
  assert.match(renderMarkdown('[x](https://example.com/path)'), /href="https:\/\/example.com\/path"/);
  assert.match(renderMarkdown('[x](/problem/1/)'), /href="\/problem\/1\/"/);
});

test("HTML 特殊字符会被转义", () => {
  assert.equal(escapeHtml(`<img src="x" onerror='alert(1)'>`), "&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;");
});

test("LaTeX 公式不能注入 HTML", () => {
  const inline = renderMarkdown(`$<img src=x onerror=alert(1)>$`);
  const display = renderMarkdown(`$$<svg onload=alert(1)>$$`);
  assert.equal(inline, "<p>$&lt;img src=x onerror=alert(1)&gt;$</p>");
  assert.equal(display, "$$&lt;svg onload=alert(1)&gt;$$");
  assert.doesNotMatch(inline + display, /<(?:img|svg)\b/i);
});

test("Markdown 代码和标题保持渲染且内容安全", () => {
  assert.equal(renderMarkdown("# <img>"), "<h1>&lt;img&gt;</h1>");
  assert.match(renderMarkdown("```cpp\nif (a < b) return;\n```"), /if \(a &lt; b\) return;/);
});

test("GFM 表格和常用 Markdown 可以渲染", () => {
  const html = renderMarkdown("| 复杂度 | 条件 |\n| --- | --- |\n| **O(n)** | $a < b$ |");
  assert.match(html, /<table>/);
  assert.match(html, /<strong>O\(n\)<\/strong>/);
  assert.match(html, /\$a &lt; b\$/);
});

test("普通比较符和原始 HTML 不会破坏页面或注入脚本", () => {
  const html = renderMarkdown("当 a < b 且 b > 0 时。\n\n<script>alert(1)</script>");
  assert.match(html, /a &lt; b/);
  assert.match(html, /b &gt; 0/);
  assert.doesNotMatch(html, /<script>/);
});

test("危险链接协议不会进入 href", () => {
  const html = renderMarkdown("[危险链接](javascript:alert(1))");
  assert.equal(html, "<p>危险链接</p>");
  assert.doesNotMatch(html, /javascript:/i);
});

test("归档题面图片的相对与站点内地址都能渲染成图片", () => {
  const fileName = `statement-${"a".repeat(64)}.png`;
  // 仓库里的 desc.md 用显式相对路径（GitHub 与站内渲染器都认），站点数据里换成同源绝对地址。
  assert.match(renderMarkdown(`![示意图](./${fileName})`), new RegExp(`<img src="\\./${fileName}" alt="示意图">`));
  assert.match(renderMarkdown(`![示意图](/problem/%E5%BB%96%E5%A4%8F/2026-09-16/p1/${fileName})`), /<img src="\/problem\//);
  // 危险协议的图片不产生 img（退化成 alt 文本）。
  assert.doesNotMatch(renderMarkdown("![x](javascript:alert(1))"), /<img/);
});
