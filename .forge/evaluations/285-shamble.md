# Evaluering: Shamble / Champagne Scramble (#285)

**Verdict:** ACCEPT
**Dato:** 2026-05-30
**Evaluator:** Fresh-context skeptisk evaluator (re-kjørte alle gates, leste all kode, hånd-verifiserte scoring-matten — stolte ikke på implementatorens påstander).

Arbeidet møter alle 8 kontrakt-kriterier. Scoring-matten er korrekt og hånd-verifisert. Den ene tingen jeg klarte å bryte (redigering av et scheduled shamble-spill via edit-flyten) er en pre-eksisterende familie-vid begrensning som shamble arver fra nines/skins/wolf/nassau, ikke en ny regresjon introdusert av dette arbeidet — men shamble feiler hardere enn nines der, så jeg loggfører det som should-fix (eget issue), ikke blocker.

## Per-kriterium

| # | Kriterium | Verdict | Evidens jeg personlig bekreftet |
|---|-----------|---------|-------------------------------|
| K1 | Typer + uttømmende maps | PASS | `shamble` i `GameMode`-union (types.ts:19), `MODE_LABELS` (41), `GameModeConfig`-variant (200), `ModeResult`-union (1400). Alle navngitte konsumenter har `shamble`: `MODE_GUIDE` (modeGuide.ts:143), `ENABLED_COMBOS` (TeamSizeSelector.tsx:88, sett {3,4}), `MODE_SUMMARY_LABELS` (ReadyStep.tsx:60), `computeLeaderboard`-switch (index.ts:64), `bruttoHelperFor`-switch (allowanceCopy.ts:54, ingen `default:`), `modeValidators` (gamePayload.ts:1397), `GameRow`-mirror (page.tsx:95). `npm run build` kompilerer → autoritativ uttømmenhets-sjekk. |
| K2 | Scoring-modul | PASS | `lib/scoring/modes/shamble.ts`. (a) teamScore = sum av N laveste effective: sort ASC → slice(0,count) → sum (linje 95-108). (b) net = gross − strokesForHole (linje 46). (c) count klampet `Math.max(1, Math.min(rawCount, teamSize))` (162) — 3-spiller-lag bryter ikke. (d) pending: `scored.length < count` → teamScore null, ekskludert fra total (78-90, 196). (e) ranking ASC via `rankTeams` (217) + sort rank ASC (247). `rankTeams` sorterer `a.total - b.total` (tiebreaker.ts:30) — lavest vinner. |
| K3 | Type A unit-tester | PASS | 19 cases i `shamble.test.ts`, alle grønne. Hånd-verifisert: lag-4 [4,5,5,6] count=2 → 9 ✓ (kontrakt-eksempel, test linje 137); count=1→4, count=3→14 ✓; netto-flip [u1 hcp0/u2 hcp18] best-1 → 3 med u2 counted ✓; count=3-klamp på lag-3 → 15 ✓; Shamble-preset ignorerer config-count=3 → count=2 ✓; pending → teamScore null, holesCounted 0 ✓. Ingen re-assert av tall i Type C. |
| K4 | Validator + regresjon | PASS | `validateShamble` (gamePayload.ts:1318): team_size 3/4 (null→`unsupported_mode_size_combo`), per-lag balanse == teamSize (`team_balance`), Shamble låser count=2 via `parseShambleCount` (1299), Champagne default 2 (1303), duplikat-sjekk, draft tillater partial. 7 regresjons-cases grønne (gamePayload.test.ts:2415+). |
| K5 | Migrasjon | PASS | `0055_shamble.sql`: ÉN format-rad (slug 'shamble', `is_cup_eligible false`), plain insert (ingen `on conflict`), klubb-mapping `is_primary false sort_order 90` (neste ledig etter 80). Matcher 0054-idiom eksakt. DB-apply legitimt utsatt (delt prod-DB, samme avveining som nines #278). |
| K6 | Wizard | PASS | `ShambleSetup.tsx` (datadrevet flis fra seeded rad). `TeamSize` utvidet 1\|2\|3\|4 (TeamSizeSelector.tsx:9). Lag-3 KAN tildeles: `isShamble && teamSize===3` → alle 4 lag vises, `slotCount = teamSize = 3` (TeamsAssignmentSection.tsx:237-247). Champagne-count-velger kun ved `variant==='champagne'` (ShambleSetup.tsx:142). `isShamble` wiret gjennom `useGameFormState` (467) + client-side balanse-sjekk (842-855). Live Playwright utsatt (delt DB). |
| K7 | Leaderboard + Type C | PASS | `renderShamble` (page.tsx:2549): ekte `team_number` (2580, ikke null), `result.kind !== 'shamble'` → notFound (2608), reveal-normalisering (2622). `ShambleView` reveal-guard `scoreVisibility==='reveal' && gameStatus!=='finished'` (77), tabular-nums gjennomgående, counted-highlight. `ShamblePodium` totalScore-metrikk (lavest vinner), variant-bevisst label. 1 Type C render-test grønn (data-testid, ingen Type-A-tall-re-assert). |
| K8 | CHANGELOG + versjon | PASS | package.json 1.51.0. CHANGELOG 1.51.y-serie åpnet (linje 20), 1.50.y wrappet i `<details>` (53-85). Tagline idiomatisk norsk. |

## Gate-resultater (mine kjøringer)

```
$ npm run build
✓ Compiled successfully in 2.4s
✓ Generating static pages using 9 workers (30/30) in 238ms

$ npx vitest run lib/scoring/modes/shamble.test.ts lib/games/gamePayload.test.ts
Test Files  2 passed (2)
     Tests  179 passed (179)

$ npx vitest run ShambleSetup.test.tsx ShambleView.test.tsx
Test Files  2 passed (2)
     Tests  2 passed (2)

$ npx eslint lib/scoring/modes/shamble.ts lib/games/gamePayload.ts ShambleView.tsx ShambleSetup.tsx useGameFormState.ts
(ingen output — clean)

$ npx vitest run   # full suite — regresjons-sjekk
Test Files  172 passed (172)
     Tests  1999 passed (1999)   # 0 skipped
```

Build kompilerer + genererer alle 30 statiske sider. Alle scopede tester grønne. Full suite 1999/1999, ingen skips — å legge `shamble` i `GameMode` brøt ingen GameMode-iterende/snapshot-test.

## Problemer funnet

### should-fix — Redigering av scheduled shamble-spill feiler hardt
**`app/admin/games/[id]/edit/page.tsx:387-393` + `app/admin/games/new/GameForm.tsx:280-342`**

Edit-flyten bruker `GameForm` (ikke `GameWizard`). `GameForm` rendrer skjulte mode-config-inputs kun for stableford/texas/fourball/foursomes — IKKE for shamble (heller ikke for wolf/nassau/skins/nines). Edit-sidens `initialValues` pre-fyller `team_size` kun for texas/stableford. Når admin redigerer + lagrer et scheduled shamble-spill kjører `updateScheduledAction` → `buildGameInsertPayload` → `validateShamble`, som mangler `shamble_team_size` i FormData → `parseShambleTeamSize` returnerer null → hard-feil `unsupported_mode_size_combo`. Lagringen blokkeres.

- **Pre-eksisterende familie-vid begrensning, ikke ny regresjon:** ZERO setup-step-modi (wolf/nassau/skins/nines/bingo/shamble) håndteres i edit-sidens `initialValues`. Shamble arver mønsteret kontrakten eksplisitt speiler (nines).
- **Hvorfor shamble er verre enn nines:** `validateNines` bruker defaultende parsere (`parseNinesVariant`/`parseNinesScoring` → 'nines'/'net') og hard-feiler ikke; nines-edit degraderer stille (config-reset). `parseShambleTeamSize` har ingen default → shamble hard-feiler. Så for shamble er edit-flyten ubrukelig, ikke bare lossy.
- **Begrenset rekkevidde:** Kun draft+scheduled (edit-siden redirecter bort fra active/finished). Create-flyten (wizarden) fungerer fullt. Kontraktens K6-scope er wizarden. Kontraktens edge-case «Mode-lock etter publish … Ingen ny edit-risiko» er litt optimistisk gitt dette, men teknisk korrekt for selve mode-lock-en (variant/count/team_size endres ikke — problemet er at re-lagring av andre felt blokkeres).
- **Anbefaling:** Eget issue. Enten (a) gjør edit av setup-step-modi mulig i GameForm (rendrer skjulte inputs + pre-fyll fra mode_config), eller (b) gi `validateShamble` defaultende team_size-parse (les fra eksisterende mode_config) som nines, slik at edit ikke hard-feiler. Bør antagelig dekke hele setup-step-familien i ett grep.

### nit — `scorecardTitle` gir «Mitt scorekort» for shamble
**`lib/games/scorecardTitle.ts:39`**

Shamble faller til default «Mitt scorekort» (ikke «Lagets scorekort»). Dette er faktisk KONSISTENT og korrekt: `scorecardLayout.ts:265-271` behandler shamble som ikke-team-mode → solo per-spiller-scorekort (`variant: 'a'`, `scoreUserIds: [me.user_id]`). Hver spiller taster sin egen ball (strokeplay-utledet, som nines/contract-design). Texas får «Lagets scorekort» fordi de deler én ball. Nines behandles identisk. Ingen handling påkrevd — loggført kun for fullstendighet.

### Ingen blockers.

## Skeptikerens oppsummering

Det jeg prøvde å bryte:

1. **Scoring-matten** — hånd-regnet kontrakt-eksempelet ([4,5,5,6] count=2 → 9) og 5 andre cases (netto-flip, count-klamp, preset-lås, pending, fler-hull-total). Alle korrekte. `count`-klampen (`Math.min(rawCount, teamSize)`) hindrer at lag-3 + Champagne-3 bryter — verifisert via test + lesning. Ranking er ASC (lavest vinner) — bekreftet i `rankTeams`-kilden, ikke bare påstanden.
2. **Uttømmende switch/Record** — gleppet på `Record<GameMode`? Fant 5 maps, alle har shamble. `bruttoHelperFor`-switchen har ingen `default:` (uttømmende). Build kompilerer = autoritativ. Ingen silent-default-felle i de scoring-kritiske stiene.
3. **Full test-suite** — 1999/1999, 0 skips. Ingen GameMode-snapshot/iterasjons-test brøt av nytt union-medlem.
4. **Lag-3-tildeling** (K6 hovedrisiko) — leste slotCount-logikken: `(isShamble || isTexas) ? teamSize : 2` med team>2-skjuling kun for team_size 4. Lag-3 gir 4 synlige lag à 3 slots. Reelt brukbart (begrenset av app-vid 8-spiller-form-cap, samme som Texas — ikke en shamble-bug).
5. **Edit-flyt** (der jeg fant noe) — `GameForm` rendrer ikke shamble-hidden-inputs, edit-siden pre-fyller ikke shamble-config. Re-lagring av scheduled shamble hard-feiler. Men dette er den pre-eksisterende setup-step-familie-begrensningen kontrakten speiler, ikke et nytt brudd. Should-fix via eget issue.
6. **Norsk copy** — leste ShambleSetup, ShambleView, modeGuide, allowanceCopy, formatLabel, CHANGELOG-tagline. Idiomatisk, ingen anglisismer eller AI-tells. «3-mannslag/4-mannslag», «de laveste scorene per hull teller», «Velg antall» — naturlig sporty kompis-stemme.
7. **Mistenkelige casts/dead code** — ingen `as unknown as` i prod-shamble-filer. Den ene `eslint-disable` (confetti set-state-in-effect) er etablert presedens i alle 9 søsken-podier; confetti respekterer `prefers-reduced-motion` i globals.css.

Konklusjon: arbeidet holdt. Matten er riktig, wiringen komplett, testene ærlige. Det utsatte (DB-apply + live Playwright) er legitimt begrunnet i delt-DB-constrainten og speiler nines-presedens. Det ene reelle funnet er en arvet edit-flyt-begrensning som fortjener et oppfølgings-issue, men som ikke berører kjernen (create + scoring + leaderboard fungerer fullt).
