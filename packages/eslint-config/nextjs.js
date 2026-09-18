// @ts-check
const base = require("./base");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(...base, {
  rules: {
    // Next.js own eslint-config-next is applied separately in each app via
    // `next lint`; this file only adds our shared TS conventions on top.
  },
});
