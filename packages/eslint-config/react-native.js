// @ts-check
const base = require("./base");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(...base, {
  rules: {
    "@typescript-eslint/no-require-imports": "off",
  },
});
