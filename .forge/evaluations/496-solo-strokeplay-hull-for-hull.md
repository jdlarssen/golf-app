# Forge-evaluering: Solo strokeplay format-bevisst «Hull for hull» + H2H (epic #496, PR 8)

**Verdict: ACCEPT**

Branch `claude/dreamy-faraday-e4d745`, commit-range `43229ae..HEAD` (f6912c3, 9d6812c, 2c646cb, cba5620, b2ff721, e5f72ce). All three gates green, all 8 criteria independently verified from code + command output. No blocking issues found. The shared-component `lowerWins` extension — the highest-risk change — preserves the existing higher-wins behaviour for Skins/BBB/Nassau; verified by re-reading the verdict refactor and confirming the existing "vant duellen 5–3" test still passes.

## Gate-resultater

| Gate | Resultat |
|------|----------|
| `npm run build` | **GRØNT** (exit 0; full route-tree printed, Proxy middleware compiled) |
| `npx vitest run <5 gate-filer>` | **GRØNT** — `Test Files 5 passed (5) / Tests 55 passed (55)` |
| `npx tsc --noEmit` | **GRØNT** — `EXIT=0`, ingen output |

## Per-kriterium

### A1 — Scoring (`SoloStrokeplayResult.holes`) — PASS
- `SoloStrokeplayHoleRow` / `SoloStrokeplayHolePlayerCell` definert i `types.ts:942-972`. `gross`/`net` er `number | null`.
- `computeHoleRows` (`soloStrokeplay.ts:113-145`): `net = gross === null ? null : gross - strokesForHole(...)` — **null på uspilt, ikke 999-padding** (linje 121-125). Bekreftet.
- `bestUserIds` = laveste `net` blant spilte (linje 128-135): tom-array ved ingen spilte, `length > 1` ved delt. Korrekt.
- **Eksisterende ranking urørt:** `compute()` bruker fortsatt `playerStrokes`/`padTo18`/`rankTeams`-stien (linje 165-188); `computeHoleRows` er en ren additiv side-beregning (linje 190). De 16 eksisterende Type A-casene forblir grønne (del av de 20 i soloStrokeplay.test.ts).
- 4 nye Type A-cases (`soloStrokeplay.test.ts:482-563`): sorterte hull-rader, gross+net med tildelte slag, bestUserIds (én/delt/tom), null-på-uspilt. TDD-disiplin holdt.

### A2 — Branch i holes/page.tsx — PASS
- `holes/page.tsx:191-197`: `if (game.game_mode === 'solo_strokeplay')` forgrener til `<Suspense><SoloStrokeplayHolesBody/></Suspense>` **FØR** den generiske `DrilldownBody` (linje 199-209). Bekreftet rekkefølge.
- `SoloStrokeplayHolesBody` (linje 737-802) bruker `buildSoloStrokeplayContext` (linje 767) og narrower på `result.kind !== 'solo_strokeplay'` → `notFound()` (linje 776). Henter samme slim score/holes-data, ingen ekstra fetch (speiler NassauHolesBody).

