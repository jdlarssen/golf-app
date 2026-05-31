# Evaluering: #322 — Setup-step-formater kan ikke redigeres via edit-flyten

**Verdikt:** ACCEPT
**Metode:** Fresh-context skeptisk sub-agent (sonnet), uavhengig verifisering + gates. Implementert av sonnet-implementer mot kontrakt.

## Funn per kriterium

- **Server/client-grense (Next.js 16):** `setupStepInitialValues.ts` har kun `import type { GameModeConfig }` fra server-safe `types.ts`. Ingen runtime-import fra 'use client'-modul. OK.
- **Shamble hard-fail løst:** `ShambleSetup` emitter `shamble_team_size`-radio bundet til `teamSize` → `parseShambleTeamSize` får ikke lenger null → ingen `unsupported_mode_size_combo`.
- **GameForm-render matcher GameWizard:** Prop-for-prop identisk for alle fem seksjoner (wolfOrder-mapping, shamble teamSize/onTeamSizeChange). Ingen mismatch.
- **Pre-fill:** Helper mapper alle fem (inkl. shamble team_size), `{}` for andre kinds. Shamble team_size settes både i ternær og spread (samme verdi — kosmetisk redundans, ikke bug).
- **Tester låser fiksen:** GameForm-render-testene asserterer seksjon vises + riktig radio checked (ville feilet pre-fix). Helper-test dekker 5 + ikke-setup-kind.

## Gates

- `npx vitest run` (setupStepInitialValues + GameForm + useGameFormState) → 65 passed
- `npm run build` → ✓ Compiled successfully, TypeScript clean, 51 ruter

## Out-of-scope

round_robin har samme edit-flow-bug (allowance silent reset) — egen issue.
