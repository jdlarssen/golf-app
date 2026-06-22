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
    // Nested git worktrees (other sessions) hold full repo copies. The parent
    // checkout's lint must not descend into them — CI checks out clean and
    // never sees them; locally they'd otherwise be linted as foreign source.
    ".claude/worktrees/**",
    ".claire/worktrees/**",
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
  {
    // #844: ban untyped Supabase clients in production code. #838 closed the
    // typed-client leak by annotating every helper param `SupabaseClient<Database>`,
    // but the leak had two forms — bare `SupabaseClient` AND `SupabaseClient<any>`
    // (the latter hidden behind an eslint-disable, invisible to the discovery grep
    // and nearly shipping a half-closed fix). Converting both forms into a lint
    // failure stops a future helper from reintroducing the class. Selectors match
    // type *references*, not the `import type { SupabaseClient }` lines (those are
    // ImportSpecifier nodes and are correct — you import the generic and apply
    // `<Database>` at the use site). `TSTypeParameterInstantiation` is matched by
    // node type, so the rule is stable across typescript-eslint versions.
    files: ["lib/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/__tests__/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'TSTypeReference[typeName.name="SupabaseClient"]:not(:has(> TSTypeParameterInstantiation))',
          message:
            "Bruk SupabaseClient<Database> (typed), aldri bar SupabaseClient — den lekker `any` gjennom hele query-kjeden (#838/#844).",
        },
        {
          // Flat child-combinator chain, NOT `:has(> A > B)` — esquery silently
          // returns nothing for a nested `>` inside `:has` (verified #844).
          // Matches `any` only as a direct type argument, so it can't over-match
          // a nested `SupabaseClient<Foo<any>>`.
          selector:
            'TSTypeReference[typeName.name="SupabaseClient"] > TSTypeParameterInstantiation > TSAnyKeyword',
          message:
            "Bruk SupabaseClient<Database>, ikke SupabaseClient<any> — `any` opphever PostgREST-typingen og er en kjent leak-form (#838/#844).",
        },
      ],
    },
  },
]);

export default eslintConfig;
