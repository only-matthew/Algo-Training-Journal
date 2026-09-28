import globals from "globals";

export default [{
  files: ["src/*.js", "lib/**/*.{js,mjs}", "scripts/**/*.{js,mjs}", "workers/**/*.{js,mjs}", "bot/**/*.{js,mjs}"],
  languageOptions: {
    sourceType: "module",
    globals: { ...globals.browser, ...globals.node, ...globals.serviceworker },
  },
  rules: {
    "no-undef": "error",
    "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
  },
}];
