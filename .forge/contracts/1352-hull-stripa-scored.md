# Kontrakt: Hull-stripa viser «fullført» basert på posisjon, ikke faktiske scorer (#1352)

Kilde: kontrakt-kommentar på issue #1352 (kontrakt-smeden, verifisert mot main @ 92dc049
5. aug). Dette er byggeøktens kopi med drift-tilpasninger, avkryssede suksesskriterier og
evidens. PR: #1576, branch `claude/1352-hull-stripa-scored`. Produktvalg: nei.

## Drift fra kontrakt-ankeret (verifisert mot HEAD 1013a3d7 før bygging)

- HoleStrip fikk `holes?: number[]` (#1441) og `sibling` (#1466) etter kontraktskriving —
  celler kan tilhøre et søsterspill vi ikke har score-data for. Tilpasning: `scoredHoles`
  gjelder KUN egne hull; søsken-celler beholder posisjonell avledning og viser aldri
  «mangler». (ASSUMPTION dokumentert i notatfil + PR.)
- `roundComplete` bruker nå `totalHoles` (segment-bevisst, #1441), ikke 18 — settet er
  per game_id, så `union.size >= totalHoles` bevarer segment-skopet.
- Kontraktens «fix + patch-bump + CHANGELOG» er foreldet av #1562 (notatfil-regimet):
  `.changes/1352-hull-stripa-mangler.md` i stedet, ingen bump/CHANGELOG-redigering.

## Design (som bygget)

1. Server (hull-siden): count-query → rad-select `select('hole_number')` (samme filtre og
   RLS-vei) → `myScoredHoles: number[]` med `?? []`-fallback.
2. HoleClient: lokal Dexie-count → rad-liste på samme `[gameId+userId]`-indeks →
   union-sett `scoredHoles` (server ∪ lokal) = eneste sannhet for stripa OG
   `roundComplete = scoredHoles.size >= totalHoles`. #668-kommentaren omskrevet.
3. HoleStrip: required prop `scoredHoles: ReadonlySet<number>`; eksportert ren
   `holeCellState(n, currentHole, scoredHoles)` → current | scored | missed | future
   (current vinner; scored uansett posisjon; missed kun bak-uten-score). Missed-stil:
   transparent bakgrunn + 1px dashed `var(--warning)`, tall i `var(--text)` (kontrast).
   Auto-scroll: ref på aktiv celles indre span (SmartLink ikke forwardRef) +
   `scrollIntoView?.({inline:'center', block:'nearest'})` (jsdom-vakt).
4. A11y: `hullAriaLabelDone`/`hullAriaLabelMissing` i begge locales; `aria-current`
   består.

## Suksesskriterier

- [x] Type A på `holeCellState`: current vinner; scored foran og bak posisjon; missed kun
  bak-uten-score; future ellers.
  **Evidens:** ny `components/hole/holeCellState.test.ts` (it.each over edge-case-
  tabellen + tomt/fullt sett) — del av gate-kjøringen (evaluators reproduksjon:
  186/186 grønne på samme glob).
- [x] `HoleStrip.test.tsx` REDIGERT på plass — ingen nye it-blokker; missed-assertion
  flettet inn i eksisterende «completed cells»-test.
  **Evidens:** diff viser redigering på plass (8 it-blokker før og etter); vitest grønn
  (evaluators reproduksjon: 186 tester PASS på gate-globen).
- [x] `HoleClient.test.tsx` oppdatert til ny prop (`myScoredHoles`); ingen nye tester.
  **Evidens:** diff (prop-rename + FRONT9/BACK9-konstanter); samme gate-kjøring grønn.
- [x] `npm run typecheck && npm test && npm run lint` grønt.
  **Evidens:** tsc 0 feil; lint 0 errors (55 pre-eksisterende warnings, kompleksitet
  uendret mot baseline); vitest co-located + parity 188/188; `npm run build` grønn;
  pre-push-gate (typecheck+lint+test) grønn ved push.
- [x] Staging-klikkrunde (merge-port): hopp over et hull og gå videre → cellen viser
  varsel-stil umiddelbart; tast score på hullet → normal ferdig-stil; naviger til hull
  15 → aktiv celle synlig uten manuell scrolling.
  **Evidens:** Playwright-driver mot staging-build av branchen (mobil 375×667), innlogget
  e2e-spiller, spill med score på hull 1,2,4,5: hull 3-cellen rendret `1px dashed
  rgb(216,155,58)` (transparent bakgrunn) med aria «Hull 3 – mangler score»; de fire
  førte cellene solid ramme + aria «score ført»; hull 7 beholdt nøytral aria. Tastet
  score via EKTE UI (tap-til-par på score-kortet, «Sett score for Test Spiller» →
  score 5) → hull 3-cellen flippet til «Hull 3 – score ført» (scored=1, missed=0).
  Hull 15: stripa auto-rullet (scrollLeft=189), aktiv celle fullt synlig (box.x=245 av
  375). Prod-vakt: 0 fremmede supabase-origins. Skjermbilder: 1352-hole6-missed.png,
  1352-hole6-after-entry.png, 1352-hole15-autoscroll.png.

## Out of Scope (uendret + drift-tillegg)

- Submit-sidens fremstilling; øvrige server-side tellinger (PrimaryCta m.fl.).
- #1353 (treffflate-bredde) — urørt (width 26 består).
- 9-hulls-runder utover det segment-bevisste `totalHoles` allerede ga.
- Sync-motoren/Dexie-skjemaet.
- Score-bevisste søsken-celler på splittet cup-dag (drift-ASSUMPTION — vurderes som
  følge-issue).
