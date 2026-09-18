// @ts-check
const nestConfig = require("@kiro/eslint-config/nestjs.js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(...nestConfig, {
  languageOptions: {
    parserOptions: {
      project: "./tsconfig.json",
      tsconfigRootDir: __dirname,
    },
  },
});
