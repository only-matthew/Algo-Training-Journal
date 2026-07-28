import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, renderMarkdown } from "../lib/render-safety.mjs";

test("HTML 特殊字符会被转义", () => {
  assert.equal(escapeHtml(`<img src="x" onerror='alert(1)'>`), "&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;");
});

test("LaTeX 公式不能注入 HTML", () => {
  const inline = renderMarkdown(`$<img src=x onerror=alert(1)>$`);
  const display = renderMarkdown(`$$<svg onload=alert(1)>$$`);
  assert.equal(inline, "$&lt;img src=x onerror=alert(1)&gt;$");
  assert.equal(display, "$$&lt;svg onload=alert(1)&gt;$$");
  assert.doesNotMatch(inline + display, /<(?:img|svg)\b/i);
});

test("Markdown 代码和标题保持渲染且内容安全", () => {
  assert.equal(renderMarkdown("# <img>"), "<h1>&lt;img&gt;</h1>");
  assert.match(renderMarkdown("```cpp\nif (a < b) return;\n```"), /if \(a &lt; b\) return;/);
});
