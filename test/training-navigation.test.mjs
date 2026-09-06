import test from "node:test";
import assert from "node:assert/strict";
import { initPageNavigation } from "../lib/router.mjs";

test("training navigation survives replacement of the journal renderer and returns to journal routes", (context) => {
  const events = {};
  const pages = ["overview-page", "training-page", "roadmap-page"].map((id) => ({ id }));
  let trainingLoads = 0;
  let journalLoads = 0;
  const fakeWindow = {
    location: { pathname: "/" }, scrollTo() {},
    addEventListener(name, callback) { events[name] = callback; },
    journalRouteRenderer() { journalLoads++; },
    trainingRouteRenderer() { trainingLoads++; },
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
  assert.equal(trainingLoads, 1);
  assert.equal(pages[1].hidden, false);
  assert.equal(pages[0].hidden, true);
  fakeWindow.location.pathname = "/roadmap/";
  events.popstate();
  assert.equal(journalLoads, 2);
  assert.equal(pages[2].hidden, false);
});
