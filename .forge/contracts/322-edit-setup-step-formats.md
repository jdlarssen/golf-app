# Kontrakt: #322 — Setup-step-formater kan ikke redigeres via edit-flyten

**Issue:** https://github.com/jdlarssen/golf-app/issues/322
**Type:** bug (area:admin)
**Branch:** claude/beautiful-goldstine-ee8943

## Problem (verifisert via arkitektur-audit)

Å redigere et draft/scheduled spill med Wolf/Nassau/Skins/Nines/Shamble via
`app/admin/games/[id]/edit` mister config eller feiler hardt. To gap:

1. **Edit-siden pre-fyller ikke mode_config** inn i `initialValues` for disse fem
   formatene (`page.tsx` mapper bare texas/ambrose/florida/stableford-felt).
2. **`GameForm` rendrer ikke setup-seksjonene** (WolfSetup/NassauSetup/SkinsSetup/
   NinesSetup/ShambleSetup). De lever kun i `GameWizard` step 2. Uten dem fins
   ingen radios i edit-formen → form-feltene mangler i FormData.

Konsekvens: Wolf/Nassau/Skins/Nines silent-overskriver lagret config med defaults
(`net`/`nines`). **Shamble feiler hardt**: `shamble_team_size` mangler →
`parseShambleTeamSize` → `null` → `validateShamble` → `unsupported_mode_size_combo`.

`useGameFormState` leser allerede alle disse feltene fra `initialValues` med trygge
fallbacks (wolfScoring/nassauScoring/skinsScoring/ninesVariant/ninesScoring/
shambleVariant/shambleCount/shambleScoring + team_size). Hooken er klar; gapene er
(1) edit-siden og (2) GameForm-render.

## Tilnærming (besluttet — Option b)

1. **Ren mapping-helper** `buildSetupStepInitialValues(modeConfig)` (ny modul, f.eks.
   `app/admin/games/[id]/edit/setupStepInitialValues.ts` eller `lib/games/`):
   tar `GameModeConfig`, returnerer subset av `InitialValues` for de fem formatene
   (wolf_scoring, nassau_scoring, skins_scoring, nines_variant, nines_scoring,
   shamble_variant, shamble_count, shamble_scoring, + team_size for shamble).
   Ren funksjon → Type-A-testbar. Edit-siden spreader resultatet inn i `initialValues`.
2. **GameForm rendrer de fem setup-seksjonene** conditionally på `state.isWolf` osv.,
   speiler GameWizard step 2 (samme props fra `state`). Seksjonenes radios emitter
   form-feltene direkte → FormData får verdiene, og admin kan redigere dem.
   Behold `disabled={state.lockGameMode}` slik at mode-lock etter publish gjelder.

Round_robin (allowance via AllowanceField, ikke setup-seksjon) er IKKE i scope her
— samme bug-klasse, annet mekanisme. Verifiseres separat; egen issue hvis brutt.

## Suksesskriterier

- [x] `buildSetupStepInitialValues` ren funksjon i `lib/games/setupStepInitialValues.ts`, mapper alle fem formats (inkl. shamble team_size); andre kinds → `{}`. Type-only import (server-safe)
- [x] Edit-siden spreader `buildSetupStepInitialValues(game.mode_config)` inn i `initialValues` + shamble lagt til team_size-ternæren
- [x] `GameForm` rendrer alle fem setup-seksjoner conditionally på `state.is*` (speiler GameWizard step 2 prop-for-prop); `disabled={lockGameMode}`
- [x] Shamble draft lagres uten `unsupported_mode_size_combo` — ShambleSetup emitter `shamble_team_size`-radio → `parseShambleTeamSize` får ikke lenger null (verifisert av evaluator)
- [x] Wolf/Nassau/Skins/Nines beholder lagret config — useGameFormState leser pre-fylt initialValues (locked av test)
- [x] Type-A test `setupStepInitialValues.test.ts` — alle fem (gross/net) + best_ball/texas/stableford/acey_deucey → `{}`
- [x] GameForm-render-test utvidet: Wolf(gross)/Shamble(champagne)/Nassau(net) seksjon vises + riktig radio checked (ville feilet pre-fix)
- [x] `useGameFormState.test.ts` utvidet: 5 formats initialValues→state + `is*`-flag

**Gates:** `npx vitest run` (3 filer) 65 grønne · `npm run build` ✓ Compiled successfully · `npx eslint` ren. Fresh-context skeptisk evaluator: **ACCEPT**. Versjon → 1.59.2.

**Out-of-scope-funn:** round_robin har samme edit-flow-bug (allowance silent reset). Egen issue opprettes.

## Gates

- `npx vitest run app/admin/games/new/ "app/admin/games/[id]/edit"` — relevante suiter grønne
- `npm run build` — ingen type-feil (edit-page + GameForm)
- `npx eslint` — ren på endrede filer

## Versjonering

Bruker-synlig bug-fix (kan nå redigere disse spillene) → **PATCH** + CHANGELOG (samme 1.59.y-serie).
