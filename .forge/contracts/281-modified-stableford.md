# Spec: Modified Stableford — pro-stil poeng-tabell (#281)

## Problem

Tørny har standard Stableford, der dårlige hull bare gir 0 poeng — du kan «parkere» en blow-up uten å straffes ut over de tapte poengene. Modified Stableford (slik PGA Tour bruker den, f.eks. Barracuda Championship) snur insentivet: dobbeltbogey eller verre **trekker** poeng, mens eagle og bedre belønnes kraftig. Det premierer risiko foran par-jaging og gir en helt annen runde-dynamikk. Issue #281, del av format-epic #270, krever F1-datamodellen (#271) som allerede er på plass.

## Prior Decisions (fra tidligere kontrakter)

- **Slug ER game_mode** (`273-f3-admin-format-mapping`, `gamePayload.parseGameMode`): en `formats.slug` mappes 1:1 til `games.game_mode`-strengen og til `mode_config.kind`. Ny format ⇒ ny `GameMode`-union-member. Vi følger dette — ingen indireksjon.
- **Gross/net-toggle-mønsteret** (Wolf #274 / Nassau #276 / Skins #275): ikke relevant her. Modified Stableford bruker handicap **identisk** med standard Stableford (netto-score mot par), ingen gross/net-valg.
- **Mode-info for spillere** (#299, `lib/formats/modeGuide.ts` + `ModeGuideCard`): hver mode har en `MODE_GUIDE`-entry med `summary` + `points`. Surfaces automatisk på game-home og `/spillformer`.
- **Per-spiller-par** (#240): scoring leser par via `parFor(hole, teeGender)` — arves gratis via gjenbruk av Stableford-motoren.

## Design

### Arkitektur: ny GameMode, gjenbrukt motor + visning

`modified_stableford` blir en egen `GameMode`-member (for label, format-picker, guide, validator, advarsel). Men:

- **Scoring-motoren gjenbrukes.** `lib/scoring/modes/stableford.ts` refaktoreres slik at solo-/team-beregningen tar en **points-funksjon** som parameter. Standard-tabellen og den modifiserte tabellen er da de eneste forskjellene. Ny modul `lib/scoring/modes/modifiedStableford.ts` definerer pro-tabellen og kaller den delte motoren. **Eksisterende Stableford-tester MÅ forbli grønne** — det er regresjonsvernet for refaktoren (per `lib/scoring/`-disiplin: ingen endring uten test).
- **Resultatet beholder `kind: 'stableford'`.** `modifiedStableford.compute()` returnerer en `StablefordResult` (solo eller team). Da gjenbrukes `SoloStablefordView`/`SoloStablefordPodium`/team-variantene **uendret** — de er rene view-komponenter som tar `StablefordSoloResult`-prop og rendrer `{totalPoints}` som ren tallinterpolasjon (verifisert: ingen ikke-negativ-antagelse, ingen progress-bar/farge-terskel). `ModeResult`-unionen trenger derfor **ingen** ny member.

### Poeng-tabell (netto − par = diff)

| Resultat | diff | Standard | **Modified** |
|---|---|---|---|
| Albatross+ | ≤ −3 | 8 | **8** |
| Eagle | −2 | 4 | **5** |
| Birdie | −1 | 3 | **2** |
| Par | 0 | 2 | **0** |
| Bogey | +1 | 1 | **−1** |
| Dobbeltbogey+ | ≥ +2 | 0 | **−3** |
| Ikke spilt | null | 0 | **0** |

`computeModifiedStablefordPoints({par, netStrokes})`:
```
if (netStrokes === null) return 0;     // hull ikke spilt — teller ikke (som standard Stableford)
const diff = netStrokes - par;
if (diff <= -3) return 8;              // albatross eller bedre (condor caps på 8)
if (diff === -2) return 5;             // eagle
if (diff === -1) return 2;             // birdie
if (diff === 0)  return 0;             // par
if (diff === 1)  return -1;            // bogey
return -3;                             // dobbeltbogey eller verre
```

### Konfig + spillerantall

`GameModeConfig`-variant (mirrorer Stableford-shapen):
```
| { kind: 'modified_stableford'; team_size: 1; points_table: 'modified' }
| { kind: 'modified_stableford'; team_size: 2; points_table: 'modified' }
```
Solo (`team_size: 1`, 1+ spillere) eller par (`team_size: 2`, 4BBB-MAX-regel). Team-hull-poeng = **MAX** av partnernes individuelle poeng (kan være negativ).

### Ranking

Identisk med Stableford: høyest total vinner, via negert poeng-array inn i `rankTeams` (5-tier cascade). Negative totaler rangeres korrekt (−2 slår −5).

### `isStablefordFamily`-helper

Den **kritiske risikoen**: leaderboard-routeren (`app/games/[id]/leaderboard/page.tsx`) og andre steder bruker `game_mode === 'stableford'` i ikke-uttømmende `if`-kjeder som **TS-kompilatoren ikke fanger**. Innfør `isStablefordFamily(mode)` (`mode === 'stableford' || mode === 'modified_stableford'`) i en server-trygg modul og bruk den på ALLE slike call-sites. Grep `'stableford'` i `app/` + `lib/` og avgjør hver forekomst.

### Advarsel om negative poeng (begge flater — brukervalg)

1. **Spillform-guide (gratis):** `MODE_GUIDE['modified_stableford']` med `summary` + `points`-bullets som forklarer minus-poengene. Vises i `ModeGuideCard` på game-home og `/spillformer`.
2. **Score-input (hver hull-side):** diskret, ikke-blokkerende info-linje over score-input i `HoleClient`, betinget på `game_mode === 'modified_stableford'`. Følger samme seam som skins-`atStake`-hintet (prop fra `page.tsx` → `HoleClient`). Norsk kompis-tone, kjørt gjennom `humanizer`.

## Edge Cases & Guardrails

- **Ikke spilt vs par:** begge gir 0 poeng. Et ikke-spilt hull (0) er dermed «bedre» enn en spilt bogey (−1). Bevisst og dokumentert — konsistent med standard Stableford og resten av appen (uspilte hull teller ikke). Totaler er kun sammenlignbare når like mange hull er spilt.
- **Team-contributor-markering:** standard Stableford markerer contributor kun når `teamPoints > 0` (0 = blank). For modified er 0 (par) et ekte resultat, og MAX kan være negativ. Refaktoren MÅ parameterisere dette slik at: (a) standard beholder `teamPoints > 0`-regelen (tester grønne), (b) modified markerer partner(e) med MAX-poeng som contributor når minst én partner spilte hullet; ingen contributor kun når ingen spilte.
- **Bedre enn albatross** (condor, diff ≤ −4): caps på 8 (samme som albatross). Dokumenter i JSDoc.
- **`games.game_mode`-constraint:** verifiser om kolonnen har CHECK-constraint / enum som må utvides i migrasjonen. Hvis ren `text` uten constraint: ingen ALTER nødvendig.
- **Migrasjon-timing (prod-sikkerhet):** prod leser `formats` live via `getFormatsForIntent`. Settes `is_active=true` FØR koden er deployet, vil prod-pickeren vise formatet, og et opprettet spill 404-er i routeren. Migrasjonen **anvendes derfor først etter at PR er merget og main er deployet** — ikke under bygge-løkken. Filen committes nå; application coordineres med deploy.

## Key Decisions

- **Navn:** «Modifisert Stableford» (avgjort via `no-nb`/`humanizer`). Følger sentence-case + proper-noun-konvensjonen (som «Texas scramble»), idiomatisk norsk, tydelig slektskap til «Stableford». «Pro-Stableford» avvist (markedsførings-flørt, humanizer N11); «Modified Stableford» avvist (engelsk i ellers norsk picker).
- **Advarsel-plassering:** begge (guide + hull-side) — brukervalg.
- **Resultat-kind = `'stableford'`:** for å gjenbruke view-laget uendret.
- **Placement:** sekundær (ikke-primær) format i alle tre intents (kompis, klubb, solo) — per issue.

**Claude's Discretion:**
- Eksakt mekanisme for points-fn-parameterisering av motoren (delt intern `computeWithPoints(ctx, pointsFn, teamSize)` el.l.) — så lenge standard-tester forblir grønne.
- Beholde `points_table: 'modified'` i konfigen (redundant med `kind`, men speiler Stableford-shapen).
- `is_cup_eligible`-verdi: speil standard Stableford sin verdi i `0047`-seeden.
- `sort_order` for intent-mappings.
- Eksakt copy i guide-bullets og hull-side-hint (humaniseres før commit).

## Success Criteria

- [ ] `'modified_stableford'` lagt til i `GameMode`, `MODE_LABELS` (`'Modifisert Stableford'`), `GameModeConfig` (solo + team variant). Verifiser: `npx tsc --noEmit` grønn.
- [ ] `lib/scoring/modes/modifiedStableford.ts` med `compute()` som returnerer `kind: 'stableford'`; Stableford-motoren parameterisert; standard-tabellen uendret. Verifiser: eksisterende `stableford.test.ts` grønn + ny `modifiedStableford.test.ts` grønn.
- [ ] Type A unit-tester: poeng-tabell (alle diff-verdier inkl. albatross-cap + null→0), solo-total med negative poeng, ranking med negativ total, team-MAX med negativ, router-delegering (`index.test.ts`). Verifiser: `npx vitest run` på de tre filene.
- [ ] Migrasjonsfil i `supabase/migrations/` som seeder `formats`-rad + `format_intent_mapping` (kompis/klubb/solo, `is_primary=false`). Verifiser: fil finnes, SQL gjennomgått (anvendes post-deploy).
- [ ] Negative-poeng-advarsel på score-input (hull-side) + i spillform-guiden. Verifiser: `MODE_GUIDE`-entry finnes; hull-side-banner rendres for `modified_stableford` (Type C-test / preview).
- [ ] `isStablefordFamily`-helper brukt på alle `game_mode === 'stableford'`-routing-sites (leaderboard-router m.fl.). Verifiser: grep viser ingen bare-`'stableford'`-sjekk som ekskluderer modified der den burde inkluderes.
- [ ] Én Type C render-test for ny hull-side-advarsel (asserter advarsels-tekst via role/testid, ingen scoring-tall re-assertet).
- [ ] CHANGELOG-oppføring + `package.json` minor-bump (ny spillmodus = MINOR).

## Gates

- [ ] `npx tsc --noEmit` passerer (fanger Record/switch-uttømmelighet — samme som Vercel-build).
- [ ] `npx vitest run lib/scoring/modes/modifiedStableford.test.ts lib/scoring/modes/stableford.test.ts lib/scoring/index.test.ts lib/formats/modeGuide.test.ts` grønn.
- [ ] `npx vitest run` på ny Type C-testfil grønn.
- [ ] `npx eslint` på endrede filer rent.
- [ ] Frontend touched ⇒ evaluator verifiserer hull-side-advarsel (Type C-render eller preview) + at guiden viser «Modifisert Stableford».

## Files Likely Touched

- `lib/scoring/modes/types.ts` — `GameMode`, `MODE_LABELS`, `GameModeConfig`.
- `lib/scoring/modes/stableford.ts` — parameteriser motor med points-fn (bevar standard-oppførsel).
- `lib/scoring/modes/modifiedStableford.ts` — **ny**: pro-tabell + `compute()`.
- `lib/scoring/modes/modifiedStableford.test.ts` — **ny**: Type A.
- `lib/scoring/index.ts` — import + router-case.
- `lib/scoring/index.test.ts` — router-delegering-test.
- `lib/formats/modeGuide.ts` (+ `.test.ts` dekkes auto) — `MODE_GUIDE`-entry.
- `lib/games/allowanceCopy.ts` — `bruttoHelperFor`-case.
- `lib/games/gamePayload.ts` — `parseGameMode` + `validateModifiedStableford*` + `modeValidators`.
- `lib/games/<ny eller eksisterende>` — `isStablefordFamily`-helper (server-trygg modul).
- `app/admin/games/new/TeamSizeSelector.tsx` — `ENABLED_COMBOS`-entry.
- `app/admin/games/new/sections/ReadyStep.tsx` — `MODE_SUMMARY_LABELS`-entry.
- `app/admin/games/new/useGameFormState.ts` — `defaultTeamSizeForMode` (eksplisitt case).
- `app/games/[id]/leaderboard/page.tsx` — routing via `isStablefordFamily`.
- `app/games/[id]/holes/[holeNumber]/page.tsx` + `HoleClient.tsx` (+ evt. ny banner-komponent) — negative-poeng-hint.
- `supabase/migrations/00XX_modified_stableford.sql` — **ny**: format + intent-mapping seed.
- `CHANGELOG.md` + `package.json` — minor-bump.

## Out of Scope

- Cup-eligibility / Ryder-cup-integrasjon for modified stableford (egen vurdering).
- Stableford-quota eller andre points-table-varianter (motoren blir parameterisert, men kun `standard` + `modified` shippes nå).
- Gross/net-toggle (modified bruker netto som standard Stableford).
- Omspill / tie-break ut over eksisterende 5-tier cascade.
- Endring av standard Stableford sin oppførsel eller visning.
