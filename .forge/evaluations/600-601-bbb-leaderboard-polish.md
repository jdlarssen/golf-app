# Evaluering: BBB-leaderboard-polish ved 2 spillere + vokabular (#600 + #601)

**Verdict: ACCEPT**

Fresh-context, skeptisk verifisering av branch `claude/pensive-lewin-00180e` mot kontrakt `.forge/contracts/600-601-bbb-leaderboard-polish.md`. Alle akseptkriterier oppfylt, alle gates grønne, ingen scope-lekkasje, ingen reell data-loss.

## Commits
- `552caf91` fix(leaderboard): skjul redundant leaderboard ved 2 spillere i BBB/Nassau/Skins (#600)
- `43aad2a0` fix(leaderboard): BBB-rad bruker hele ord bingo/bango/bongo (#601)

## Diff-scope (kriterium 1) — OK
`git diff origin/main...HEAD --name-only` viser nøyaktig 5 filer, alle forventet:
- `app/[locale]/games/[id]/leaderboard/page.tsx`
- `app/[locale]/games/[id]/leaderboard/BingoBangoBongoView.tsx`
- `CHANGELOG.md`
- `package.json`
- `package-lock.json` (kun version-feltet 1.127.4 → 1.127.6)

Ingen ekstraneøse filer. Per-commit `--stat` bekrefter atomisk struktur: hver commit stager kun sin egen kildefil + CHANGELOG + package.json/lock. Ingen README-relevante fakta endret (duell-kort/leaderboard-internas er ikke dokumentert i README).

## #600 — 2p-grenen rendrer kun duellkortet (kriterium 2) — OK
For hver av de tre render-funksjonene rendrer `mainContent` i `finished` + `result.players.length === 2`-grenen nå ett enkelt `<HeadToHeadResult .../>`-element, uten `<XView>`-søsken og uten gjenværende `<>...</>`-fragment-wrapper:

- **renderNassau:** page.tsx:2587–2601 — kun `<HeadToHeadResult>`, ingen `<NassauView>`.
- **renderSkins:** page.tsx:2766–2780 — kun `<HeadToHeadResult>`, ingen `<SkinsView>`.
- **renderBingoBangoBongo:** page.tsx:2952–2965 — kun `<HeadToHeadResult>`, ingen `<BingoBangoBongoView>`.

Diff bekrefter at `<>`-fragmentene og view-søsknene ble fjernet i alle tre; det gjenstående er ren `return (<HeadToHeadResult .../>)` uten wrapper.

## #600 — uendrede stier (kriterium 3) — OK
- **3+ spillere (else-gren):** Nassau page.tsx:2602–2625 (`NassauPodium` + `NassauView`), Skins :2781–2803 (`SkinsPodium` + `SkinsView`), BBB :2966–2988 (`BingoBangoBongoPodium` + `BingoBangoBongoView`). Alle intakte.
- **Sideturnering (`showSide`):** Nassau :2626–2637, Skins :2805–2816, BBB :2990–3001 — alle kaller fortsatt `renderSideTournamentTabs({ ..., mainContent: mainContent(true) })`. Uendret.
- **Standalone (active/scheduled):** Nassau :2641–2651, Skins :2820–2830, BBB :3005–3015 — bunn-`return <XView .../>` uendret.

## Imports / ubrukte variabler (kriterium 4) — OK
- `BingoBangoBongoView`, `NassauView`, `SkinsView` refereres fortsatt 9 ganger hver i page.tsx (3+-gren + standalone + podium-imports). `HeadToHeadResult` 7 ganger. Ingen orphaned imports.
- `scoreVisibility` forblir konsumert i hver funksjons else-gren (page.tsx:2618, 2797, 2982) og standalone-return (:2647, :2826, :3011). Ingen ubrukt-variabel-advarsel. `tsc --noEmit` exit 0 bekrefter (ingen TS6133).

## #601 — vokabular byttet, tooltips beholdt (kriterium 5) — OK
`BingoBangoBongoView.tsx` `PlayerRow` (diff på linje 248–252-regionen):
- `B1 {bingos}` → `{bingos} bingo`
- `B2 {bangos}` → `{bangos} bango`
- `B3 {bongos}` → `{bongos} bongo`

`title`-tooltipsene beholdt uendret: `Bingo — ${t('bingoBangoBongo.firstOnGreen')}`, `Bango — ${t('bingoBangoBongo.nearestPin')}`, `Bongo — ${t('bingoBangoBongo.firstInHole')}`. Matcher duellkortets `subLabel` i page.tsx:2932 (`${pl.bingos} bingo · ${pl.bangos} bango · ${pl.bongos} bongo`). Ingen nye i18n-nøkler — i tråd med kontrakt (format-termer, byte-identisk no/en).

## Gates (kriterium 6) — ALLE GRØNNE
```
npx tsc --noEmit                          → TSC_EXIT=0
npx vitest run <4 leaderboard test-filer> → Test Files 4 passed (4) / Tests 12 passed (12)
  (BBB isolert: 1 passed / 3 passed)
npm run build                             → ✓ Compiled successfully in 3.6s
```
Merk: den eksisterende `BingoBangoBongoView.test.tsx` asserter IKKE den synlige B1/B2/B3-vs-«bingo»-teksten (kun navn, totalPoints, accent-border) — så grønn test verken bekrefter eller ville fanget #601. #601 er verifisert via kildediff, ikke test. Dette er korrekt per kontrakt (ingen nye render-tester; copy-endring låses ikke i test).

## Versjon + CHANGELOG (kriterium 7) — OK
- `package.json` 1.127.4 → **1.127.6** (to PATCH-bump, én per issue-commit). Forventet 1.127.6. ✓
- CHANGELOG har begge oppføringer: `[1.127.6] · #600` og `[1.127.5] · #601`, hver med tagline-blockquote + Teknisk-details + Changed-seksjon, i tråd med changelog-conventions.

## Regresjons-/data-loss-analyse (kriterium 8) — INGEN REELL DATA-LOSS
Den fjernede viewen ved 2 spillere er fullt dekket av duellkortet:
- **Per-spiller bingo/bango/bongo-fordeling:** duellkortets `subLabel` (page.tsx:2932) viser nøyaktig samme `${bingos} bingo · ${bangos} bango · ${bongos} bongo`.
- **Totaler:** `side.score = pl.totalPoints`.
- **Vinner:** `winnerUserId`.
- **Per-hull:** `strip` (18-hulls momentum-strip, page.tsx:2937–2944).
Samme mønster verifisert for Nassau (`hangingNote` for pushed-seksjoner) og Skins (`hangingNote` inkl. carryover-noten) — begge bevart i kortet. Bringer BBB/Nassau/Skins i tråd med eksisterende Stableford/SoloStrokeplay-presedens. Eier godkjente eksplisitt å skjule alle tre (2026-06-14). Ingen funn.

## Konklusjon
Implementasjonen treffer kontrakten presist: minimal, kirurgisk endring, ingen scope-lekkasje, ingen orphaned kode, alle gates grønne, data-paritet bevart via duellkortet. **ACCEPT.**
