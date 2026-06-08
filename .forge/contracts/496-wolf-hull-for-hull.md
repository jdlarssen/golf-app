# Spec: Wolf — format-bevisst «Hull for hull» (PR 2 av epic #496)

**Issue:** [#496](https://github.com/jdlarssen/golf-app/issues/496)
**Scope:** Kun Wolf (Stream A). Ingen head-to-head — Wolf er 3–5 spillere (validator `min_players_for_mode` < 3), så det blir aldri 1-mot-1.
**Bump:** MINOR (ny bruker-synlig flate).

## Problem

«Hull for hull» forgrener på `game_mode` etter PR 1 (Skins), men kun Skins har en egen flate — Wolf treffer fortsatt det generiske best-ball lag-scorekortet ([holes/page.tsx](../../app/games/%5Bid%5D/leaderboard/holes/page.tsx) `DrilldownBody`). For Wolf er det feil: spillerne spiller rotasjons-Wolf mot hverandre, ikke som lag. PR 2 gir Wolf sin egen per-hull-flate, samme mønster som Skins.

## Prior Decisions (fra PR 1 + epic #496)

- Arkitektur: branch i `LeaderboardHolesPage` på `game.game_mode`, egen `<Format>HolesBody` (async server-comp) som henter rå-data, bygger `ScoringContext` via delt `buildXContext`-helper, kjører `computeModeResult`, narrow-er på `result.kind`, rendrer `<Format>HolesView` (server-comp).
- Server-comp for visningen; gjenbruk `AppShell`/`Card`/`Kicker`/`PullQuote`/`LeaderboardBackdrop`/`formatRevealName`. Back-lenke → `/games/${gameId}` (spill-hjem).
- Reveal-modus: skjul når `score_visibility==='reveal'` && ikke ferdig (samme `isRevealHidden`-mønster som SkinsHolesView).
- Behold WolfView sin PER HULL på leaderboardet (additivt); den nye siden er den rike.

## Research / kode-funn

Wolf eksponerer allerede `WolfResult.holes` (`WolfHoleRow[]`) — **ingen scoring-endring**. Per-hull ([types.ts](../../lib/scoring/modes/types.ts)): `wolfUserId`, `choice` (`'partner'|'lone'|'blind'|null`), `partnerUserId`, `stake` (×N carry), `outcome` (`wolf_side_wins|opp_side_wins|tied|pending`), `players: WolfPlayerCell[]` (`userId`, `gross`, `effectiveScore`, `side: 'wolf'|'opp'|null`, `isContributor`), `pointsByPlayer`.

Wolf trenger `wolfChoices` injisert i `ScoringContext` (fra `wolf_hole_choices`-tabellen). `renderWolf` henter dem via `getWolfChoices(gameId)` ([lib/wolf/getWolfChoices.ts](../../lib/wolf/getWolfChoices.ts), tag-cachet på `game-${id}`, admin-client). `WolfHolesBody` gjør det samme.

[WolfView.tsx](../../app/games/%5Bid%5D/leaderboard/WolfView.tsx) har allerede en PER HULL-seksjon (hull/par/SI, `stake` ×N-badge, Wolf-navn, choice-label, outcome-label, +poeng-chips) — men viser **ikke** hver spillers score eller sider. Den nye flaten er den rike: legger til per-spiller netto + side (wolf/opp) + contributor-highlight.

WolfView har lokale label-helpere `choiceLabel`/`outcomeLabel`/`outcomeClass` (eksakte norske strenger: «Lone Wolf», «Blind Wolf», «Partner: {navn}», «Venter…», «Wolf vant», «Andre vant», «Lik», «Venter»). De låses av WolfView.test.tsx.

## Design

### 1. Delt label-helper — `lib/wolf/holeLabels.ts`
Trekk `choiceLabel`/`outcomeLabel`/`outcomeClass` ut av WolfView til rene helpere, så WolfView og WolfHolesView deler dem (ingen kopi-lim, jf. CLAUDE.md). Gjør `wolfChoiceLabel(choice, partnerName: string | null)` ren (tar oppløst partner-navn, ikke `playersById`) — caller resolver navnet via `formatRevealName`. `wolfOutcomeLabel`/`wolfOutcomeClass` er rene på enum-en. **Refaktorer WolfView til å bruke dem** — strengene må forbli byte-identiske (WolfView.test.tsx grønn).

### 2. Delt context — `lib/scoring/context/buildWolfContext.ts`
Speil `buildSkinsContext`, men: `teamNumber: p.team_number ?? 0` (Wolf bruker team_number som rotasjons-slot, ikke null), og ekstra `wolfChoices: WolfHoleChoice[]`-param injisert i konteksten. Brukes av både `renderWolf` (refaktor) og `WolfHolesBody`.

### 3. `WolfHolesView` (server-comp) — `app/games/[id]/leaderboard/holes/WolfHolesView.tsx`
Per hull-kort (fra `result.holes`):
- Hode: `Hull N · Par P · SI X` + `stake` ×N-badge (champagne, kun når > 1).
- Wolf-linje: «Wolf: {navn} · {choice-label} · {outcome-label}» (gjenbruk delte labels; outcome i `outcomeClass`).
- **Per-spiller-rader** (det WolfView mangler): hver spiller med navn, side-merke (Wolf-side / Andre), netto (`effectiveScore`; brutto diskret når `scoring==='net'` og avviker), contributor-markering (`isContributor` → uthevet, «best på sin side»). Wolf-siden visuelt gruppert/markert.
- Poeng: +N per spiller dette hullet (fra `pointsByPlayer`, kun > 0), som chips (speil WolfView).
- Reveal-skjul + dark mode + `tabular-nums` + ≥44px.

### 4. Branch — `holes/page.tsx`
Etter Skins-branchen: `if (game.game_mode === 'wolf') return <Suspense …><WolfHolesBody gameId={id} courseId={game.course_id} /></Suspense>`. `WolfHolesBody` henter `getGameWithPlayers` + `course_holes` + `scores` + `getWolfChoices(gameId)` (Promise.all), bygger via `buildWolfContext`, kjører `computeModeResult`, narrow `kind==='wolf'`, bygger `playersById`, rendrer `WolfHolesView`.

## Edge Cases & Guardrails
- **Pending hull** (choice ikke satt / mangler score): `outcome='pending'`, choice-label «Venter…», side `null` → vis spillerne uten side-merke, score `–`.
- **Lone/Blind Wolf:** alle 3 motstandere på opp-side (`side='opp'`), Wolf alene på wolf-side. Vis det riktig.
- **Stake carry:** ×N-badge kun når > 1 (som WolfView).
- **Aldri 2 spillere** → ingen H2H-gren.
- Andre solo-format urørt (kun `'wolf'` legges til branchen).

## Key Decisions
- Ingen H2H for Wolf (3–5 spillere).
- WolfHolesView = rik (per-spiller score + side + contributor); WolfView PER HULL beholdes som kompakt sammendrag.
- Label-helpere ekstraheres + deles (WolfView refaktoreres, strenger uendret).
- Ingen scoring-endring, ingen nye farge-tokens, ingen migrasjon.

**Claude's Discretion:** eksakt side-gruppering/visuell markering av wolf-side vs opp-side; om brutto vises i parentes ved netto; celle-tetthet.

## Success Criteria
- [ ] «Hull for hull» på et Wolf-spill viser per hull: Wolf, valg (Lone/Blind/Partner), utfall, stake, **hver spillers score + side + poeng** — ikke lag-scorekortet. (Naviger `/games/<id>/leaderboard/holes` for et Wolf-spill.)
- [ ] `lib/wolf/holeLabels.ts` deles av WolfView + WolfHolesView; WolfView-strenger byte-identiske (WolfView.test.tsx grønn).
- [ ] `buildWolfContext` brukes av både `renderWolf` og `WolfHolesBody` (ingen duplisert ctx-map).
- [ ] Andre format (inkl. Skins, best-ball) uendret «Hull for hull».
- [ ] Reveal-modus, dark mode, `tabular-nums`, ≥44px respektert.
- [ ] Type C render-test for WolfHolesView (fra fixture m/ 1 partner-hull + 1 lone/pending).
- [ ] Norsk copy via `humanizer` (gjenbrukte labels er allerede godkjent).
- [ ] CHANGELOG + MINOR-bump (1.96.0) i feature-commit.

## Gates
- [ ] `npx tsc --noEmit` — 0 nye errors
- [ ] `npx vitest run "app/games/[id]/leaderboard"` — nye + WolfView-tester grønne
- [ ] `npx vitest run` — full suite (regresjon)
- [ ] `npm run lint` — 0 errors
- [ ] `npm run build`
- [ ] E2E auth-gate for holes-ruta på Wolf (speil `e2e/games/wolf.spec.ts`)

## Files Likely Touched
**Nye:** `app/games/[id]/leaderboard/holes/WolfHolesView.tsx` (+ `.test.tsx`), `lib/scoring/context/buildWolfContext.ts`, `lib/wolf/holeLabels.ts`
**Endrede:** `app/games/[id]/leaderboard/holes/page.tsx` (wolf-branch + WolfHolesBody), `app/games/[id]/leaderboard/page.tsx` (`renderWolf` bruker buildWolfContext), `app/games/[id]/leaderboard/WolfView.tsx` (bruk delte labels), `e2e/games/wolf.spec.ts`, `CHANGELOG.md` + `package.json`

## Out of Scope
- De 7 gjenværende solo-formatene (Nines/Acey-Deucey/BBB/Round Robin = har holes; Nassau/solo-strokeplay/solo-stableford = trenger result-utvidelse) — egne PR-er.
- H2H-kortet (Wolf kan ikke være 2 spillere).
- Fjerning av WolfView PER HULL.
