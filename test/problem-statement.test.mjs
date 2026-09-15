import test from "node:test";
import assert from "node:assert/strict";
import { fetchCodeforcesStatement, parseCodeforcesStatement, validateCodeforcesUrl } from "../workers/services/problem-statement.mjs";

const HTML = `<div class="problem-statement"><div class="header"><div class="title">A. Test</div><div class="time-limit">1 second</div><div class="memory-limit">256 megabytes</div></div><p>Find $$$x$$$.</p><div class="input-specification"><p>Input</p></div><div class="output-specification"><p>Output</p></div><img src="/img.png"></div>`;

test("CF 地址限制域名和题号", () => {
  assert.equal(validateCodeforcesUrl("", "4A").hostname, "codeforces.com");
  assert.throws(() => validateCodeforcesUrl("https://evil.example/4/A", "4A"));
  assert.throws(() => validateCodeforcesUrl("https://codeforces.com/contest/5/problem/A", "4A"));
});

test("题面解析保留标题、公式并报告外部图片", () => {
  const result = parseCodeforcesStatement(HTML);
  assert.match(result.description, /# A\. Test/);
  assert.match(result.description, /\$x\$/);
  assert.deepEqual(result.warnings, ["external-images"]);
});

test("题面保留多个样例、代码空白与上下标", () => {
  const html = `<div class="problem-statement"><div class="header"><div class="title">B. Sample</div><div class="time-limit">1 second</div><div class="memory-limit">256 megabytes</div></div><p>a<sup>2</sup> + b<sub>i</sub></p><div class="sample-tests"><div class="input"><div class="title">Input</div><pre>1\n  2</pre></div><div class="output"><div class="title">Output</div><pre>3</pre></div><div class="input"><div class="title">Input</div><div class="test-example-line">x</div><div class="test-example-line"> y</div></div></div></div>`;
  const result = parseCodeforcesStatement(html).description;
  assert.match(result, /a\^\(2\) \+ b_\(i\)/);
  assert.match(result, /```\n1\n  2\n```/);
  assert.match(result, /x\n y/);
});

test("上游失败是可恢复的单题降级", async () => {
  const result = await fetchCodeforcesStatement({ problemNumber: "4A" }, { fetchImpl: async () => new Response("", { status: 404 }) });
  assert.deepEqual(result, { status: "unavailable", problemNumber: "4A", reason: "not-found", retryable: false });
});
