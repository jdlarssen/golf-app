# Kontrakt: #844 — prevent SupabaseClient<any> recurrence + align team_number nullability

**Issue:** [#844](https://github.com/jdlarssen/golf-app/issues/844)
**Branch:** `issue-844-supabase-client-lint-guard`
**Type:** refactor (ingen bruker-synlig oppførsel → ingen version-bump, `refactor(...)`-prefiks)
**Eier-beslutning:** kjør autonomt (forge:auto, 2026-06-22).

## Bakgrunn

To non-blocking follow-ups fra den adversarielle reviewen av #838 (typed-client-leak):

1. **Forebygg leak-klassen.** #838 lukket leaken ved å type hver helper-param `SupabaseClient<Database>`. Leaken hadde to former: bar `SupabaseClient` OG `SupabaseClient<any>` (med `eslint-disable no-explicit-any`). `<any>`-formen var usynlig for discovery-grep-en. Konverter hele klassen til en lint-feil.
2. **team_number-nullability.** `lib/scoring/buildModeResultForGame.ts:43` deklarerer `team_number: number`, men kolonnen er `number | null` i `database.types.ts` og live prod. `.returns<GamePlayerRow[]>()`-casten maskerer mismatchen. Runtime er allerede trygt via `?? 0` (linje 134/273).

## Rekon (verifisert 2026-06-22)

- Treet er rent post-#838: alle annoterings-bruk er `SupabaseClient<Database>`; **0** treff på `SupabaseClient<any>` noe sted (inkl. test).
- De 8 `import type { SupabaseClient }`-linjene er legitime (man importerer generic-en og bruker `<Database>` på bruk-stedet). Regelen MÅ treffe `TSTypeReference`, ikke `ImportSpecifier`.
- `GamePlayerRow` er en lokal, ikke-eksportert interface i `buildModeResultForGame.ts`; eneste konsumenter er linje 134 + 273, begge `?? 0`.

## Design

### 1. ESLint flat-config-regel (`eslint.config.mjs`)
Legg til en config-blokk scoped til `lib/**` + `app/**` (`.ts`/`.tsx`), med `ignores` for `**/*.test.*` + `**/__tests__/**`, som bruker `no-restricted-syntax`:
- **Bar `SupabaseClient`:** `TSTypeReference[typeName.name="SupabaseClient"]:not(:has(> TSTypeParameterInstantiation))` → melding: bruk `SupabaseClient<Database>`.
- **`SupabaseClient<any>`:** `TSTypeReference[typeName.name="SupabaseClient"]:has(> TSTypeParameterInstantiation > TSAnyKeyword)` → melding: bruk `SupabaseClient<Database>`, ikke `<any>`.

Node-type-selektoren `TSTypeParameterInstantiation` er versjon-stabil (matcher node-type, ikke `typeArguments`/`typeParameters`-property-navnet).

### 2. team_number-fiks (`lib/scoring/buildModeResultForGame.ts`)
`team_number: number` → `team_number: number | null`. `?? 0` håndterer null allerede.

## Suksesskriterier

- [x] **K1.** `eslint.config.mjs` har en `no-restricted-syntax`-regel som banner bar `SupabaseClient` og `SupabaseClient<any>` i `lib/`+`app/` (ikke i `*.test.*`). *Evidens: `eslint.config.mjs` ny config-blokk med `files: lib/**+app/**`, `ignores: **/*.test.* + __tests__`, to selektorer.*
- [x] **K2.** Regelen FANGER faktisk begge formene. *Evidens: scratch med `SupabaseClient` (linje 2) + `SupabaseClient<any>` (linje 4) → `✖ 2 problems (2 errors)`, ett per form, fil slettet.*
- [x] **K3.** Regelen treffer IKKE `import type`-linjene eller eksisterende `<Database>`-bruk. *Evidens: `npm run lint` → 0 errors (kun 1 pre-eksisterende, urelatert `no-unused-vars`-warning i drilldown.tsx).*
- [x] **K4.** `GamePlayerRow.team_number` er `number | null`. *Evidens: buildModeResultForGame.ts:45; ny `NormalizedPlayerRow` for post-`?? 0`-grensen (tsc avslørte at den maskerte casten lekket til buildStablefordContext linje 164 — nå type-ærlig).*
- [x] **K5.** Alle gates grønne. *Evidens: `tsc --noEmit` exit 0; `vitest run lib/scoring` 977/977 passed; `npm run lint` 0 errors.*

## Gates

- `npx tsc --noEmit` — grønt.
- `npm run lint` — grønt på hele treet (regelen flagger ingenting eksisterende).
- `npx vitest run lib/scoring/buildModeResultForGame` (+ co-located om finnes) — grønt.

## Ikke i scope
- Ingen endring av `database.types.ts` (#488 sporer drift separat).
- Ingen runtime-oppførsel-endring; `?? 0`-defusingen beholdes.
