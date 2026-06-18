import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design-handoff prototypes — they're reference JSX inside design/ for
    // pattern-matching, not part of the app source. Linting them creates
    // noise (e.g. they assume a global `React`).
    "docs/design/**",
  ]),
  {
    // Underscore-prefixed identifiers are a deliberate "intentionally unused"
    // marker across the codebase (e.g. leaderboard-view props kept for
    // signature parity: `_gameId`, `_gameStatus`). Codify the convention so the
    // linter stops flagging them.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
