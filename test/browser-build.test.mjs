import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const { buildBrowser } = createRequire(import.meta.url)("../scripts/build-browser.js");

test("homepage static graph excludes Markdown and problem bodies without removing them", (context) => {
  const { outdir } = fixture(context);
  const root = path.resolve(import.meta.dirname, "..");
  const result = buildBrowser(root, outdir);
  const initial = new Set([result.entry, ...result.preloads].map((name) => path.resolve(outdir, name)));
  const initialInputs = Object.entries(result.metafile.outputs)
    .filter(([name]) => initial.has(path.resolve(root, name)))
    .flatMap(([, output]) => Object.keys(output.inputs));
  assert.equal(initialInputs.some((name) => name.includes("vendor/marked/") || name === "lib/problem-detail.mjs"), false);
  assert.ok(Object.keys(result.metafile.inputs).some((name) => name.includes("vendor/marked/")), "Markdown must remain available to lazy consumers");
  assert.ok(Object.keys(result.metafile.inputs).includes("lib/problem-detail.mjs"));
});

function fixture(context) {
  const parent = path.resolve(tmpdir());
  const root = mkdtempSync(path.join(parent, "atj-browser-"));
  const outdir = path.join(root, "dist");
  mkdirSync(outdir);
  writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
  writeFileSync(path.join(root, "app.js"), 'export { state } from "./state.js"; export const loadEditor = () => import("./editor.js");');
  writeFileSync(path.join(root, "state.js"), 'export const state = { value: 1 }; export const unused = "unused-sentinel";');
  writeFileSync(path.join(root, "editor.js"), 'import { state } from "./state.js"; export const update = () => state.value++;');
  context.after(() => {
    assert.equal(path.dirname(path.resolve(root)), parent);
    assert.ok(path.basename(root).startsWith("atj-browser-"));
    rmSync(root, { recursive: true, force: true });
  });
  return { root, outdir };
}

test("browser chunks preserve shared state and keep dynamic imports out of preloads", async (context) => {
  const { root, outdir } = fixture(context);
  const result = buildBrowser(root, outdir);
  assert.match(result.entry, /^app-[A-Z0-9]+\.js$/);
  assert.ok(result.preloads.length > 0);
  assert.equal(result.preloads.some((name) => name.includes("editor-")), false);
  for (const filename of [result.entry, ...result.preloads]) {
    assert.doesNotMatch(readFileSync(path.join(outdir, filename), "utf8"), /unused-sentinel/);
  }
  const app = await import(pathToFileURL(path.join(outdir, result.entry)));
  assert.equal(app.state.value, 1);
  const editor = await app.loadEditor();
  editor.update();
  assert.equal(app.state.value, 2, "a lazy chunk must share the entry's state instance");
});

test("bundle URLs are stable for identical inputs and change with transitive dependencies", (context) => {
  const { root, outdir } = fixture(context);
  const first = buildBrowser(root, outdir);
  const repeated = buildBrowser(root, outdir);
  assert.equal(first.entry, repeated.entry);
  assert.deepEqual(first.preloads, repeated.preloads);
  writeFileSync(path.join(root, "state.js"), 'export const state = { value: 10 };');
  const changed = buildBrowser(root, outdir);
  assert.notEqual(first.entry, changed.entry);
  assert.notDeepEqual(first.preloads, changed.preloads);
  writeFileSync(path.join(root, "editor.js"), 'import { state } from "./state.js"; export const update = () => state.value += 2;');
  const lazyChanged = buildBrowser(root, outdir);
  assert.notEqual(changed.entry, lazyChanged.entry, "changes to lazy chunks must invalidate their importing entry");
});