### B1 — H2H + lowerWins (viktigst) — PASS
- **Gating:** `renderSoloStrokeplay` (`page.tsx:1987-1988`): `if (game.status === 'finished') { if (result.players.length === 2) {` → HeadToHeadResult; 1/3+ → `SoloStrokeplayPodium` (linje 2036). Korrekt gated på finished + nøyaktig 2.
- **Props:** `lowerWins` passert (linje 2025), `score = totalNetStrokes` (linje 2001), `subLabel = `${totalGrossStrokes} brutto`` (linje 2002), `winnerUserId` fra rank (`a.rank === b.rank ? null : a.rank < b.rank ? a.userId : b.userId`, linje 2016-2017). `formatLabel="Slagspill · Netto"`, `unitLabel="slag"`. Alt per kontrakt.
- **Tug-of-war inversjon:** `HeadToHeadResult.tsx:114-116`: `rawPctA = (sideA.score/total)*100; pctA = lowerWins ? 100 - rawPctA : rawPctA`. Den LAVE-score-siden får største fyll ved lowerWins. Korrekt.
- **Verdict-refactor (regresjons-risiko):** Dommen bruker nå `winnerScore`/`loserScore` avledet fra `winner` (`a`/`b`/`tie`), linje 124-133. For **høyest-vinner** (Skins/BBB/Nassau, `lowerWins=false`): `winner` = siden med høyest score (via winnerUserId eller score-derivasjon), så `winnerScore` = høy, `loserScore` = lav → «vant duellen 5–3» **bevart**. For **lavest-vinner**: `winnerUserId` peker på lav-score-siden → `winnerScore` = lav → «78–85». Begge korrekt.
- **Ingen regresjon for shipped formats:** Eksisterende HeadToHeadResult-test (`HeadToHeadResult.test.tsx:46-67`) asserter fortsatt `vant duellen 5–3` og passerer (del av de 55). Nytt `lowerWins`-`it` (linje 94-113) asserter `vant duellen 78–85`. Tie-casen (`winnerUserId: null`) gir `'tie'` → «Uavgjort 3–3» (linje 69-92), passerer.
- Tie-håndtering ved 2 spillere: `winnerUserId = null` når `a.rank === b.rank` → komponenten regner `winner='tie'` (linje 98 sjekker `=== undefined`, ikke `null`) → «Uavgjort {a}–{b}». Korrekt.

