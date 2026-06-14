# Kontrakt: Dedup greensomeMatchplay ↔ foursomesMatchplay scoring (#628)

**Issue:** [#628](https://github.com/jdlarssen/golf-app/issues/628)
**Type:** refactor (ingen oppførselsendring, ingen version-bump)
**Branch:** `claude/fervent-maxwell-94b317`
**Gate-status:** `lib/scoring/` er test-gatet i CLAUDE.md → karakteriserings-tester må være grønne FØR og ETTER.

## Problem

`lib/scoring/modes/greensomeMatchplay.ts` (227 linjer) re-implementerer hele
matchplay-kjernen som allerede finnes ekstrahert i
`lib/scoring/modes/foursomesMatchplay.ts` som `computeFoursomesCore(ctx,
allowancePct, sideHcp)`. Greensome predaterer ekstraksjonen (#289) og ble aldri
migrert til den delte kjernen. ~100 nær-identiske linjer (clone `dup:208bd6cc`).

## Settet presedens (avgjør alle gråsoner)

To søsken i samme familie delegerer ALLEREDE til den delte kjernen — greensome er
den eneste som ikke gjør det:

- `chapmanMatchplay.ts` → `computeFoursomesCore(ctx, allowancePct, chapmanSideHandicap)`
- `gruesomeMatchplay.ts` → `computeFoursomesCore(ctx, allowancePct, combinedSideHandicap)`

`computeFoursomesCore` er en `export function` i `foursomesMatchplay.ts`.
`greensomeTeamHandicap(chA, chB) => number` matcher allerede `SideHandicapFn`-
signaturen og er order-uavhengig (min/max), så den kan brukes direkte som
strategi-argument.

## Gråsoner — avgjort

1. **Hvor bor den delte kjernen?** → Blir værende som `computeFoursomesCore` i
   `foursomesMatchplay.ts`. Chapman + gruesome importerer den derfra; greensome
   følger samme mønster. Vi lager IKKE en ny nøytral modul (ville divergere fra
   etablert søsken-mønster og røre flere filer).

2. **Kollapse `greensomeTeamHandicap` inn i `chapmanSideHandicap` (identisk
   60/40-formel)?** → NEI. `greensomeTeamHandicap` beholdes som navngitt, testet,
   eksportert funksjon. Greensome og Chapman er konseptuelt ulike golfformater
   som tilfeldigvis deler formel; matchplay-familie-mønsteret holder per-format
   navngitte handicap. Testen importerer `greensomeTeamHandicap` — eksporten må
   bestå.

3. **Inline allowance-lesing (chapman-stil) vs behold `readAllowancePct`?** →
   Behold `readAllowancePct`-hjelperen for å bevare nøyaktig defensiv semantikk
   (ingen oppførselsendring).

4. **TDD på en gatet `lib/scoring/`-refaktor?** → `greensomeMatchplay.test.ts`
   (262 linjer) er allerede en omfattende karakteriserings-suite som kaller den
   offentlige `compute` og låser: shape, 60/40 lag-HCP, høy/lav-side strokes,
   tie, 3&2/AS/2up, uspilt hull, 0 % allowance, kaptein lex-min, empty shell.
   Issue-steg 1 sier eksplisitt «Skriv/**bekreft**» — å bekrefte den eksisterende
   suiten grønn FØR og ETTER er den autoriserte TDD-veien her. Ingen ny test
   trengs; foursomes-kjernens egne tester dekker per-hull SI/par-detaljene som
   greensome nå arver.

## Endring (presist)

`lib/scoring/modes/greensomeMatchplay.ts` reduseres fra 227 → ~35 linjer:

- **Behold:** topp-kommentar (oppdatert til å si «delegerer til
  `computeFoursomesCore`» à la chapman/gruesome), `greensomeTeamHandicap`
  (eksportert), `readAllowancePct`, `compute`.
- **`compute` blir:** `return computeFoursomesCore(ctx, readAllowancePct(ctx), greensomeTeamHandicap);`
- **Slett:** `placeholderSides`, `emptyShell`, `buildSidePlayers`, og hele den
  inline `compute`-kroppen (side-filtrering, kaptein-valg, lag-HCP-beregning,
  hull-loop, match-result) — alt levert av `computeFoursomesCore`.
- **Importer:** `computeFoursomesCore` fra `./foursomesMatchplay`; behold
  `ScoringContext` + `FoursomesMatchplayResult` type-importer; fjern nå-ubrukte
  type-importer (`ScoringPlayer`, `FoursomesHoleRow`, `FoursomesSide`,
  `FoursomesSidePlayer`) og ubrukte runtime-importer (`pickTeamCaptain`,
  `strokesForHole`, `parFor`, `classifyMatchplayHole`, `computeMatchResult`).

Ingen endring i: `foursomesMatchplay.ts`, dispatcher (`index.ts`,
`buildModeResultForGame.ts`), typer, eller view/mail-lag. Returnerer fortsatt
`kind: 'foursomes_matchplay'`.

## Suksesskriterier

- [x] K1: `greensomeMatchplay.ts:46` delegerer `return computeFoursomesCore(ctx, readAllowancePct(ctx), greensomeTeamHandicap)`; grep bekrefter null gjenværende dupliserte helpers/importer.
- [x] K2: `compute(ctx): FoursomesMatchplayResult` + `greensomeTeamHandicap(chA, chB): number` eksporteres fortsatt, byte-identiske signaturer; konsumenter `index.ts:67` + `lib/cup/computeCupMatchResult.ts:4` + test uberørt.
- [x] K3: `greensomeMatchplay.test.ts` uendret (`git diff 16ddeead` på testfila tom) og grønn — 16 passed.
- [x] K4: `npx vitest run lib/scoring/` → 36 filer, 854 tester passed, ingen søsken-regresjon.
- [x] K5: `npx tsc --noEmit` exit 0.
- [x] K6: 227 → 47 linjer (−180), ingen ny kildefil.

## Evaluering

ACCEPT — fresh-context skeptisk evaluator diffet slettet inline-logikk mot `computeFoursomesCore` steg-for-steg (side-filtrering, empty-shell, allowance-lesing, 60/40, hull-loop, classify, par, result) → byte-identisk. Rapport: `.forge/evaluations/628-greensome-foursomes-dedup.md`.

## Gates (kjøres scopet til endringen)

- `npx vitest run lib/scoring/modes/greensomeMatchplay.test.ts` — den direkte karakteriserings-låsen
- `npx vitest run lib/scoring/` — hele scoring-suiten (søsken-regresjon)
- `npx tsc --noEmit` — typecheck

## Out of scope

- Alt annet i #611 (allerede levert).
- `lib/scoring/`-dedup utenfor greensome↔foursomes (egne issues om de finnes).
- Endring av faktisk scoring-matematikk (ren strukturell dedup).
