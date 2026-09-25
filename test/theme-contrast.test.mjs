import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const darkBlock = /\[data-theme="dark"\]\s*\{([^}]+)\}/.exec(css)?.[1] || "";
const variables = Object.fromEntries([...darkBlock.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1], match[2]]));
const darkSubmissionBlock = /\[data-theme="dark"\]\s+\.submission-page\s*\{([^}]+)\}/.exec(css)?.[1] || "";
const submissionVariables = Object.fromEntries([...darkSubmissionBlock.matchAll(/--submission-([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1], match[2]]));

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const values = [luminance(variables[foreground]), luminance(variables[background])].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function submissionContrast(foreground, background) {
  const values = [luminance(submissionVariables[foreground]), luminance(submissionVariables[background])].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("dark theme keeps text, controls and actions at accessible contrast", () => {
  assert.ok(contrast("text", "card") >= 7, "primary text should meet enhanced contrast");
  assert.ok(contrast("muted", "card") >= 4.5, "secondary text should remain readable");
  assert.ok(contrast("brand", "card") >= 4.5, "brand text should remain readable");
  assert.ok(contrast("link", "card") >= 4.5, "links should remain readable");
  assert.ok(contrast("brand-contrast", "brand-solid") >= 4.5, "primary button label should remain readable");
  assert.ok(contrast("line-strong", "input") >= 3, "input borders should remain distinguishable");
  assert.doesNotMatch(css, /\[data-theme="dark"\]\s+\.btn\s*\{/, "dark mode must not override every button variant");
});

test("submission page dark surfaces never pair light backgrounds with light text", () => {
  assert.ok(submissionContrast("ink", "control") >= 7, "form text should remain readable");
  assert.ok(submissionContrast("muted", "paper") >= 4.5, "secondary copy should remain readable");
  assert.ok(submissionContrast("green", "paper") >= 4.5, "accent labels should remain readable");
  assert.ok(submissionContrast("green-deep", "paper") >= 4.5, "section headings should remain readable");
  assert.ok(submissionContrast("line", "control") >= 3, "control borders should remain distinguishable");
  assert.ok(contrastHex("#ffffff", submissionVariables["green-solid"]) >= 4.5, "number badges should keep readable white labels");
  assert.match(css, /\.submission-page\s+\.import-panel\s*\{[^}]*background:\s*var\(--submission-control\)/s);
  assert.doesNotMatch(css, /\.submission-page[^\{]*\{[^}]*background:\s*#fff(?:fff)?\b/gs, "submission surfaces must use theme-aware variables");
});

function contrastHex(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
