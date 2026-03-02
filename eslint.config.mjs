import { createRequire } from "module";
const require = createRequire(import.meta.url);

/** @type {import('eslint').Linter.Config[]} */
const nextConfig = require("eslint-config-next");

export default [
  ...nextConfig.map((c) => {
    // Inject our rules into the relevant config objects
    if (c.name === 'next' || c.name === 'next/typescript') {
      return {
        ...c,
        rules: {
          ...c.rules,
          "@typescript-eslint/no-explicit-any": "off",
          "@typescript-eslint/no-unused-vars": "warn",
        },
      };
    }
    return c;
  }),
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "*.js"],
  },
];
