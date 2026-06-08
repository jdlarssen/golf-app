# Spec: Round Robin — format-bevisst «Hull for hull» (PR 4 av epic #496)

**Issue:** [#496](https://github.com/jdlarssen/golf-app/issues/496)
**Scope:** Kun Round Robin (Stream A). Ingen head-to-head — Round Robin er nøyaktig 4 spillere (validator i `lib/games/gamePayload.ts`), så det blir aldri 1-mot-1.
**Bump:** MINOR (ny bruker-synlig flate) → 1.98.0.

## Problem

«Hull for hull» forgrener på `game_mode` etter PR 1–3 (Skins, Wolf, Nines), men kun de tre har egne flater — Round Robin treffer fortsatt det generiske best-ball lag-scorekortet ([holes/page.tsx](../../app/games/%5Bid%5D/leaderboard/holes/page.tsx) `DrilldownBody`). For Round Robin er det dobbelt feil: (1) det er ikke ett fast lag — partnerskapet **roterer hvert 6. hull** (3 segmenter à 6 hull, slot A/B/C/D parres ulikt per segment), og (2) leaderboardet ([RoundRobinView.tsx](../../app/games/%5Bid%5D/leaderboard/RoundRobinView.tsx)) har i dag **ingen per-hull-seksjon i det hele tatt** — kun per-spiller-rangering + 3 segment-sammendrag. PR 4 gir Round Robin sin egen per-hull-flate. Den er rent additiv: det finnes ingen eksisterende per-hull-visning å gjøre rikere — vi bygger den hull-for-hull-historien som mangler.

## Prior Decisions (fra PR 1 Skins + PR 2 Wolf + PR 3 Nines + epic #496)

- **Arkitektur:** branch i `LeaderboardHolesPage` på `game.game_mode`, egen `<Format>HolesBody` (async server-comp, Suspense-wrappet) som henter rå-data, bygger `ScoringContext` via delt `buildXContext`-helper, kjører `computeModeResult`, narrow-er på `result.kind`, rendrer `<Format>HolesView` (server-comp).
- **Server-comp** for visningen; gjenbruk `AppShell`/`Card`/`Kicker`/`PullQuote`/`LeaderboardBackdrop`/`formatRevealName`. Back-lenke → `/games/${gameId}`.
- **Reveal-modus:** skjul når `scoreVisibility==='reveal'` && ikke ferdig (samme `isRevealHidden`-mønster som Skins/Wolf/NinesHolesView).
- **Ingen front-9-clip:** vis alle hull (likt Skins/Wolf/Nines-flatene — pending hull viser `–`, reveal håndteres separat).
- **Delt context-helper** brukt av både `renderX` og `XHolesBody` — ingen duplisert ctx-map.
- **Format-bevisst, grunnet i formatet** (eierens direktiv fra Nines): per-hull-flaten skal ta utgangspunkt i mekanikken som spilles. For Round Robin = den roterende konstellasjonen.

## Research / kode-funn

Round Robin eksponerer allerede `RoundRobinResult.holes` (`RoundRobinHoleRow[]`) — **ingen scoring-endring, ingen injeksjon, ingen ekstra DB-fetch** (rotasjonen er ren deterministisk funksjon av slot + hull; scorer fra `scores`-tabellen). Per-hull ([types.ts:1738](../../lib/scoring/modes/types.ts)): `holeNumber`, `segment` (1/2/3), `par`/`side1Par`/`side2Par`, `strokeIndex`, `side1PlayerIds`/`side2PlayerIds` ([string,string]), `side1Players`/`side2Players` (`RoundRobinPlayerCell[]` med `gross`, `extraStrokes`, `net`, `isContributor`, `par`), `side1BestNet`/`side2BestNet`, `side1ContributorIds`/`side2ContributorIds`, `result: MatchplayHoleResult` (`'side1_wins'|'side2_wins'|'tied'|'unplayed'`), `holeWinByPlayer`.

`renderRoundRobin` ([leaderboard/page.tsx:2812](../../app/games/%5Bid%5D/leaderboard/page.tsx)) bygger `ScoringContext` **inline** (linje 2830–2863) med `teamNumber: p.team_number ?? 0` (slot A/B/C/D driver rotasjonen — IKKE null som Skins/Nines). Mønstret er identisk med `buildWolfContext` minus `wolfChoices`-injeksjonen.

`RoundRobinView` navngir konstellasjoner med spillernavn («med {partner} vs {opp} + {opp}») via `playerLabel` + `SEGMENT_HOLES` (`{1:'Hull 1–6',2:'Hull 7–12',3:'Hull 13–18'}`). Den nye flaten gjenbruker den navnekonvensjonen for sidene. `RoundRobinView` eksporterer `RoundRobinPlayerInfo`.

Matchplay-familien har bevisst ingen per-hull-drilldown ([[project_matchplay_family_no_podium_no_reveal]]), så det finnes ingen eksisterende matchplay-hull-visning å speile — Round Robins flate er ny, men gjenbruker side/contributor-mønstret fra `WolfHolesView`/`SkinsHolesView`.

## Design

### 1. Delt context — `lib/scoring/context/buildRoundRobinContext.ts`
Speil `buildWolfContext` minus `wolfChoices`: `game_mode: 'round_robin'`, `teamNumber: p.team_number ?? 0` (slot). Interface `RoundRobinContextPlayerRow = { user_id, team_number, course_handicap, tee_gender, users }`. **Refaktorer `renderRoundRobin`** til å bruke den (erstatter inline ctx-map linje 2830–2863). Brukes også av `RoundRobinHolesBody`.

### 2. `RoundRobinHolesView` (server-comp) — `app/games/[id]/leaderboard/holes/RoundRobinHolesView.tsx`
**Segment-gruppert** (eierens valg). Header/undertittel speiler søsknene: «Hull for hull» + undertittel «Round Robin».

Grupper `result.holes` på `segment` (1/2/3). For hvert segment, i rekkefølge:
- **Segment-header:** «Segment N · {SEGMENT_HOLES[N]}» + konstellasjon for segmentet (les fra segmentets første hull: `side1PlayerIds` vs `side2PlayerIds`, navngitt med `formatRevealName`): «{Side 1-navn} mot {Side 2-navn}». Konstellasjonen er konstant over segmentets 6 hull.
- **6 hull-kort** under headeren:
  - **Hode:** «Hull N · Par P · SI X» venstre. Høyre: resultat-label («{vinnende side} vant» / «Delt» / muted «Venter» ved unplayed), i champagne ved seier.
  - **To side-blokker** (Side 1 øverst, Side 2 under), hver med sine 2 spillere: navn, brutto diskret når `net !== gross` («brutto X»), netto prominent (`score-num`), contributor-★ når `isContributor` (best-netto på siden). Vinnende side visuelt markert (accent-ramme + bg, speil Wolf-side-mønstret). Side-best-netto kan vises subtilt.
- Reveal-skjul + dark mode + `tabular-nums` + ≥44px (back-lenke).

Sidene navngis med spillernavn (ikke «Side 1/2») i konstellasjons-headeren; inne i hull-kortene grupperes de to sidene visuelt (vinnende uthevet). Vis alle 18 hull (ingen front-9-clip).

### 3. Branch — `holes/page.tsx`
Etter Nines-branchen: `if (game.game_mode === 'round_robin') return <Suspense…><RoundRobinHolesBody gameId={id} courseId={game.course_id} /></Suspense>`. `RoundRobinHolesBody` speiler `NinesHolesBody`/`SkinsHolesBody` (Promise.all: `getGameWithPlayers` + `course_holes` + `scores`, INGEN injeksjon), bygger via `buildRoundRobinContext`, kjører `computeModeResult`, narrow `kind==='round_robin'`, bygger `playersById` (`RoundRobinPlayerInfo`), rendrer `RoundRobinHolesView`.

## Edge Cases & Guardrails
- **Unplayed hull** (`result==='unplayed'`, en/begge sider mangler gross): ingen vinner-utheving, netto `–` der `net` er null, ingen ★. Resultat-label «Venter».
- **Delt hull** (`result==='tied'`): ingen side uthevet (begge nøytrale), label «Delt». Begge sider kan ha contributor-★ (tie på best-netto).
- **Segment-grensesnitt:** grupper strengt på `hole.segment`; rekkefølge segment 1→2→3, hull stigende innen segment. Konstellasjon leses fra segmentets første hull (alle 6 hull i segmentet har samme sider).
- **Aldri 2 spillere** → ingen H2H-gren (Round Robin er nøyaktig 4).
- **Reveal-modus** midt-runde → venterom-melding, ingen tall.
- **Blandet kjønn** på avvikshull: per-spiller `cell.net`/`cell.par` er allerede kjønns-korrekt fra scoring-laget; vis hode-par fra `hole.par` (= side1Par, backward-compat).
- Andre solo-format urørt (kun `'round_robin'` legges til branchen). Skins/Wolf/Nines uendret.

## Key Decisions
- **Segment-gruppert** (eierens valg): 3 segment-bolker med konstellasjons-header, deretter hull-kortene. Rotasjonen er front-og-senter — kjernen i hva som gjør Round Robin Round Robin.
- **Sider navngis med spillernavn** (gjenbruk RoundRobinView-konvensjonen), ikke «Side 1/2».
- **Rent additivt:** RoundRobinView får IKKE en ny PER HULL — den nye flaten ER per-hull-historien (i motsetning til Skins/Wolf/Nines der XView allerede hadde en kompakt PER HULL).
- **Ingen H2H** (nøyaktig 4 spillere).
- **`buildRoundRobinContext`** speiler `buildWolfContext` minus injeksjon; `RoundRobinHolesBody` speiler `NinesHolesBody`.
- Ingen scoring-endring, ingen nye farge-tokens, ingen migrasjon.

**Claude's Discretion:**
- Eksakt visuell markering av vinnende side (ramme/bg/label-tone); om side-best-netto vises eksplisitt; celle-tetthet; om segment-headeren også viser segmentets delscore.
- Om brutto vises diskret ved netto-avvik (speil Wolf/Skins).
- Eksakt back-lenke-tekst og undertittel-detalj (f.eks. om allowance-% nevnes).

## Success Criteria
- [ ] «Hull for hull» på et Round Robin-spill viser de 3 roterende segmentene, hver med konstellasjons-header, og per hull begge sidene med **per-spiller netto + vinnende side + contributor** — ikke det generiske lag-scorekortet. (Naviger `/games/<id>/leaderboard/holes` for et Round Robin-spill.)
- [ ] Flaten er rent additiv: RoundRobinView (leaderboard) er uendret, og den nye flaten er den eneste per-hull-visningen for Round Robin.
- [ ] `buildRoundRobinContext` brukes av både `renderRoundRobin` og `RoundRobinHolesBody` (ingen duplisert ctx-map; inline-mappen i `renderRoundRobin` er fjernet).
- [ ] Andre format (inkl. Skins, Wolf, Nines, best-ball) uendret «Hull for hull».
- [ ] Reveal-modus, dark mode, `tabular-nums`, ≥44px respektert; unplayed + tied hull håndtert (ingen feil-utheving).
- [ ] Type C render-test for RoundRobinHolesView (fixture m/ ≥2 segmenter + 1 vunnet + 1 delt + 1 unplayed; verifiserer segment-headere, per-spiller-netto, vinner-utheving).
- [ ] Norsk copy via `humanizer` på nye strenger.
- [ ] CHANGELOG + MINOR-bump (1.98.0) i feature-commit.

## Gates
- [ ] `npx tsc --noEmit` — 0 nye errors
- [ ] `npx vitest run "app/games/[id]/leaderboard"` — nye + RoundRobinView-tester grønne
- [ ] `npx vitest run` — full suite (regresjon)
- [ ] `npm run lint` — 0 errors
- [ ] `npm run build`
- [ ] E2E auth-gate for holes-ruta på Round Robin (ny `e2e/games/round-robin.spec.ts`, speil `e2e/games/nines.spec.ts`)

## Files Likely Touched
**Nye:** `app/games/[id]/leaderboard/holes/RoundRobinHolesView.tsx` (+ `.test.tsx`), `lib/scoring/context/buildRoundRobinContext.ts`, `e2e/games/round-robin.spec.ts`
**Endrede:** `app/games/[id]/leaderboard/holes/page.tsx` (round_robin-branch + RoundRobinHolesBody), `app/games/[id]/leaderboard/page.tsx` (`renderRoundRobin` bruker buildRoundRobinContext), `CHANGELOG.md` + `package.json`

## Out of Scope
- De gjenværende solo-formatene (Acey-Deucey/BBB = har holes men trenger henholdsvis score-utvidelse / achievement-injeksjon; Nassau/solo-strokeplay/solo-stableford = trenger result-utvidelse) — egne PR-er.
- H2H-kortet (Round Robin kan ikke være 2 spillere).
- Endring av Round Robin scoring/rotasjon (ren visning).
- Ny PER HULL på RoundRobinView-leaderboardet (flaten dekker per-hull-behovet).
