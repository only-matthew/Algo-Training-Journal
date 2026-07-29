import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, renderMarkdown } from "../lib/render-safety.mjs";

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
