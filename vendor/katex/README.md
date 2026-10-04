# KaTeX vendored assets

Version: **0.18.2**, pinned in the root `package.json` and `package-lock.json`.

Source: the official [KaTeX npm package](https://www.npmjs.com/package/katex/v/0.18.2), distributed under the bundled [MIT license](LICENSE).

After updating the pinned dependency, run `npm run sync:katex` to copy the renderer, matching auto-render extension, stylesheet, license and fonts. `test/vendor-katex.test.mjs` compares these files with the installed package so a dependency upgrade cannot leave the deployed assets behind. The files remain checked in for static hosting and offline use.

Security references: [macro expansion limits](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-cvr6-37gx-v8wc) and [inherited trust settings](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-238p-pmpm-9mq7). Both the problem renderer and print view explicitly disable trusted commands.
