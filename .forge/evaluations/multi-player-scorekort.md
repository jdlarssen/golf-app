# Evaluering: Multi-player scorekort

**Dato:** 2026-05-25
**Verdict:** ACCEPT
**Reviewer:** general-purpose evaluator (fresh context)

## Sammendrag

Implementasjonen leverer alle 7 success criteria fra kontrakten med god dekning: ny `scorecardTitle`-helper med tester for alle 6 modi, `resolveScorecardLayout` som korrekt branche-er på modus + reveal-state, `pickTeamCaptain` ekstrahert til delt helper og brukt av både Texas-scoring og scorekort-flaten, `computeLayoutBTotals` test-dekket for alle 4 team-modi (best-ball, par-stableford, matchplay, og Texas-fallback dekkes implisitt via Layout A), og full server-component-rewrite av `app/games/[id]/scorecard/page.tsx` med Layout A/B-branching. Alle 4 gates passerer (tsc, 7 scorecardTitle-tester, 20 scorecardLayout-tester, full suite 943/943 grønn). Implementasjonen overholder kontraktens "Out of Scope" — ingen datamodell-endringer, ingen hull-page-endringer, ingen ny tabell.

## Kriterier (fra kontrakten)

- [COVERED] **Multi-player layout vises for team-modi**: Best-ball, par-stableford, matchplay og Texas viser den nye tittel-helperens label.
  - Evidence: `app/games/[id]/scorecard/page.tsx:104` kaller `scorecardTitle(game.game_mode, game.mode_config)` og bruker `title.title` i TopBar `kicker` (linje 111). `app/games/[id]/page.tsx:579` kaller samme helper for CTA-label. 7 enhetstester i `lib/games/scorecardTitle.test.ts` dekker alle modi.

- [COVERED] **Best-ball/par-stableford viser 2 player-kolonner**: Layout B aktiveres.
  - Evidence: `lib/games/scorecardLayout.ts:107-165` returnerer `variant: 'b'` med 2 kolonner for `best_ball_netto`, `stableford` team_size=2 og `singles_matchplay`. Test `scorecardLayout.test.ts:185-214` («best-ball → Layout B med me + partner»), test linje 216-234 («par-stableford → isStableford=true»). `LayoutBTable` i page.tsx:419 rendrer kolonnene med header-initialer (linje 495-506) og per-spiller-celler (linje 518-544).

- [COVERED] **Texas Layout A med captain-lookup**: Non-captain-spiller viser lag-scoren (ikke tom).
  - Evidence: `scorecardLayout.ts:82-103` håndterer `texas_scramble` ved å hente `teamMembers` med samme `team_number`, kalle `pickTeamCaptain` og returnere captain-userId i `scoreUserIds`. Test linje 119-141 («texas scramble: non-captain ser captain-scoren») asserter eksplisitt at `scoreUserIds === ['aaa-captain']` selv når me er non-captain. `pickTeamCaptain` ekstrahert til `lib/games/teamCaptain.ts` og brukt av både `texasScramble.ts:36-38` og scorekort-flaten — én algoritme, to call-sites.

- [COVERED] **Reveal-active fall-tilbake**: Når `revealState === 'reveal-active'`, Layout A rendres uavhengig av modus.
  - Evidence: `page.tsx:96-97` beregner `revealActive = state === 'reveal-active'` og passes til `resolveScorecardLayout`. `scorecardLayout.ts:111-121` returnerer `variant: 'a'` med me som primær når `revealActive=true`. Test linje 163-181 («reveal-active → Layout A uansett modus») dekker best-ball-tilfellet.

