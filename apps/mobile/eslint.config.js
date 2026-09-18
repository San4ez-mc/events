// @ts-check
const reactNativeConfig = require("@kiro/eslint-config/react-native.js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(...reactNativeConfig, {
  languageOptions: {
    parserOptions: {
      project: "./tsconfig.json",
      tsconfigRootDir: __dirname,
    },
  },
  ignores: [".expo/**", "android/**", "ios/**"],
});
