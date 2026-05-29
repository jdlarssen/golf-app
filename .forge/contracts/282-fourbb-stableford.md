# Spec: 4BBB Stableford — synlig, navngitt lag-variant under Stableford (#282)

## Problem

Tørny støtter allerede par-stableford: velger du «Stableford» og deretter «Par» (team_size 2) i lagstørrelse-velgeren, regner motoren ut **beste** stableford-poeng per hull av de to partnerne (`stableford.ts:266`, `Math.max(...)`). Det er nøyaktig 4BBB / better-ball-regelen som issue #282 ber om («hvor beste stableford-poeng per hull teller»).

Problemet er **synlighet og forståelse**, ikke matematikk:

- Lag-varianten gjemmer seg bak et kryptisk «Par»-valg uten forklaring. En arrangør som leter etter «4BBB» finner det ikke, og en spiller skjønner ikke at det er better-ball.
- Appen forklarer aldri regelen til spilleren (spillform-guiden for `stableford` snakker bare om solo: «Du spiller for deg selv …»).

Issue #282 (del av format-epic #270) løser dette ved å gjøre 4BBB til et **tydelig, navngitt og forklart valg** under Stableford.

## Brukerbeslutninger (denne diskusjonsrunden)

To produktvalg ble avklart med Jørgen før kontrakten ble skrevet:

1. **Struktur — ikke eget format-kort, men variant under Stableford.** Jørgen: «utvid selve stableford, slik at stableford er det første som velges, så solo, par eller 4bbb». Vi beholder ETT Stableford-kort i format-velgeren; variant-valget (Solo / 4BBB) lever som underordnet steg. Ingen ny `formats`-rad, ingen ny `game_mode`.

2. **«Par» og «4BBB» er det samme — én av dem er overflødig.** Dagens «Par» (team_size 2) ER 4BBB (beste poeng per hull). Det finnes ingen aggregat/sammenlagt-variant i Tørny. Jørgen bekreftet at vi ikke skal bygge en ny aggregat-variant — vi døper om «Par» → «4BBB» og forklarer regelen. To varianter under Stableford: **Solo** og **4BBB**.

3. **Navn — overlatt til meg via `no-nb`/`humanizer`.** Beslutning: **«4BBB Stableford»** som flate-navn på lag-varianten, **«4BBB»** som tile-label i variant-velgeren (kontekst er allerede Stableford). Begrunnelse: «4BBB» er et etablert internasjonalt golf-låneord, konsistent med at Tørny beholder «Stableford», «Best ball», «Fourball», «Matchplay» på engelsk. «Better ball» unngås fordi «Best ball» allerede er flaggskip-netto-formatet (kollisjonsfare). Sentence-case proper-noun-stil som «Modifisert Stableford» / «Texas scramble». All faktisk norsk hjelpe-/guide-copy kjøres gjennom `humanizer` før commit (CLAUDE.md-mandat).

## ⚠️ Avvik fra issue #282 sine bokstavelige kriterier

