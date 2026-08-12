# Evaluering: Hull-stripa viser «fullført» basert på posisjon, ikke faktiske scorer (#1352)

- **Dato:** 2026-08-12
- **Branch:** `claude/1352-hull-stripa-scored`
- **Commit:** 1ccfe35a6c990c8f82a20523a36eec0985905778 (base bb2c817d, PR #1576)
- **Evaluator:** fersk-kontekst forge-evaluator (runde 1)

## Per kriterium

### 1. Type A på `holeCellState` — PASS

- `holeCellState` eksportert og ren (ingen hooks/side-effekter): `components/hole/HoleStrip.tsx:68-77`.
- Prioritet eksakt current > scored > missed > future (fire returlinjer i rekkefølge).
- `components/hole/holeCellState.test.ts` er Type A: `it.each` over 8 edge-cases (current
  m/ og u/ score; scored foran OG bak posisjon; missed kun bak-uten-score; future) + tomt-sett-
  og fullt-sett-sveip. Kjørt grønn i egen gate-kjøring (se kriterium 4).

### 2. HoleStrip.test.tsx redigert på plass — PASS

- `git diff origin/main...HEAD -- components/hole/HoleStrip.test.tsx`: 8 it-blokker før,
  8 etter (talt i begge versjoner). Missed-assertions flettet inn i eksisterende
  «completed cells»-test (renamet); future-testen fikk not-dashed-vakt; #1441/#1466-testene
  fikk `scoredHoles`-prop. Ingen nye it-blokker.
- `HoleClient.test.tsx`: 38 it-blokker før og etter — kun prop-rename (`myScoredHoles`)
  + `FRONT9_SCORED`/`BACK9_SCORED`-konstanter. Ingen nye tester.

### 3. Stil, søsken-vern, auto-scroll, width — PASS

- Missed-stil: `background: 'transparent'`, `border: '1px dashed var(--warning)'`,
  `color: 'var(--text)'` — aldri warning/accent på tallet, med AA-begrunnelse i kommentar
  (`HoleStrip.tsx:110-121`).
- Søsken-celler (#1466): `isOwn ? holeCellState(...) : n < currentHole ? 'scored' : 'future'`
  (`HoleStrip.tsx:162-167`) — kan strukturelt aldri bli `missed`. Href-logikken
  (`isOwn || !sibling`) er boolsk ekvivalent med gammel `sibling && !ownHoles.has(n)`.
- Auto-scroll: `activeCellRef.current?.scrollIntoView?.({inline:'center', block:'nearest'})`
  med jsdom-vakt (optional chaining på selve metoden), ref på indre `<span>` siden SmartLink
  ikke er forwardRef (`HoleStrip.tsx:147-155`, ref satt `:186`).
- `width: 26` urørt i `cellStyle` (#1353 eget issue).

### 4. Dataflyt server → klient → stripe — PASS

- `page.tsx:314-324`: count/head → rad-select `select('hole_number')` med identiske filtre
  (`game_id`, `user_id`, `strokes not null`) og `.returns<{hole_number:number}[]>()`;
  `?? []`-fallback på `:436`.
- `HoleClient.tsx:461-476`: Dexie `[gameId+userId]`-indeks → `toArray()` → union-sett
  `scoredHoles` (server ∪ lokal, null-vakt på `holeNumber`).
- `roundComplete = scoredHoles.size >= totalHoles` (`:850`) der
  `totalHoles = holeNumbersForSegment(holeSegment).length` (`:834`) — segment-bevisst.
- Repo-vid grep etter `myCompletedHoles`/`localCompletedHoles`: 0 treff. HoleStrip har
  nøyaktig én konsument (HoleClient); `scoredHoles` er required prop, så tsc fanger
  fremtidige glemte callsites.

### 5. i18n — PASS

- `messages/no.json:2212-2213` og `messages/en.json:2212-2213`:
  `hullAriaLabelDone`/`hullAriaLabelMissing`, verifisert programmatisk å ligge under
  `holes.entry` i begge locales. `catalogParity.test.ts` grønn i gate-kjøringen.

### 6. Versjonsdisiplin (#1562) — PASS

- `.changes/1352-hull-stripa-mangler.md`: `type: fix`, `issue: 1352`, én setning.
- `package.json` version 1.232.2 = origin/main (ingen diff); `CHANGELOG.md` ingen diff.

### 7. Gates (kjørt selv, Node 22.23.0) — PASS

- `npx vitest run components/hole "app/[locale]/games/[id]/holes" messages/catalogParity.test.ts`
  → **19 filer / 186 tester PASS** (alle grønne).
- `npm run typecheck` → tsc 0 feil (exit 0).
- `npm run lint` → **0 errors, 55 warnings** — eksakt lik byggeøktens påståtte baseline.

### 8. Staging-evidens (kriterium 5 i kontrakten) — PASS, kritisk vurdert

Kunne ikke gjentas (server stoppet, testdata ryddet), så evidensen ble etterprøvd på
konsistens — og den holder uvanlig godt:

- **Farge:** claimet `1px dashed rgb(216,155,58)` = `#d89b3a` = `--warning` (light) i
  `app/globals.css:53`. Eksakt match.
- **Geometri (uavhengig rekalkulert):** celle 26px + gap 4 + container-padding 28 →
  innholdsbredde 18·26 + 17·4 + 28 = 564; maks scrollLeft = 564 − 375 = **189** — eksakt
  claimet verdi (center-clamped ved maks). Hull 15 starter på 14 + 14·30 = 434;
  434 − 189 = **245** = claimet box.x. Pixel-eksakt konsistent, og 189/245 er ikke tall
  man gjetter.
- **Aria-strenger:** «Hull 3 – mangler score» / «score ført» matcher locale-filen tegn
  for tegn (inkl. tankestrek).
- **Skjermbilder inspisert direkte** (scratchpad: `1352-hole6-missed.png`,
  `1352-hole6-after-entry.png`, `1352-hole15-autoscroll.png`): (a) hull 6 aktivt, 1/2/4/5
  solide, hull 3 stiplet ramme + lesbart tall; (b) hull 3 solid etter EKTE UI-tasting
  (poeng 3→6 i headeren — reell state-endring, ikke re-styling); (c) hull 15 aktivt og
  fullt synlig etter auto-scroll, 7–14 stiplet (korrekt: kun 1–5 hadde score) — internt
  konsistent med scenariet i (a).

### 9. PR #1576-body — PASS

- «Fordeler/ulemper»-blokk til stede (3 fordeler / 2 ulemper, produktspråk).
- Ingen `## Produktvalg`- eller `## Alternativ`-heading — korrekt, dette er ikke et
  produktvalg; auto-merge-policyen gjelder. `Closes #1352` til stede. PR er draft
  (draft-først-regimet #1516 — `gh pr ready` etter bokførings-push).

## Funn (ikke-blokkerende)

1. **Evidens-tellingsdrift:** kontraktens gate-evidens sier «20 filer / 188 tester»;
   reproduksjon av samme glob gir 19 filer / 186 tester (alle grønne). Trolig marginalt
   annen glob i byggeøktens kjøring. Immaterielt — gatene er re-kjørt grønne av
   evaluatoren selv.
2. **Drift-seksjonens anker:** «verifisert mot HEAD 1013a3d7», mens branch-basen er
   bb2c817d (to senere commits, begge på game-home — rører ingen av denne endringens
   filer). Kosmetisk bokføring.

## Sluttverdikt

**ACCEPT** — alle 5 kontraktkriterier verifisert uavhengig; drift-tilpasningene (#1441/#1466-
søsken-vern, segment-bevisst totalHoles, #1562-notatfil) er korrekt implementert og
dokumentert; staging-evidensen er pixel-konsistent og bekreftet mot faktiske skjermbilder.
