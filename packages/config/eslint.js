const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** @type {import('eslint').Linter.FlatConfig[]} */
const config = [
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];

module.exports = config;
