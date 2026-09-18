// @ts-check
const base = require("./base");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(...base, {
  rules: {
    // Nest heavily relies on decorators + DI; relax a few strict rules that
    // otherwise fight the framework's conventions.
    "@typescript-eslint/no-extraneous-class": "off",
    "@typescript-eslint/interface-name-prefix": "off",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
  },
});
