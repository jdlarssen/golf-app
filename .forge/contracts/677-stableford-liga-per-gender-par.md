# Kontrakt #677 — Stableford liga-tabell bruker herre-par for alle spillere

## Problem

`getLigaSnapshot` (`lib/league/getLigaSnapshot.ts`) bygde hull-arrayet med
`par: h.par_mens` for ALLE spillere og satte aldri `parByGender`. Det arrayet
sendes til `computeFlightRoundValues` → `computeStableford`, der hver spillers
poeng resolveres via `parFor(hole, player.teeGender)`. Uten `parByGender` faller
`parFor` tilbake til `hole.par` (= herre-par) for alle. På hull der dame-/junior-
par avviker fikk derfor ikke-herrer feil stableford-poeng, og hele sesongtabellen
ble feilrangert. Samme per-kjønn-par-klasse som #647. Vanlig-spill- og
flight-start-stiene var allerede rettet (#240 / #647); liga-snapshotet hadde
driftet.

Slagspill-ligaer er IKKE rammet (par inngår ikke i netto-slag-totalen der — kun
det kjønns-korrekte tee-`par_total` trekkes fra, som allerede resolveres per
kjønn). Cup/matchplay er heller ikke rammet (netto-matchplay ignorerer par).

## Suksesskriterier

- [x] En dame-spiller på dame-tee får stableford-poeng mot dame-par, ikke herre-par.
  Bevis: ny test `scores a ladies player against ladies par, not mens par`
  (getLigaSnapshot.test.ts:177) — F får 4 poeng (dame-par 5 på hull 1), ikke 3
  (herre-par 4). PASS.
- [x] En herre-spiller på samme hull beholder herre-par. Bevis: samme test, M = 3 poeng.
- [x] Riktig per-kjønn-par endrer rangeringen. Bevis: samme test, `net.rows[0] === 'F'`
  (4 > 3) — med bug-en ville begge endt på 3.
- [x] `holesByCourse`-map-typen bærer `parByGender` (matcher `ScoringHole`), og
  `holes.map()`-spreaden sender feltet videre. Bevis: getLigaSnapshot.ts:233-261
  (map-type + parByGender-bygging) + :320-325 (spread).
- [x] Ingen endring i `roundScoring.ts` / `stableford.ts` (parFor() håndterer
  resten når parByGender finnes). Bevis: kun getLigaSnapshot.ts endret.
- [x] Ingen regresjon på #647 kolonne-navn-kontrakten. Bevis: eksisterende test
  `selects per-gender par columns, never the dropped par` PASS.

## Gates

- [x] `npx vitest run lib/league/getLigaSnapshot.test.ts` → 2 passed.
- [x] `npx vitest run lib/league/` → 67 passed (7 filer).
- [x] `npx tsc --noEmit` på de tre berørte liga-filene → ingen feil.

## Approach

Speilet vanlig-spill-stien (`buildStablefordContext.ts:91` /
`buildModeResultForGame.ts:286`): de per-kjønn-kolonnene (`par_ladies`,
`par_juniors`) ble allerede SELECT-et i holes-spørringen, så fiksen er ren
mapping — ingen ny DB-spørring. Utvidet `holesByCourse`-map-typen med `parByGender`,
bygde objektet fra de tre kolonnene, og la `parByGender: h.parByGender` til i
`holes.map()`-spreaden som mater `computeFlightRoundValues`. `parFor` plukker da
riktig variant per spiller via `player.teeGender`. `par`-feltet (= `par_mens`)
beholdes som fallback for konsumenter/tester uten per-kjønn-data.
