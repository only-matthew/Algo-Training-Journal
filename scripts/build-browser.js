const path = require("node:path");
const fs = require("node:fs");
const { buildSync } = require("esbuild");

function buildBrowser(root, outdir) {
  const sourceDir = fs.existsSync(path.join(root, "src", "app.js")) ? "src" : ".";
  const appEntry = path.posix.join(sourceDir, "app.js");
  const problemPageEntry = path.posix.join(sourceDir, "problem-page.js");
  const hasProblemEntry = fs.existsSync(path.join(root, problemPageEntry));
  const { metafile } = buildSync({
    absWorkingDir: root,
    entryPoints: hasProblemEntry ? [appEntry, problemPageEntry] : [appEntry],
    outdir,
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    charset: "utf8",
    minify: true,
    legalComments: "eof",
    entryNames: "[name]-[hash]",
    chunkNames: "chunks/[name]-[hash]",
    metafile: true,
  });
  const outputs = metafile.outputs;
  const entry = Object.keys(outputs).find((name) => outputs[name].entryPoint === appEntry);
  const problemEntry = Object.keys(outputs).find((name) => outputs[name].entryPoint === problemPageEntry);
  if (!entry) throw new Error("Browser build did not emit the app entry point");
  if (hasProblemEntry && !problemEntry) throw new Error("Browser build did not emit the problem page entry point");

  // Only preload the static graph. Dynamic entries such as the form stay lazy.
  const preloads = new Set();
  const visit = (name) => {
    for (const dependency of outputs[name].imports) {
      if (dependency.external || dependency.kind !== "import-statement" || preloads.has(dependency.path)) continue;
      preloads.add(dependency.path);
      visit(dependency.path);
    }
  };
  visit(entry);
  const relative = (name) => path.relative(outdir, path.resolve(root, name)).split(path.sep).join("/");
  return {
    entry: relative(entry),
    problemEntry: problemEntry ? relative(problemEntry) : null,
    preloads: [...preloads].map(relative),
    version: path.basename(entry, ".js"),
    metafile,
  };
}

module.exports = { buildBrowser };
