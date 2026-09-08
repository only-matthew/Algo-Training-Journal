import test from "node:test";
import assert from "node:assert/strict";
import { initPageNavigation } from "../lib/router.mjs";

test("legacy training route returns to the overview after the workbench is removed", (context) => {
  const events = {};
  const pages = ["overview-page", "roadmap-page"].map((id) => ({ id }));
  let journalLoads = 0;
  const fakeWindow = {
    location: { pathname: "/" }, scrollTo() {},
    addEventListener(name, callback) { events[name] = callback; },
    journalRouteRenderer() { journalLoads++; },
    history: { replaceState(_state, _title, path) { fakeWindow.location.pathname = path; } },
  };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  context.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else delete globalThis.document;
  });
  globalThis.window = fakeWindow;
  globalThis.document = {
    querySelectorAll(selector) { return selector === ".page-view" ? pages : []; },
    getElementById() { return null; }, addEventListener() {},
  };
  initPageNavigation();
  fakeWindow.journalRouteRenderer = () => { journalLoads++; };
  fakeWindow.location.pathname = "/training/";
  events.popstate();
  assert.equal(fakeWindow.location.pathname, "/");
  assert.equal(pages[0].hidden, false);
  fakeWindow.location.pathname = "/roadmap/";
  events.popstate();
  assert.equal(journalLoads, 3);
  assert.equal(pages[1].hidden, false);
});
