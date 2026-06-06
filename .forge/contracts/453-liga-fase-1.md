# Spec: Liga Fase 1 — grunnmur + frittstående slagspill-liga

**Issue:** [#453](https://github.com/jdlarssen/golf-app/issues/453) (epic [#452](https://github.com/jdlarssen/golf-app/issues/452))
**Type:** MINOR (ny bruker-synlig feature)
**Fase:** 1 av 4. F2 = brutto-parallell + Beste-N/Poeng-modeller; F3 = klubb-kobling; F4 = flere spillmodi. Hver egen issue/kontrakt.
**Størrelse:** Stor. Bygge-løkken kjøres i ~11 chunks (se Files + Success Criteria). Commit per chunk.

## Problem

En reell pilot-gjeng kjører en månedlig liga manuelt (slagspill netto, ulik tee per måned, må spille med minst én annen, hele perioden på å spille runden). Tørny har ingen sesong-/serie-konkurranse — cup (`tournaments`) er lag-vs-lag på poeng, ikke individuell order-of-merit over tid. Fase 1 leverer en **frittstående slagspill-liga**: en paraply over N runder spilt av selv-organiserte flights, rullet opp i en live netto sesong-tabell.

## Research Findings (scout-verifisert)

- **`soloStrokeplay.compute(ctx)`** ([lib/scoring/modes/soloStrokeplay.ts:115](lib/scoring/modes/soloStrokeplay.ts:115)) gir per spiller `totalNetStrokes` + `totalGrossStrokes` + `holesPlayed`. **To-par = `totalNetStrokes - rating.par`** der `rating = getRatingForGender(teeBox, teeGender)` ([lib/games/teeRating.ts:33](lib/games/teeRating.ts:33)). Netto-mot-par normaliserer for tee (slope/CR ligger i course handicap), så det er rimelig sammenlignbart på tvers av ulike tee/baner — akkurat det gjengens metode trenger.
- **Cup-mønsteret er ren mal.** [lib/cup/computeCupLeaderboard.ts](lib/cup/computeCupLeaderboard.ts) = pure aggregator; [lib/cup/getCupSnapshot.ts:107](lib/cup/getCupSnapshot.ts:107) gjør IO + kjører per-game scoring og mater aggregatoren. Vi speiler dette: `computeLeagueStandings` (pure) + `getLigaSnapshot` (IO + per-flight `soloStrokeplay.compute`).
- **Flight-opprettelse:** [createCupMatchesFromPlan](app/admin/cup/[id]/generer/actions.ts:70) inserter `games` + `game_players` direkte med `tournament_id`, tee/course/format. Vi speiler den til `startLeagueRoundFlight` med `league_round_id`, `game_mode='solo_strokeplay'`. `course_handicap` settes IKKE ved insert (fryses ved runde-start som ellers i appen).
- **`games` har creator-RLS** (migr. 0071, `created_by = auth.uid()`), så en vanlig deltaker kan opprette sin egen flight. Validering (medlemskap, vindu, ≥2 spillere, ikke alt spilt) skjer i server-action.
- **`proxy.ts` er en blank session-gate** — ingen route-whitelist. `/liga/[id]` dekkes automatisk (innlogget-only). Ingen proxy-endring.
- **RLS-mal (`tournaments`, 0039):** `select to authenticated using (true)`; alle skriv via `getServerClient()` + `requireAdmin()`. Leaderboards er sosiale/offentlige i Tørny.
- **`getGameWithPlayers`** ([lib/games/getGameWithPlayers.ts:171](lib/games/getGameWithPlayers.ts:171)) er `unstable_cache` m/ tag `game-${id}`, joiner `tee_box` (alle 9 rating-kolonner) men **ikke scores** (hentes separat). `getLigaSnapshot` bruker `getAdminClient()` (cache-callbacks kan ikke lese cookies).
- **Siste migrasjon = `0079`.** Ny = `0080`. Ingen npm-script for typegen; regenerér `lib/database.types.ts` via Supabase MCP `generate_typescript_types`.
- **Admin-tiles** i [app/admin/page.tsx:258](app/admin/page.tsx:258) (`tiles: Tile[]`). Cuper-tile teller `tournaments` via `count:'exact'`. Speiles med en `leagues`-tile.

## Prior Decisions (fra brainstorming + epic #452)

- Deltakere: F1 = **frittstående** invitert liste (klubb-kobling = F3).
- Format fast for ligaen; F1 = **slagspill**. Visning F1 = **netto** (brutto = F2).
- Sesong-modell valgbar; F1 = **Total** (gjengens metode) + **Snitt per runde**.
- Manglende runde (Total): **straffescore** (default `worst_plus_one`) eller **må spille alle**.
- **Hard markør-regel:** flight ≥ 2 spillere, ellers teller ikke.
- **Hardt spillevindu + admin-override**; flights opprettet etter opprinnelig vindu **flagges for admin**.
- Fri frekvens; **bane-omfang-trapp** styrer hva som velges per runde.
- Flight-flyt: **fokusert runde-starter** (ikke full veiviser).

## Design

### Datamodell — `supabase/migrations/0080_leagues.sql` (mal: 0039 + 0074)

`public.leagues`: `id`, `name`(1..80), `season_start date`, `season_end date`(≥start), `format text default 'stroke'`, `scoring text default 'net' check in (net,gross,both)`, `standings_model check in (total,average,best_n,points)`, `missed_round_policy default 'penalty' check in (penalty,must_play_all)`, `penalty_kind default 'worst_plus_one' check in (worst_plus_one,fixed)`, `penalty_fixed_over_par int`, `course_scope check in (single_course_single_tee,single_course,multi_course)`, `course_id → courses`, `tee_box_id → tee_boxes`, `status default 'draft' check in (draft,active,finished)`, `created_by → users on delete restrict`, `created_at/started_at/finished_at`. Index `(status, created_at desc)`.

`public.league_rounds`: `id`, `league_id → leagues on delete cascade`, `sequence int`, `label text`, `course_id → courses` (NULL → arv fra league når scope≠multi_course), `tee_box_id → tee_boxes` (NULL → arv når scope=single_course_single_tee), `opens_at timestamptz`, `closes_at timestamptz`(>opens_at), `original_closes_at timestamptz`, `window_overridden_by → users`, `window_overridden_at`. `unique(league_id, sequence)`, index `league_id`.

`public.league_players`: `league_id → leagues on delete cascade`, `user_id → users on delete cascade`, `joined_at`. PK `(league_id, user_id)`, index `user_id`.

`public.games` additivt: `add column league_round_id uuid references league_rounds(id) on delete set null`, `add column delivered_outside_window boolean not null default false`. Partial index `where league_round_id is not null`.

**RLS:** `select to authenticated using (true)` på alle tre nye tabeller. Ingen write-policy (skriv via server-actions: liga-admin via `requireAdmin` + `getServerClient`; flight-insert via creator-RLS på `games`).

### Per-runde netto-mot-par (kjernen)

`getLigaSnapshot(leagueId)` (mal: `getCupSnapshot`): hent league + rounds + alle flight-`games` (m/ `league_round_id` ∈ rundene) + scores + course_holes + tee_boxes via `getAdminClient()`. For hvert **finished** flight-game: bygg `ScoringContext`, kjør `soloStrokeplay.compute(ctx)` → per spiller `totalNetStrokes`; `netToPar = totalNetStrokes - getRatingForGender(teeBox, player.teeGender).par`. Aggreger per (runde, spiller). En spiller med flere finished flights i samme runde: **beste (laveste) netToPar teller** (guardrail). Mater `computeLeagueStandings`.

### Standings-aggregator — `lib/league/computeLeagueStandings.ts` (pure, Type A TDD)

```ts
type LeagueRoundPlayerScore = { userId: string; netToPar: number; deliveredOutsideWindow: boolean };
type LeagueRoundInput = { roundId: string; sequence: number; scores: LeagueRoundPlayerScore[] };
type LeagueConfig = { standingsModel: 'total'|'average'; missedRoundPolicy: 'penalty'|'must_play_all';
  penaltyKind: 'worst_plus_one'|'fixed'; penaltyFixedOverPar: number | null };
type LeagueStandingRow = { userId: string; value: number; roundsPlayed: number; ranked: boolean;
  rank: number | null; perRound: { roundId: string; netToPar: number | null; penalised: boolean }[] };
function computeLeagueStandings(config, rounds: LeagueRoundInput[], playerIds: string[]): { rows: LeagueStandingRow[] }
```

- **Total:** `value = Σ netToPar over runder`. Manglende runde: `penalty` → `worst_plus_one` = (maks netToPar blant spillere som spilte runden) + 1; `fixed` → `penalty_fixed_over_par`. `must_play_all` → spiller uten alle runder: `ranked=false`, sorteres nederst.
- **Snitt:** `value = mean(netToPar over spilte runder)`; krever ≥1 runde; ingen straff.
- Lavest `value` = best. Likt: countback på siste→første rundes netToPar (lavest best), så `roundsPlayed` (flest best), så `userId` (stabil). `ranked=false` alltid nederst.
- Runde uten resultater straffes ikke (penalty for den runden = ingen).

### Frekvens → runder — `lib/league/generateRounds.ts` (pure, Type A)

`generateRounds(seasonStart, seasonEnd, frequency: 'weekly'|'biweekly'|'monthly')` → `{ sequence, opens_at, closes_at }[]`. `monthly` = ett vindu per kalendermåned i spennet (første klippet til seasonStart, siste til seasonEnd). `weekly`/`biweekly` = 7-/14-dagers vinduer fra seasonStart til seasonEnd. `custom` = tom liste (admin legger til manuelt). Ingen overlapp; sammenhengende. `original_closes_at` settes = `closes_at` ved insert.

### Server-actions — `lib/league/actions.ts` (+ rute-actions der naturlig)

`requireAdmin` + `getServerClient` for liga-admin-actions: `createLeagueDraft(formData)` (validér course_scope↔course/tee-konsistens; `generateRounds`; insert league+rounds+players), `updateLeague`, `addRound`/`editRound`/`removeRound`, `editPlayers`, `overrideRoundWindow(roundId, opens?, closes?)` (sett `window_overridden_by/at`, behold `original_closes_at`), `startLeague`(draft→active, krever ≥1 runde + ≥2 deltakere), `finishLeague`(active→finished), `deleteLeague`.

**`startLeagueRoundFlight(roundId, coPlayerUserIds[])`** (deltaker-action, `getServerClient`): validér (a) kaller er `league_players`-medlem, (b) `now()` ∈ `[opens_at, closes_at]` (gjeldende, evt. overstyrt), (c) total flight ≥ 2 (kaller + co-players, alle medlemmer), (d) kaller har ikke allerede et **finished** flight-resultat for runden. Insert `games`-rad (mal: createCupMatchesFromPlan): `game_mode='solo_strokeplay'`, `course_id`/`tee_box_id` fra runden (m/ arv), `status` aktiv-ekvivalent slik at scorekort kan tastes, `league_round_id`, `created_by`. Hvis `now() > original_closes_at` → `delivered_outside_window=true`. Insert `game_players` (kaller + co-players, `tee_gender` per kjønn). Redirect til `/games/${gameId}`. `revalidateTag('league-${leagueId}','max')` ved flight-opprettelse + ved game-finish (hekt på eksisterende `endGame`/submit-revalidate når `league_round_id` er satt).

### UI-flater

- **`/admin/liga/new`** — opprett-veiviser (mal: GameWizard, enklere). Felt: navn + sesong fra/til; bane-omfang-trapp (trapp styrer course/tee-felt); sesong-modell + manglende-runde + straffescore; frekvens → generér + rediger runde-vinduer/tee; deltaker-velger (gjenbruk picker fra `getNewGameFormData`). Steg-gruppering = Claude's discretion.
- **`/admin/liga`** — liga-liste.
- **`/admin/liga/[id]`** — info-kort + status; runder (vindu-status, override-vindu-handling, **liste over flights med `delivered_outside_window=true`**); deltakere; standings-preview; start/avslutt; «Slett» → dedikert side.
- **`/admin/liga/[id]/slett`** — dedikert konfirmasjon (per destructive-action-pattern).
- **`/liga/[id]`** — offentlig (innlogget): netto sesong-tabell (rank, navn, per-runde-celler, value; `tabular-nums`; straffede/manglende celler markert; uranked nederst), runde-liste m/ vindu-status, **«Spill denne runden»** (kun aktiv i vindu) → fokusert runde-starter.
- **Fokusert runde-starter** (`/liga/[id]/runde/[roundId]/spill` eller modal): velg medspillere (≥1, fra venner ∪ co-players via `getTeamCandidates`/`getFriendPlayerOptions`), bekreft → `startLeagueRoundFlight` → `/games/[id]`.
- **Admin-tile «Ligaer»** i `app/admin/page.tsx` (admin-only, ikke i `PlayerKlubbhus`), count via `leagues` aktiv-status.

## Edge Cases & Guardrails

- Flight < 2 spillere → action avviser (hard markør-regel). UI hindrer også, men server er sannheten.
- Spill utenfor vindu → action avviser; admin-override utvider `closes_at`; flights etter `original_closes_at` får `delivered_outside_window=true` og flagges på admin-detalj.
- Spiller fullfører samme runde to ganger → beste netToPar teller; nytt flight blokkeres når et finished-resultat finnes for runden.
- Liga uten runder/deltakere → kan ikke startes.
- Runde uten resultater → straffes ikke; tom celle.
- `must_play_all` + manglende runde → spiller uranked, nederst.
- Slettet flight-game → `league_round_id` blir null (SET NULL); snapshot re-computes uten den.
- Plus-handicap (negativ) → `strokesForHole` håndterer negativt (eksisterende). Ingen spesialkode.
- Solo-flight ned til 1 spiller etter trekk/WD → resultatet teller bare hvis ≥2 faktisk leverte; ellers teller runden ikke for den spilleren (markør-regel beholdt).
- Bane-omfang-konsistens håndheves i action + DB (CHECK der mulig): `single_course_single_tee` krever league.course_id+tee_box_id; `multi_course` krever per-runde course_id+tee_box_id.

## Key Decisions

- **Flight = `solo_strokeplay`-game m/ `league_round_id`** — gjenbruker scorekort/peer-approval/offline/handicap uendret.
- **Pure `computeLeagueStandings` + IO-`getLigaSnapshot`** — speiler cup, maksimal testbarhet.
- **Netto-mot-par via `soloStrokeplay.compute`** — ingen ny scoring-matte; gjenbruk.
- **Liga-opprettelse admin-only i F1** (speiler cup); flight-opprettelse åpen for deltakere (creator-RLS). Demokratisert liga-opprettelse = senere.
- **`delivered_outside_window` settes ved flight-opprettelse** (ikke i submit-pathen) — eneste vei dit er admin-override, så creation-tidspunktet er korrekt signal.
- **Straffescore default `worst_plus_one`** — skalerer med banens vanskelighet.

**Claude's Discretion:** veiviser-steg-gruppering; eksakt standings-tabell-layout (champagne-gold på leder?); copy (humanizer-pass); om runde-starter er egen rute vs modal; tiebreak-detalj utover countback; admin-detalj-seksjonsrekkefølge.

## Success Criteria

- [ ] Migrasjon `0080_leagues.sql` (3 tabeller + games-kolonner + RLS) lagt til; `lib/database.types.ts` regenerert. Verifikasjon: `grep -c "leagues\|league_rounds\|league_players" lib/database.types.ts` > 0 i Row/Insert/Update.
- [ ] `computeLeagueStandings` Type A-test grønn: Total m/penalty(worst_plus_one + fixed), Total m/must_play_all (uranked), Snitt, countback-tiebreak, beste-av-duplikat. Verifikasjon: `npx vitest run lib/league/computeLeagueStandings` ≥ 8 grønne.
- [ ] `generateRounds` Type A-test grønn: monthly/weekly/biweekly vinduer, ingen overlapp, klipping mot sesong-spenn. Verifikasjon: `npx vitest run lib/league/generateRounds`.
- [ ] Admin oppretter liga via `/admin/liga/new` (alle tre bane-omfang-varianter); runder genereres fra frekvens. Verifikasjon: preview-røyktest + DB-rader stemmer.
- [ ] Deltaker starter flight via «Spill denne runden» (≥2 spillere, i vindu); flight blir `solo_strokeplay`-game m/ korrekt `league_round_id` + tee/course fra runden. Verifikasjon: DB-FK + redirect til `/games/[id]`.
- [ ] Markør-sperre + vindu-sperre håndheves **server-side** (ikke bare UI). Verifikasjon: action-test/integrasjonstest: <2 spillere avvist, utenfor-vindu avvist.
- [ ] `/liga/[id]` viser live netto sesong-tabell (Total + Snitt) med per-runde-celler, penalty/uranked-markering. Verifikasjon: én Type C render-test + preview.
- [ ] Admin-override av vindu fungerer og flights etter `original_closes_at` flagges på `/admin/liga/[id]`. Verifikasjon: preview-røyktest.
- [ ] E2E golden path: opprett liga → start flight (2 spillere) → tast+lever → tabell oppdateres. `data-testid`, ikke norsk copy. Verifikasjon: `npm run e2e -- <liga-spec>`.
- [ ] `docs/flows/*-fremtid.svg` oppdatert m/ liga-flyt + PNG regenerert (per `docs/flows/README.md`). MINOR-bump + CHANGELOG-oppføring (tre-lags).

## Gates

- [ ] `npx tsc --noEmit` passerer (alle uttømmende switch/Record dekker ev. nye union-medlemmer)
- [ ] `npx vitest run lib/league` + endrede co-lokerte tester grønne
- [ ] `npm run lint` passerer
- [ ] `npm run build` passerer (Vercel-paritet; ingen «pre-existing»-filtrering)
- [ ] `.githooks/pre-commit` ingen humanizer-advarsler på nye norske strenger
- [ ] Preview-røyktest (Safari mobil): opprett liga (2 deltakere, 2 runder) → start flight → lever → `/liga/[id]` viser tabell; admin-override + utenfor-vindu-flagg synlig

## Files Likely Touched

- `supabase/migrations/0080_leagues.sql`, `lib/database.types.ts`
- `lib/league/types.ts`, `computeLeagueStandings.ts` (+test), `generateRounds.ts` (+test), `getLigaSnapshot.ts`, `actions.ts`
- `app/admin/liga/{page,new/page,[id]/page,[id]/slett/page}.tsx` (+ wizard/form components, actions)
- `app/liga/[id]/page.tsx` (+ standings-table component, +Type C test)
- `app/liga/[id]/runde/[roundId]/spill/` (fokusert runde-starter) eller modal-komponent
- `app/admin/page.tsx` (+ ev. `TileIconKind`) — Ligaer-tile
- `e2e/liga.spec.ts`
- `docs/flows/*` (diagram + PNG)
- `package.json` + `CHANGELOG.md` — MINOR-bump

## Out of Scope (F1)

Brutto/parallell visning + Beste-N/Poeng-modeller (F2); klubb-kobling (`group_id` på liga, medlemmer=deltakere) (F3); flere spillmodi/stableford som liga-format (F4); runde-åpner-/påminnelses-mail; demokratisert (ikke-admin) liga-opprettelse; cup-lignende lag-liga; statistikk på tvers av sesonger; liga-historikk på profil.