### C1 — Delt kontekst (`buildSoloStrokeplayContext`) — PASS
- Ny `lib/scoring/context/buildSoloStrokeplayContext.ts`. **Eier WD-filtreringen** (#386): `withdrawn_at != null` ekskluderes fra BÅDE `players` (linje 69) og `scores` (via `withdrawnIds`-set, linje 58-60 + 89-90). Bekreftet at WD-spillere ekskluderes fra begge.
- Brukt av **begge** call-sites: `renderSoloStrokeplay` (`page.tsx:1957`) og `SoloStrokeplayHolesBody` (`holes/page.tsx:767`).
- Den inline ctx-map-en i `renderSoloStrokeplay` er **borte** — erstattet av helper-kallet. `renderSoloStrokeplay` beholder kun WD-liste-bygging for `WithdrawnPlayersSection`-chrome (linje 1947-1952), som er korrekt (helperen filtrerer scoring-input, ikke chrome-lista).

### C2 — Designkrav — PASS
- `isRevealHidden = scoreVisibility === 'reveal' && gameStatus !== 'finished'` med egen branch (`SoloStrokeplayHolesView.tsx:52-73`). Speiler NassauHolesView.
- `tabular-nums` på alle tall-flater (totals, subtotal, hull-kort). Verifisert.
- Back-lenke `h-11 w-11` = 44px (`Header`, linje 136).
- Kun theme-tokens (`text-accent`, `bg-accent/[0.06]`, `border-border`, `bg-surface`) — dark-mode-safe.
- **Halved unngår champagne:** `uniqueWinnerId = bestUserIds.length === 1 ? bestUserIds[0] : null` (linje 326-327); ved delt (`length>1`) er `uniqueWinnerId=null` → `isBest=false` for alle → ingen ★/accent. Render-testen verifiserer dette på hull 10 (`card10 ... border-accent ... toBeNull()`).
- Hull-kort uten egen animasjon (per kontrakt); H2H-strip har `reveal-up` (`HeadToHeadResult.tsx:212`), undertrykkes ved prefers-reduced-motion via globals.css.

### C3 — Tester — PASS
- **Én** Type C render-test for view (`SoloStrokeplayHolesView.test.tsx`): asserter scorekort-struktur (totals-header med begge spillere, `not.toContain('Lag')`, Ut/Inn-kort, ★ på enkelt-vinner, ingen accent på delt hull). Re-asserter **ikke** Type A-tall (totaler i fixturen er vilkårlige 70/74, ikke verifisert som scoring-output). Korrekt disiplin.
- `lowerWins`-`it` lagt i HeadToHeadResult.test.tsx (samme komponent, ikke ny komponent-test). Korrekt.
- `e2e/games/solo-strokeplay.spec.ts`: 3 auth-gate-tester (holes/1, leaderboard, leaderboard/holes → /login). Speiler nassau.spec.ts.

### C4 — Ingen regresjon — PASS
- `DrilldownBody` (`holes/page.tsx:804-924`) strukturelt urørt — fortsatt den generiske best-ball-drilldown-en. Bekreftet via diff (kun nye funksjoner lagt til over den).
- Skins/BBB/Nassau H2H-call-sites: `lowerWins` er opt-in med `default false` (`HeadToHeadResult.tsx:78`). Ingen av de andre call-sites passerer propen → uendret oppførsel. Eksisterende test bekrefter.
- `npm run build` grønt med additivt `holes`-felt på `SoloStrokeplayResult` (eksaustive switch/Record over ModeResult tilfredsstilt — build ville feilet ellers).
- `SoloStrokeplayView.test.tsx` + `SoloStrokeplayPodium.test.tsx`: kun `holes: []` lagt i fixtures (additivt påkrevd felt). Verken view/podium rendrer per-hull. Minimal, korrekt.

### D1 — Versjon + CHANGELOG — PASS
- `package.json`: `1.102.0` (MINOR-bump fra 1.101.0). Korrekt for ny bruker-synlig flate.
- CHANGELOG: `## 1.102.y — Slagspill · hull for hull` **åpen** øverst med tagline-blockquote + Teknisk-`<details>`. Bekreftet at base-commit (43229ae) hadde `## 1.101.y` åpen → denne PR-en **wrappet den** i `<details><summary><strong>1.101.y …</strong></summary>` under «Tidligere versjoner». Korrekt minor-serie-wrapping.
- `<details>`-balanse: PR-en legger til 2 åpne + 2 lukkede tags (netto-balansert). Den globale 398/386-skjevheten er pre-eksisterende i den historiske CHANGELOG-en, ikke introdusert her.

## Copy-sanity (norsk, bruker-rettet)
Alle nye strenger idiomatiske: «Stillingen», «Ut»/«Inn», «Venter», «Godt spilt.», «Lykke til.», «Resultatene avsløres etter runden», «Hull for hull åpnes når admin avslutter spillet», «Slagspill · Netto», «{n} brutto», «{vinner} vant duellen 78–85», «Uavgjort 3–3».
- Ingen em-dash-kjeder i bruker-rettede strenger (eneste `—` er i en JSDoc-kommentar, out of scope).
- Score-ranges bruker en-dash (`–`) — korrekt norsk tall-konvensjon.
- «avslutter spillet» er ikke «X-spillet»-redundansen (det er verb+objekt, ikke format-suffiks). Ingen «vennligst», ingen «Tap»-anglisme.
- Middot (·) som separator, ikke em-dash. Ren.

## Issues rangert etter alvorlighet
Ingen blokkerende eller substansielle funn.

**Observasjoner (ikke action-krevende):**
1. *(Triviell, pre-eksisterende)* Den globale `<details>`-tag-tellingen i CHANGELOG.md er skjev (398 åpne / 386 lukkede), men denne PR-en bidrar balansert (2/2). Skjevheten er historisk og utenfor scope for denne PR-en. Kan eventuelt spores som eget rydde-issue hvis ønskelig, men påvirker ikke rendering (markdown-renderere tolererer det, og det er sannsynligvis `<summary>`-innhold eller eldre umatchede tags lenger ned i fila).
2. *(Ingen mangel)* E2E-spec-en er bevisst kun auth-gate (per kontrakt-note: holes-view er bak proxy-auth, live Playwright mot prod ikke gjennomførbart headless). Matcher de syv foregående PR-ene i epicen.

## Konklusjon
Arbeidet matcher kontrakten presist. Den delte `lowerWins`-utvidelsen er implementert minimalt og opt-in, uten regresjon for de tre shipped-formatene som deler `HeadToHeadResult`. Mønsteret speiler de syv foregående epic-#496-PR-ene konsistent. **ACCEPT.**