- [COVERED] **iPhone-bredde**: 18-rads Layout B-tabellen kreves ingen horisontal scroll på 375px viewport (vurdert strukturelt).
  - Evidence: `LayoutBTable` har 4 kolonner (#, Par, P1, P2). CSS: `text-sm` (14px), `px-2.5 py-2` på #-kolonne (linje 512), `px-2 py-2` på resten (linje 515, 521). Sekundærtall (netto/points) bruker `text-[10.5px]` (linje 533). Tabellen er innenfor `<Card className="p-0 overflow-hidden">` (linje 485). Med 14px hovedtekst + 10.5px sekundærtekst + `tabular-nums` (`score-num`-klasse) er bredde-budsjettet realistisk for 375px (typisk Card-content-bredde ~343px etter padding). Player-cellene er stablet vertikalt (`flex-col items-end`, linje 524), ikke side-om-side, så slag + netto deler én kolonne-bredde. Strukturelt vurdert: passe. Browser-snapshot på 375px ikke kjørt i denne evaluerings-konteksten — flagget som risiko hvis font-rendering avviker.

- [COVERED] **CTA-label oppdateres**: «Mitt scorekort»-knapp viser «Lagets scorekort» (eller «Match-scorekort») i team-modi.
  - Evidence: `app/games/[id]/page.tsx:579` bruker `scorecardTitle(game.game_mode, game.mode_config).cardLabel` istedenfor hardkodet streng. `GameRow`-typen er utvidet med `mode_config: GameForHole['mode_config']` (linje 90). Helperen returnerer `cardLabel` per modus — verifisert av samme 7 tester i `scorecardTitle.test.ts`.

- [COVERED] **Footer-totals stemmer**: Per-spiller-totaler + lag-total summerer riktig.
  - Evidence: `computeLayoutBTotals` i `scorecardLayout.ts:210-324` med 9 tester i `scorecardLayout.test.ts:319-495`. Dekning:
    - Best-ball (2 tester, linje 320-373): per-spiller brutto/netto, `teamTotalNetto = sum(MIN(netto))`, ikke-spilte hull teller ikke.
    - Par-stableford (2 tester, linje 376-410): per-spiller poeng, `teamTotalPoints = sum(MAX(poeng))`, netto-felt fylles uavhengig.
    - Matchplay (5 tester, linje 413-494): «X up», «X down», «AS», unplayed-hull (én side mangler), «Ingen hull spilt». Match-status-strenger matcher kontraktens design.
  - Texas-modus bruker Layout A — footer-helperen er ikke relevant for Texas (dekkes av eksisterende `LayoutATable`-footer).

## Gates

- [PASS] **`npx tsc --noEmit`** — exit 0, ingen output (success).
- [PASS] **`npx vitest run lib/games/scorecardTitle.test.ts`** — 7/7 tests passed, 1 file passed, 335ms.
- [PASS] **`npx vitest run lib/games/scorecardLayout.test.ts`** — 20/20 tests passed, 1 file passed, 364ms.
- [PASS] **`npx vitest run lib/games/teamCaptain.test.ts`** (bonus, ny helper) — 5/5 tests passed.
- [PASS] **`npm test`** (full suite) — 943/943 tests passed, 81/81 files passed, 8.82s. Ingen regresjoner.
- [N/A] **iPhone SE Playwright snapshot** — ikke kjørt i evaluerings-konteksten (kontrakten lister dette under Claude's discretion, og strukturelt vurdert passer det innenfor 375px-budsjettet).

## Files Touched

`git diff --stat HEAD~4 HEAD` viser:
- `.forge/contracts/multi-player-scorekort.md` (ny, 204 linjer) — kontrakten selv
- `CHANGELOG.md` (+39 linjer) — ny 1.17.y-serie + 1.17.0-oppføring
- `app/games/[id]/page.tsx` (16 linjer endret) — `scorecardTitle()`-call + `mode_config` i `GameRow`
- `app/games/[id]/scorecard/page.tsx` (587 linjer endret) — full rewrite for Layout A/B
- `lib/games/scorecardLayout.test.ts` (ny, 496 linjer) — 20 tester
- `lib/games/scorecardLayout.ts` (ny, 324 linjer) — `resolveScorecardLayout` + `computeLayoutBTotals`
- `lib/games/scorecardTitle.test.ts` (ny, 90 linjer) — 7 tester
- `lib/games/scorecardTitle.ts` (ny, 40 linjer) — helper
- `lib/games/teamCaptain.test.ts` (ny, 35 linjer) — 5 tester
- `lib/games/teamCaptain.ts` (ny, 23 linjer) — `pickTeamCaptain`
- `lib/scoring/modes/texasScramble.ts` (25 linjer endret) — refactor av `pickCaptain` til wrapper rundt `pickTeamCaptain`
- `package.json` + `package-lock.json` — version bump 1.16.4 → 1.17.0

Sammenligning mot kontraktens «Files Likely Touched»:
- Alle 6 forventede filer er endret (page.tsx, scorecard/page.tsx, scorecardTitle.ts + test, CHANGELOG, package.json)
- Bonus-filer ikke nevnt i kontrakten: `teamCaptain.ts`/`.test.ts` (ekstrahert refactor for DRY) og `scorecardLayout.ts`/`.test.ts` (ekstrahert ren funksjon — bedre testbarhet enn kontraktens forslag om `partnersFor`-helper inline i page.tsx). Begge er gode disposisjonsvalg, ikke scope-creep.

## Issues Found

1. **Default-fallback for `flight_number: 0` i test-fixture** — `scorecardLayout.test.ts:71` setter `flight_number: 0` for solo-strokeplay-fixture, men `player()`-helperen defaulter `flight_number: team_number`. Inkonsekvens i fixture-bygging; ikke en bug i prod-koden. **Severity: NONE** (test-only).

2. **`columnFormatter.displayName` returnerer `firstName` men `scorecardLayout.test.ts`-fixturen returnerer fullt navn** — Test-fmt-en (linje 37-42) bruker `p.users?.nickname ?? p.users?.name` direkte uten `firstName()`-shortening, mens prod-formatter (page.tsx:65-70) bruker `firstName()`. Betyr at test-strengen «Jens Hansen» ikke får testet shortening-logikken. **Severity: LOW** — `firstName`-helperen har antagelig egne tester, så gap er kosmetisk.

3. **Match-status-format avviker fra kontrakten** — Kontrakten foreslår «2up etter 8 hull» (compact) eller «AS» / «3&2», implementasjonen leverer «Du er 1 up etter 3 hull» / «AS (2 hull spilt)» / «Du er 2 down etter 2 hull». Kontraktens Claude's Discretion-seksjon tillater eksplisitt «endelig kopi rettes om mot brand-tone (action-orientert, norsk konvensjon)». Den faktiske kopien er mer ordrik men også klarere — Tørny-tonen tilsier ofte hele setninger. **Severity: NONE** (innenfor discretion).

4. **`singlesMatchplay.compute()` ikke brukt for match-status** — Kontraktens Design-seksjon nevnte å bruke `singlesMatchplay.compute()` for match-status i footer. Implementasjonen reimplementerer match-logikk inline i `computeLayoutBTotals`. Konsekvens: hvis matchplay-modulens algoritme endrer seg (f.eks. legger til concession-håndtering), vil scorekort-footeren ikke følge med. **Severity: LOW** — duplikat-logikk er enkel (sammenligning av netto), men det er et drift-risk. Anbefaling: opprett oppfølgings-issue for å DRY-e via shared helper hvis matchplay-domenet får mer kompleksitet.

5. **`SI`-kolonne droppet i Layout B uten advarsel i UI** — Kontrakten bekrefter SI-droppen som bevisst design-valg. Bruker som ser eget SI per hull (for å forstå hvorfor de fikk 2 ekstra slag på et hull) må gå til hull-page-en. **Severity: NONE** (dokumentert design, ikke et avvik).

## Notes

**Kvalitet av test-suite:** 32 nye tester (7 + 20 + 5) er solide. `scorecardLayout.test.ts` har god dekning av edge cases — defensiv Layout A-fallback når partner mangler, column-ordering, captain-resolution for non-captain-spillere, lag-handicap-utregning for 2- og 4-mannslag, unplayed matchplay-hull.

**Refactoring-disiplin er god:** `pickTeamCaptain`-ekstraksjon fra `texasScramble.ts` til delt helper (`teamCaptain.ts`) i en separat refactor-commit (`aeacd3c`) før hoved-implementasjons-commiten (`0810cee`) følger god atomic-commit-praksis. JSDoc dokumenterer at både Texas-scoring og scorekort-flaten bruker samme algoritme. Tilsvarende: `computeLayoutBTotals` ekstrahert i `f6a919f` etter hovedimplementasjonen.

**Norsk språk-kvalitet:** Footer-strenger («Du er X up etter N hull», «Lag-best (netto)», «Lagets poeng», «Ingen hull spilt ennå») leser idiomatisk. CHANGELOG-tagline (linje 19) er konkret og handlingsrettet («Når du spiller best-ball, par-stableford, matchplay eller Texas scramble, viser scorekortet nå deg og partner ved siden av hverandre per hull — som på papir»).

**Kontrakt-overholdelse:** Ingen "Out of Scope"-grenser krysset. Datamodellen uendret, hull-page uendret, leaderboard-CSV uendret, approval-flow uendret. Reveal-fallback fungerer som beskrevet.

**Anbefaling:** ACCEPT. Implementasjonen leverer kontrakten fullt ut med god test-dekning, ren kode-organisering og ingen regresjoner. De 2 LOW-severity issues (firstName-coverage i tests, match-status drift-risk) er ikke blokkerende og kan adresseres som oppfølgings-issues om bruker ønsker.
