import globals from "globals";

// 按运行时拆分 globals：旧配置把 browser/node/serviceworker 三套一次性注入所有目录，
// Worker 里写 document、浏览器里写 require 都不会报错。
// args: "none" 是刻意保留的：收紧到默认的 after-used 会新增 13 处报错，全部落在
// lib/export-actions.mjs、lib/form.mjs、lib/log-schema.mjs、lib/roadmap.mjs、
// scripts/generate-data.js —— 都不在本次改动的文件所有权内。等这些未用参数清理后
// 再收紧（实测命令：把 args 去掉即可复现）。
const rules = { "no-undef": "error", "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }] };

export default [{
  ignores: ["**/.build-cache/**", "site/**", "build/**", "node_modules/**"],
}, {
  // 浏览器 bundle 入口（src/app.js、src/problem-page.js）
  files: ["src/*.js"],
  languageOptions: { sourceType: "module", globals: { ...globals.browser } },
  rules,
}, {
  // Cloudflare Worker 只有 serviceworker 运行时：没有 DOM，也没有 process/Buffer
  files: ["workers/**/*.{js,mjs}"],
  languageOptions: { sourceType: "module", globals: { ...globals.serviceworker } },
  rules,
}, {
  // lib/ 被浏览器与 Node 脚本共用，两端 globals 都要保留
  files: ["lib/**/*.{js,mjs}"],
  languageOptions: { sourceType: "module", globals: { ...globals.browser, ...globals.node } },
  rules,
}, {
  // 构建/维护脚本、QQ bot、根目录配置文件：纯 Node
  files: ["scripts/**/*.{js,mjs}", "bot/**/*.{js,mjs}", "eslint.config.mjs", "playwright.config.mjs"],
  languageOptions: { sourceType: "module", globals: { ...globals.node } },
  rules,
}, {
  // Playwright 驱动脚本：主体是 Node，但 page.evaluate()/addInitScript() 的回调会被序列化
  // 后在页面里执行，因此这里的 DOM globals 是真实需要的。
  files: ["scripts/smoke-*.mjs", "e2e/**/*.{js,mjs}"],
  languageOptions: { sourceType: "module", globals: { ...globals.node, ...globals.browser } },
  rules,
}, {
  // node --test 单元测试：与生产代码同一套规则（测试代码不该有豁免）
  files: ["test/**/*.{js,mjs}"],
  languageOptions: { sourceType: "module", globals: { ...globals.node } },
  rules,
}];
