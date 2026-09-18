import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { archiveStatementImages, fetchCodeforcesStatement, fetchLuoguStatement, fetchStatement, parseCodeforcesStatement, parseLuoguStatement, validateCodeforcesUrl } from "../workers/services/problem-statement.mjs";

const HTML = `<div class="problem-statement"><div class="header"><div class="title">A. Test</div><div class="time-limit">1 second</div><div class="memory-limit">256 megabytes</div></div><p>Find $$$x$$$.</p><div class="input-specification"><p>Input</p></div><div class="output-specification"><p>Output</p></div><img src="/img.png"></div>`;
const CHALLENGE = `<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>cloudflare challenge</body></html>`;
const LUOGU_URL = "https://www.luogu.com.cn/problem/CF4A";
// 一个字节够用的合法 PNG：归档只看魔数，不需要真的能解码。
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const LUOGU_PROBLEM = {
  pid: "CF4A",
  name: "Watermelon",
  difficulty: 1,
  content: {
    name: "Watermelon",
    background: "",
    description: "<p>给定 $w$，判断能否分成两个正偶数。</p>",
    formatI: "<p>一个整数 $w$（$1 \\le w \\le 100$）。</p>",
    formatO: "<p>输出 YES 或 NO。</p>",
    hint: "<p>注意 $w=2$ 时无解。</p>",
  },
};
// 洛谷页面把内嵌 JSON 里的 "</" 转义成 "<\/"（否则正文里的标签会提前结束 script），这里照做。
const luoguPage = (problem) => `<html><head><title>CF4A Watermelon - 洛谷</title></head><body><script id="lentille-context" type="application/json">${JSON.stringify({ data: { problem } }).replace(/<\//g, "<\\/")}</script></body></html>`;

