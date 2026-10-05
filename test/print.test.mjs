import test from "node:test";
import assert from "node:assert/strict";
import { printMarkdownDocument } from "../lib/print.mjs";
import { exportToPDF as lazyExportToPDF } from "../lib/lazy-export-actions.mjs";

function setup(context, blocked = false) {
  const events = [], assets = [], alerts = [];
  const popup = {
    closed: false,
    close() { this.closed = true; events.push("close"); },
    print() { events.push("print"); },
    document: {
      body: { textContent: "" },
      open() { events.push("document-open"); },
      write(html) { events.push(html); },
      close() {},
      createElement(tag) { return { tag }; },
      head: { appendChild(asset) { assets.push(asset); } },
    },
  };
  for (const [name, value] of Object.entries({
    window: { open() { events.push("popup"); return blocked ? null : popup; }, location: { origin: "https://train.xialiao.org" } },
    alert: (message) => alerts.push(message),
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    context.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
  return { popup, events, assets, alerts };
}

test("PDF reserves the popup before async work and preserves safe Markdown", async (context) => {
  const { events, assets, alerts } = setup(context);
  const pending = printMarkdownDocument(async (render) => {
    events.push("render");
    return render("# <img src=x onerror=alert(1)>");
  });
  assert.deepEqual(events, ["popup"]);
  await pending;
  assert.equal(events[1], "render");
  assert.ok(events.some((event) => event.includes("&lt;img")));
  const script = assets.find((asset) => asset.tag === "script");
  assert.ok(script.src.startsWith("https://train.xialiao.org/vendor/prism/"));
  script.onerror();
  assert.equal(events.at(-1), "print", "code highlighting failure must not block printing");
  assert.deepEqual(alerts, []);
});

test("lazy PDF export reserves one popup before importing converters or fetching details", async (context) => {
  const { events } = setup(context);
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { querySelector: () => null } });
  context.after(() => originalDocument ? Object.defineProperty(globalThis, "document", originalDocument) : delete globalThis.document);
  const pending = lazyExportToPDF(() => {
    events.push("fetch");
    return { problem: "Test", description: "Safe Markdown" };
  });
  assert.deepEqual(events, ["popup"]);
  await pending;
  assert.equal(events.filter((event) => event === "popup").length, 1);
  assert.ok(events.indexOf("fetch") > events.indexOf("popup"));
  assert.ok(events.includes("document-open"));
});

test("blocked popup skips document generation", async (context) => {
  const { events } = setup(context, true);
  await printMarkdownDocument(() => { throw new Error("must not generate"); });
  assert.deepEqual(events, ["popup"]);
});

test("multiline display math still loads when code highlighting fails", async (context) => {
  const { events, assets } = setup(context);
  await printMarkdownDocument(() => '<p>$$\nx^2\n$$</p>');
  assets.find(asset => asset.tag === 'script').onerror();
  assert.ok(assets.some(asset => asset.src?.endsWith('/katex/katex.min.js')));
  assert.equal(events.includes('print'), false, 'wait for math instead of printing raw delimiters');
});

test("cancelled or failed PDF generation closes its reserved popup", async (context) => {
  const { popup, events, alerts } = setup(context);
  await printMarkdownDocument(() => "");
  assert.equal(popup.closed, true);
  popup.closed = false;
  await printMarkdownDocument(() => { throw new Error("test failure"); });
  assert.equal(popup.closed, true);
  assert.equal(events.includes("document-open"), false);
  assert.match(alerts[0], /test failure/);
});

test("closing the reserved popup during loading skips later rendering", async (context) => {
  const { popup, events } = setup(context);
  const pending = printMarkdownDocument(() => { throw new Error("must not generate"); });
  popup.close();
  await pending;
  assert.deepEqual(events, ["popup", "close"]);
});

test("direct-page PDF export opens its window before fetching uncached details", async (context) => {
  const { events } = setup(context);
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => null } });
  context.after(() => originalDocument ? Object.defineProperty(globalThis, 'document', originalDocument) : delete globalThis.document);
  const { exportToPDF } = await import('../lib/export-actions.mjs');
  let finish;
  const detail = new Promise(resolve => { finish = resolve; });
  const pending = exportToPDF(() => { events.push('fetch'); return detail; });
  assert.equal(events[0], 'popup');
  finish({ problem: '异步题目', description: '$x^2$' });
  await pending;
  assert.ok(events.indexOf('fetch') > events.indexOf('popup'));
  assert.ok(events.some(event => event.includes('异步题目')));
});