Issue-en (skrevet under epic-planlegging, før kode-realiteten var kjent) lister:
- «Scoring-modul i `lib/scoring/modes/fourbb_stableford.ts`» — **droppes.** Scoringen finnes allerede i `stableford.ts` `computeTeam` (team_size 2, MAX-aggregering). En ny modul ville duplisert eksisterende, testet matte → dødkode.
- «Migrasjon: seed format-row + mapping» — **droppes.** Ingen ny `game_mode`/slug ⇒ ingen ny `formats`-rad. Stableford er allerede `is_primary` under Klubb (F1-seed `0047`), så placement-kravet («★ Klubb-turnering primary») er allerede oppfylt.
- «Leaderboard: lag-rangering med per-hull-best-stableford synlig» — **allerede levert** av `TeamStablefordView` / `TeamStablefordPodium` (epic #43). Ingen endring nødvendig.
- «Type A unit-tester» — **allerede levert** av `stableford.test.ts` (team-MAX-casene finnes). Ingen nye Type A nødvendig.

Dette avviket er bevisst og godkjent via brukerbeslutning #1–#2. Konsekvens: 4BBB blir IKKE et eget kort i format-grid-en og IKKE en egen rad i `/spillformer`-katalogen — det er prisen for «under Stableford»-strukturen Jørgen valgte. Vi kompenserer ved å berike Stableford-radens guide-tekst så 4BBB er oppdagbar i prosa. Avviket gjentas i closing-kommentaren på issue-en under «Teknisk».

## Prior Decisions (fra tidligere kontrakter)

- **Slug ER game_mode** (`273-f3`): format-velgeren caster `slug as GameMode` direkte (`GameWizard.tsx:417`), ingen mapping-lag. Derfor ville et eget 4BBB-kort krevd ny `GameMode`-member + ny scoring-modul-router — som vi nettopp begrunnet bort.
- **`isStablefordFamily(mode)`** (`#281`, `types.ts:46`): standard + modified deler all UI/leaderboard-routing. 4BBB er en team_size-variant INNI familien, ikke en ny family-member.
- **Mode-guide for spillere** (`#299`, `lib/formats/modeGuide.ts` + `ModeGuideCard`): `Record<GameMode, ModeGuide>`, keyed på game_mode. 4BBB krever variant-bevissthet (team_size) siden det deler `game_mode = 'stableford'` med solo.
- **Per-spiller-par** (`#240`): arves gratis via gjenbruk av Stableford-team-motoren.

## Design

### Kjernen: variant-bevisst LABEL + GUIDE, null ny scoring

Alt scoring-, leaderboard-, podium-, scorekort- og mail-arbeid for team-stableford finnes. Endringen er tre tynne lag oppå:

#### 1. Variant-bevisst flate-navn

Ny ren helper (server-trygg, ingen `'use client'`-eksport-felle):

```ts
// lib/games/formatLabel.ts (ny)
import { MODE_LABELS, isStablefordFamily, type GameMode, type GameModeConfig } from '@/lib/scoring/modes/types';

/**
 * Flate-navn for et spill, variant-bevisst. Standard Stableford med team_size 2
 * vises som «4BBB Stableford»; modified med team_size 2 som «4BBB Modifisert
 * Stableford». Alle andre faller tilbake til MODE_LABELS[mode].
 */
export function formatDisplayLabel(mode: GameMode, modeConfig: GameModeConfig): string {
  if (
    isStablefordFamily(mode) &&
    (modeConfig.kind === 'stableford' || modeConfig.kind === 'modified_stableford') &&
    modeConfig.team_size === 2
  ) {
    return mode === 'modified_stableford' ? '4BBB Modifisert Stableford' : '4BBB Stableford';
  }
  return MODE_LABELS[mode];
}
```

Anvendes der `MODE_LABELS[mode]` brukes OG `mode_config` er tilgjengelig:
- `ModeChip` får valgfri `modeConfig?`-prop → bruker `formatDisplayLabel` når satt, faller tilbake til `MODE_LABELS[mode]` ellers (ingen call-site tvinges til å endre).
- `ModeGuideCard`-tittel (se #2).
- Admin spill-detalj (`app/admin/games/[id]/page.tsx`) og game-home (`app/games/[id]/page.tsx`) sender `modeConfig` til chip/guide der det er tilgjengelig.

Bred ModeChip-utrulling til alle call-sites er **Claude's discretion** — minst game-home + admin-detalj må vise «4BBB Stableford».

#### 2. Variant-bevisst spillform-guide

`MODE_GUIDE` forblir `Record<GameMode, ModeGuide>`. Ny separat 4BBB-guide + resolver:

```ts
// lib/formats/modeGuide.ts
export const STABLEFORD_4BBB_GUIDE: ModeGuide = {
  summary: 'Dere er to på lag. På hvert hull teller den beste poengsummen av dere to.',
  points: [
    'Begge spiller hele runden og samler stableford-poeng hver for seg.',
    'På hvert hull tar laget med den høyeste poengsummen av de to.',
    'Høyest lagtotal vinner.',
  ],
};

/**
 * Velger riktig guide. team_size 2 i stableford-familien → 4BBB-guiden;
 * ellers den vanlige game_mode-guiden.
 */
export function resolveModeGuide(mode: GameMode, teamSize: number): ModeGuide {
  if (isStablefordFamily(mode) && teamSize === 2) return STABLEFORD_4BBB_GUIDE;
  return MODE_GUIDE[mode];
}
```

`ModeGuideCard` får valgfri `teamSize?`-prop (eller `modeConfig?`) og bruker `resolveModeGuide` + `formatDisplayLabel` for tittel. Uten prop: dagens oppførsel uendret (solo-guide). Norsk copy humaniseres før commit.

#### 3. Variant-velger i wizarden

`TeamSizeSelector` viser i dag generiske tiles «Solo» / «Par» / «4-mann». «Par»-labelen er feil for stableford-familien (det ER 4BBB). Gjør tile-label mode-bevisst:

- Ny valgfri prop eller intern map: for `isStablefordFamily(mode)` vises team_size-2-tilen som **«4BBB»** med hint **«Lag à 2, beste poeng teller»** i stedet for «Par» / «2 spillere».
- Andre moduser beholder «Par» uendret (best ball, texas, fourball, foursomes — disse er IKKE 4BBB-stableford).
- `ENABLED_COMBOS.stableford` forblir `[1, 2]` (Solo + 4BBB). Ingen endring i hvilke kombinasjoner som er aktive.

Mekanikken (mode→tile-label-override vs prop) er **Claude's discretion** så lenge: (a) stableford-familiens team-tile sier «4BBB», (b) ikke-stableford-moduser uendret, (c) eksisterende `TeamSizeSelector.test.tsx` forblir grønn eller oppdateres minimalt.

### `/spillformer`-katalogen

Katalogen itererer `Record<GameMode>` og får ingen egen 4BBB-rad (ingen ny game_mode — bevisst, se avvik). Berik Stableford-radens guide-prosa så 4BBB nevnes (f.eks. et ekstra `points`-punkt på solo-guiden, ELLER la `/spillformer` rendre begge guide-variantene for Stableford). Eksakt mekanikk = **Claude's discretion**; minstekrav: ordet «4BBB» og better-ball-regelen er oppdagbar i prosa et sted på `/spillformer`.

## Edge Cases & Guardrails

- **Modified stableford team-variant:** `formatDisplayLabel` håndterer «4BBB Modifisert Stableford» for konsistens (lav marginalkostnad). Wizardens 4BBB-tile-label gjelder hele stableford-familien. Ingen ny scoring for modified — den har alt sin team_size-2-sti.
- **Ingen `'use client'`-eksport-felle:** `formatLabel.ts` må være ren (ingen `'use client'`) så den kan importeres i både server-components og client-components (jf. memory-feedback om throw-function-wrapping).
- **ModeChip-fallback:** call-sites uten `mode_config` (om noen) faller tilbake til `MODE_LABELS[mode]` → «Stableford». Ingen krasj, ingen tvungen call-site-endring.
- **`ModeGuideCard` uten teamSize-prop:** beholder dagens solo-oppførsel. Kun game-home for et team_size-2-spill sender prop-en.
- **Edit-flyt:** team_size er låst etter publish (mode-lock). 4BBB-labeling påvirker kun visning, ikke validering — ingen ny edit-risiko.
- **Tom/legacy mode_config:** `formatDisplayLabel` narrower på `kind` + `team_size`; faller defensivt til `MODE_LABELS[mode]`.

## Key Decisions

- **Navn:** «4BBB Stableford» (flate), «4BBB» (tile). Avgjort via no-nb/humanizer-prinsipper, se brukerbeslutning #3.
- **Ingen ny game_mode / scoring-modul / migrasjon:** scoringen finnes; duplisering = dødkode. Se avvik-seksjonen.
- **Variant-bevissthet via team_size, ikke ny union-member:** `formatDisplayLabel` + `resolveModeGuide` leser `mode_config.team_size`.
- **Versjons-bump = MINOR:** ny brukersynlig navngitt variant + forklaring er en feature (ny `feat`), ikke ren copy-justering.

**Claude's Discretion:**
- Eksakt mekanikk for mode-bevisst tile-label i `TeamSizeSelector` (prop vs intern map).
- Hvor bredt `ModeChip` med `modeConfig` rulles ut (minst game-home + admin-detalj).
- `/spillformer`-mekanikk for 4BBB-oppdagbarhet.
- Eksakt norsk copy i guide/hint (humaniseres før commit).
- Om `ModeGuideCard` tar `teamSize?: number` eller `modeConfig?: GameModeConfig`.

## Success Criteria

- [x] **Wizard:** Når Stableford er valgt, viser variant-velgeren «Solo» og «4BBB» (ikke «Par») med forklarende hint. **Evidence:** [`TeamSizeSelector.tsx`](app/admin/games/new/TeamSizeSelector.tsx) `tilesForMode` — stableford-familiens team-tile = `{title:'4BBB', hint:'Lag à 2, beste poeng teller'}`; `TeamSizeSelector.test.tsx` 10/10 grønn (queries på `/4bbb/i`).
- [x] **Flate-navn:** `formatDisplayLabel(mode, modeConfig)` finnes i server-trygg `lib/games/formatLabel.ts`, returnerer «4BBB Stableford» for `{kind:'stableford', team_size:2}` og «Stableford» for solo. **Evidence:** [`formatLabel.ts`](lib/games/formatLabel.ts) + `formatLabel.test.ts` 6/6 grønn; brukt på game-home (`ModeGuideCard`), admin-liste + admin-detalj (`ModeChip modeConfig=…`).
- [x] **Spillform-guide:** Spiller på et 4BBB-spill ser 4BBB-forklaringen, ikke solo-teksten. **Evidence:** `STABLEFORD_4BBB_GUIDE` + `resolveModeGuide` i [`modeGuide.ts`](lib/formats/modeGuide.ts); [`ModeGuideCard.tsx`](components/ModeGuideCard.tsx) tar `modeConfig`; `modeGuide.test.ts` 29/29 + `ModeGuideCard.test.tsx` 4/4 grønn (4BBB-variant asserterer 4BBB-summary + skjuler solo-summary).
- [x] **`/spillformer`:** Egen 4BBB-rad i katalogen. **Evidence:** [`app/spillformer/page.tsx`](app/spillformer/page.tsx) `CATALOG` har `stableford-4bbb`-entry med `team_size:2`.
- [x] **Type C render-test:** 4BBB-variant i `ModeGuideCard.test.tsx` + `ModeChip.test.tsx` — asserterer navn/summary via tekst, ingen scoring-tall. **Evidence:** testfilene grønne.
- [x] **Ingen regresjon på solo:** Solo-stableford viser fortsatt «Stableford» + solo-guide (eksplisitt test i ModeGuideCard/formatLabel). Full suite 1884/1884 grønn. **Evidence:** `npx vitest run`.
- [x] **CHANGELOG + `package.json` MINOR-bump.** **Evidence:** 1.47.0 → 1.48.0; CHANGELOG `1.48.y`-serie åpnet, `1.47.y` wrappet i `<details>`. Commit c5a6cec.

## Gates

Etter hver chunk, scoped til endrede filer:
- [x] `npx tsc --noEmit` — 0 nye non-test-errors (13 pre-eksisterende test-fil-feil = dokumentert baseline fra #281; ingen i nye/endrede filer).
- [x] `npx vitest run` på berørte filer grønn (formatLabel 6, modeGuide 29, ModeGuideCard 4, ModeChip 6, TeamSizeSelector 10, wizard 102).
- [x] `npx vitest run lib/scoring/` grønn (scoringen urørt).
- [x] `npx eslint` på endrede filer rent (exit 0).
- [x] `npm run build` passerer (exit 0, «Compiled successfully»); full suite 1884/1884 grønn.

## Files Likely Touched

- `lib/games/formatLabel.ts` — **ny:** `formatDisplayLabel(mode, modeConfig)`.
- `lib/games/formatLabel.test.ts` — **ny:** Type A (solo→«Stableford», team→«4BBB Stableford», andre moduser uendret).
- `lib/formats/modeGuide.ts` — `STABLEFORD_4BBB_GUIDE` + `resolveModeGuide`.
- `lib/formats/modeGuide.test.ts` — resolver-test (team_size 2 → 4BBB-guide, ellers vanlig).
- `components/ModeGuideCard.tsx` — valgfri variant-prop, bruk resolver + formatDisplayLabel for tittel.
- `components/ModeGuideCard.test.tsx` — Type C: 4BBB-variant rendrer 4BBB-summary + «4BBB Stableford»-tittel.
- `components/ui/ModeChip.tsx` — valgfri `modeConfig?`-prop, bruk `formatDisplayLabel`.
- `app/admin/games/new/TeamSizeSelector.tsx` (+ `.test.tsx`) — mode-bevisst «4BBB»-tile-label for stableford-familien.
- `app/games/[id]/page.tsx` — send `modeConfig`/`teamSize` til ModeGuideCard/ModeChip.
- `app/admin/games/[id]/page.tsx` — send `modeConfig` til ModeChip.
- `app/spillformer/page.tsx` — 4BBB-oppdagbarhet i Stableford-prosa.
- `CHANGELOG.md` + `package.json` — MINOR-bump.

## Out of Scope

- Ny scoring-modul / ny `game_mode` / ny `formats`-rad / migrasjon (se avvik).
- Aggregat/sammenlagt-stableford (SUM av begge) — eksplisitt avvist av Jørgen, finnes ikke i Tørny.
- Eget 4BBB-kort i format-grid-en eller egen `/spillformer`-rad (følger av «under Stableford»-strukturen).
- Endring av team-stableford-scoring, leaderboard-, podium- eller scorekort-rendering (alt finnes).
- Cup-eligibility / Ryder-cup-integrasjon for 4BBB stableford.
- Endring av solo-stableford sin oppførsel eller visning.

## Deferred Ideas

- Hvis epic #270 senere vil ha 4BBB som et eget oppdagbart kort i format-grid-en + `/spillformer`-rad: det krever ny `GameMode`-member + tynn scoring-modul som delegerer til `computeTeam` (mønster fra #281). Egen issue hvis ønsket — bevisst utsatt her per Jørgens «under Stableford»-valg.