// url 路由替身：按顺序匹配 URL，记录每次请求，未命中的 URL 直接失败。
function routedFetch(routes) {
  const calls = [];
  const impl = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, headers: options.headers || {} });
    for (const [pattern, handler] of routes) if (pattern.test(target)) return handler(target, options);
    throw new Error(`unexpected request: ${target}`);
  };
  impl.calls = calls;
  return impl;
}
const BLOCKED = [/^https:\/\/codeforces\.com\//, () => new Response(CHALLENGE, { status: 403 })];
const MIRROR_OK = [new RegExp(`^${LUOGU_URL}$`), () => new Response(luoguPage(LUOGU_PROBLEM))];

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

test("时间/内存限制不把 property-title 标签拼进正文", () => {
  const html = `<div class="problem-statement"><div class="header"><div class="title">A. Watermelon</div><div class="time-limit"><div class="property-title">time limit per test</div>1 second</div><div class="memory-limit"><div class="property-title">memory limit per test</div>64 megabytes</div><div class="input-file input-standard"><div class="property-title">input</div>stdin</div></div><p>One hot summer day.</p></div>`;
  const description = parseCodeforcesStatement(html, "4A").description;
  assert.match(description, /时间限制：1 second/);
  assert.match(description, /内存限制：64 megabytes/);
  assert.doesNotMatch(description, /time limit per test|memory limit per test/);
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

test("CF 请求带浏览器请求头，不再只发 Accept", async () => {
  const fetchImpl = routedFetch([[/^https:\/\/codeforces\.com\//, () => new Response(HTML)]]);
  await fetchCodeforcesStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.match(fetchImpl.calls[0].headers["User-Agent"], /Mozilla\/5\.0/);
  assert.match(fetchImpl.calls[0].headers["Accept-Language"], /en-US/);
});

test("洛谷镜像题面按小节转成 Markdown，保留公式并跳过空小节", () => {
  const result = parseLuoguStatement(luoguPage(LUOGU_PROBLEM), "4A");
  assert.match(result.description, /^# Watermelon/);
  assert.match(result.description, /## 题目描述/);
  assert.match(result.description, /## 输入格式/);
  assert.match(result.description, /## 输出格式/);
  assert.match(result.description, /## 说明\/提示/);
  assert.doesNotMatch(result.description, /## 背景/);
  assert.match(result.description, /\$w\$/);
});

test("洛谷镜像接受字符串题面，并在正文没有代码块时补上 samples", () => {
  const problem = { pid: "CF4A", name: "Watermelon", content: "<p>正文没有样例</p>", samples: [{ in: "8", out: "YES" }, { input: "2", output: "NO" }] };
  const result = parseLuoguStatement(luoguPage(problem), "4A");
  assert.match(result.description, /### 样例 1\n输入：\n```\n8\n```/);
  assert.match(result.description, /### 样例 2\n输入：\n```\n2\n```/);
  const withPre = parseLuoguStatement(luoguPage({ ...problem, content: "<p>样例在正文里</p><pre>8</pre>" }), "4A");
  assert.doesNotMatch(withPre.description, /### 样例 1/);
});

test("洛谷镜像解析图片、表格与脚本", () => {
  const problem = { pid: "CF4A", name: "Watermelon", content: { description: '<p>图：<img src="/upload/w.png" alt="w"></p><table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table><script>alert(1)</script>' } };
  const result = parseLuoguStatement(luoguPage(problem), "4A");
  assert.match(result.description, /!\[w\]\(https:\/\/www\.luogu\.com\.cn\/upload\/w\.png\)/);
  assert.match(result.description, /\| a \| b \|\n\| --- \| --- \|\n\| 1 \| 2 \|/);
  assert.deepEqual(result.warnings, ["external-images"]);
  assert.doesNotMatch(result.description, /alert/);
});

test("洛谷镜像拒绝题号不符与挑战页", () => {
  assert.throws(() => parseLuoguStatement(luoguPage({ ...LUOGU_PROBLEM, pid: "CF5A" }), "4A"), /parse-failed/);
  assert.throws(() => parseLuoguStatement(CHALLENGE, "4A"), /blocked/);
});

test("洛谷镜像处理 C3VK 挑战 cookie 后重试", async () => {
  let luoguCalls = 0;
  const fetchImpl = routedFetch([
    [/^https:\/\/codeforces\.com\//, () => new Response(CHALLENGE, { status: 403 })],
    [new RegExp(`^${LUOGU_URL}$`), (_url, options) => {
      luoguCalls += 1;
      if (luoguCalls === 1) return new Response("", { status: 302, headers: { Location: "/problem/CF4A", "Set-Cookie": "C3VK=abc123; Path=/; Max-Age=3600" } });
      assert.equal(options.headers.Cookie, "C3VK=abc123");
      return new Response(luoguPage(LUOGU_PROBLEM));
    }],
  ]);
  const result = await fetchLuoguStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.equal(result.status, "ok");
  assert.equal(result.source.kind, "luogu-mirror");
  assert.equal(result.source.url, LUOGU_URL);
  assert.deepEqual(result.warnings, ["mirror-source"]);
  assert.equal(luoguCalls, 2);
});

test("CF 成功时不访问镜像", async () => {
  const fetchImpl = routedFetch([
    [/^https:\/\/codeforces\.com\/problemset\//, () => new Response(HTML)],
    [/^https:\/\/codeforces\.com\/img\.png$/, () => new Response(PNG, { headers: { "Content-Type": "image/png" } })],
  ]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.equal(result.status, "ok");
  assert.equal(result.source.kind, "codeforces-html");
  assert.deepEqual(fetchImpl.calls.map((call) => call.url), ["https://codeforces.com/problemset/problem/4/A?locale=en", "https://codeforces.com/img.png"]);
});

test("题面图片随抓取下载并改写成仓库文件名", async () => {
  const fetchImpl = routedFetch([
    [/^https:\/\/codeforces\.com\/problemset\//, () => new Response(HTML)],
    [/^https:\/\/codeforces\.com\/img\.png$/, (_url, options) => {
      // 图床按来源站校验 referer，缺了会被当成盗链。
      assert.equal(options.headers.Referer, "https://codeforces.com/");
      assert.match(options.headers.Accept, /image\//);
      return new Response(PNG, { headers: { "Content-Type": "image/png" } });
    }],
  ]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  const fileName = `statement-${sha(PNG)}.png`;
  assert.equal(result.status, "ok");
  // 描述里不再有外链：站点 CSP 只允许 'self' 与 data:，外链图片在站内加载不出来。
  assert.match(result.description, new RegExp(`!\\[image\\]\\(\\./${fileName}\\)`));
  assert.doesNotMatch(result.description, /codeforces\.com\/img\.png/);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.images, [{ fileName, sha256: sha(PNG), mimeType: "image/png", bytes: PNG.byteLength, data: Buffer.from(PNG).toString("base64") }]);
});

test("洛谷镜像正文里的 Markdown 图片语法同样会被归档", async () => {
  const problem = {
    pid: "CF4A",
    name: "Watermelon",
    content: { description: '<p>看图：</p><p>![示意图](https://cdn.luogu.com.cn/upload/pic/2262.png)</p>' },
  };
  const fetchImpl = routedFetch([
    BLOCKED,
    [new RegExp(`^${LUOGU_URL}$`), () => new Response(luoguPage(problem))],
    [/^https:\/\/cdn\.luogu\.com\.cn\/upload\/pic\/2262\.png$/, (_url, options) => {
      assert.equal(options.headers.Referer, "https://www.luogu.com.cn/");
      // 新版图床返回 application/octet-stream，只能按魔数判断类型。
      return new Response(GIF, { headers: { "Content-Type": "application/octet-stream" } });
    }],
  ]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  const fileName = `statement-${sha(GIF)}.gif`;
  assert.equal(result.source.kind, "luogu-mirror");
  assert.match(result.description, new RegExp(`!\\[示意图\\]\\(\\./${fileName}\\)`));
  assert.doesNotMatch(result.description, /cdn\.luogu\.com\.cn/);
  assert.equal(result.images[0].fileName, fileName);
  assert.equal(result.images[0].mimeType, "image/gif");
  assert.deepEqual(result.warnings, ["mirror-source"]);
});

test("图片取不到时保留外链并留下警告，题面本身照常可用", async () => {
  const fetchImpl = routedFetch([
    [/^https:\/\/codeforces\.com\/problemset\//, () => new Response(HTML)],
    [/^https:\/\/codeforces\.com\/img\.png$/, () => new Response("", { status: 403 })],
  ]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.equal(result.status, "ok");
  assert.match(result.description, /!\[image\]\(https:\/\/codeforces\.com\/img\.png\)/);
  assert.deepEqual(result.images, []);
  assert.deepEqual(result.warnings, ["external-images"]);
});

test("内联 data: 图片直接解码归档，不再占用正文体积", async () => {
  const data = `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`;
  const archived = await archiveStatementImages("![公式]({{statement-image:0}})", [{ url: data }], { fetchImpl: async () => { throw new Error("内联图片不应发起网络请求"); } });
  assert.equal(archived.failed, false);
  assert.equal(archived.description, `![公式](./statement-${sha(PNG)}.png)`);
  assert.equal(archived.images[0].mimeType, "image/png");
});

test("不支持归档的图片（如 SVG）保持外链", async () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const result = await archiveStatementImages("![图]({{statement-image:0}})", [{ url: "https://cdn.example/x.svg" }], { fetchImpl: async () => new Response(svg, { headers: { "Content-Type": "image/svg+xml" } }) });
  assert.equal(result.failed, true);
  assert.deepEqual(result.images, []);
  assert.equal(result.description, "![图](https://cdn.example/x.svg)");
});

test("同一张图重复出现只下载一次", async () => {
  let downloads = 0;
  const fetchImpl = async () => { downloads += 1; return new Response(PNG); };
  const result = await archiveStatementImages("![a]({{statement-image:0}}) ![b]({{statement-image:0}})", [{ url: "https://cdn.example/a.png" }], { fetchImpl });
  assert.equal(downloads, 1);
  assert.equal(result.description, `![a](./statement-${sha(PNG)}.png) ![b](./statement-${sha(PNG)}.png)`);
  assert.equal(result.images.length, 1);
});

test("超过单张或总量上限的图片退回外链，不进入归档清单", async () => {
  const fetchImpl = async () => new Response(PNG);
  // 单张上限：图片会被保存接口拒绝，所以这里必须拦住，而不是让保存整次失败。
  const single = await archiveStatementImages("![a]({{statement-image:0}})", [{ url: "https://cdn.example/a.png" }], { fetchImpl, maxImageBytes: PNG.byteLength - 1 });
  assert.deepEqual(single.images, []);
  assert.equal(single.failed, true);
  assert.equal(single.description, "![a](https://cdn.example/a.png)");

  // 总量上限：先到先得，后面的图片退回外链（用不同字节，避免被当成同一张图去重）。
  const fetchImplMixed = async (url) => new Response(String(url).endsWith("b.png") ? GIF : PNG);
  const total = await archiveStatementImages("![a]({{statement-image:0}}) ![b]({{statement-image:1}})", [{ url: "https://cdn.example/a.png" }, { url: "https://cdn.example/b.png" }], { fetchImpl: fetchImplMixed, maxTotalBytes: PNG.byteLength });
  assert.equal(total.images.length, 1);
  assert.equal(total.failed, true);
  assert.equal(total.description, `![a](./statement-${sha(PNG)}.png) ![b](https://cdn.example/b.png)`);
});

test("图片数量超过上限时多余的图片保持外链", async () => {
  const fetchImpl = async () => new Response(PNG);
  const result = await archiveStatementImages("![a]({{statement-image:0}}) ![b]({{statement-image:1}})", [{ url: "https://cdn.example/a.png" }, { url: "https://cdn.example/b.png" }], { fetchImpl, maxImages: 1 });
  assert.equal(result.images.length, 1);
  assert.equal(result.failed, true);
  assert.match(result.description, /!\[b\]\(https:\/\/cdn\.example\/b\.png\)/);
});

test("CF 被反爬拦下时回退洛谷镜像", async () => {
  const fetchImpl = routedFetch([BLOCKED, MIRROR_OK]);
  const result = await fetchStatement({ problemNumber: "4a" }, { fetchImpl });
  assert.equal(result.status, "ok");
  assert.equal(result.problemNumber, "4A");
  assert.equal(result.source.kind, "luogu-mirror");
  assert.deepEqual(result.warnings, ["mirror-source"]);
  assert.match(result.description, /# Watermelon/);
  assert.deepEqual(fetchImpl.calls.map((call) => call.url), ["https://codeforces.com/problemset/problem/4/A?locale=en", LUOGU_URL]);
});

test("两个来源都失败时保留主来源的失败原因", async () => {
  const fetchImpl = routedFetch([BLOCKED, [new RegExp(`^${LUOGU_URL}$`), () => new Response(CHALLENGE, { status: 403 })]]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.deepEqual(result, { status: "unavailable", problemNumber: "4A", reason: "blocked", retryable: false });
  assert.equal(fetchImpl.calls.length, 2);
});

test("CF 明确没有这道题时不浪费时间试镜像", async () => {
  const fetchImpl = routedFetch([[/^https:\/\/codeforces\.com\//, () => new Response("", { status: 404 })]]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.equal(result.reason, "not-found");
  assert.equal(fetchImpl.calls.length, 1);
});

test("镜像返回解析失败不会覆盖主来源原因", async () => {
  const fetchImpl = routedFetch([BLOCKED, [new RegExp(`^${LUOGU_URL}$`), () => new Response("<html><body>没有题面</body></html>")]]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.equal(result.reason, "blocked");
});
