# Spec: Lag-tildeling etter publisering (alternativ B) + start-guard for utildelte lag

**Issue:** #1669 · **Branch:** claude/1669-lagtildeling-etter-publisering · Eierbeslutning 2026-08-16: **B**.

## Problem
Solo-selvpåmelding i et lagformat (best ball, scramble-familien, shamble, patsome — OG par-
stableford `team_size: 2`) gir `game_players.team_number = null`; ingen admin-handling tildeler lag
etterpå; `startScheduledGame` har ingen lag-guard; scoring-computene dropper null-lag stille
(`bestBall.ts:100`, `stableford.ts:284`, `texasScramble.ts:85`, `shamble.ts:174`, `patsome.ts:102`)
→ tom tavle. Løsning: speil flight-inndelingen (#1441/#1450-familien) for lag.

## Design (mønster: `flightScope.ts` + `flightActions.ts` + `FlighterSeksjon.tsx`)
1. **`lib/games/teamScope.ts` (ny, ren)** — tvilling av `flightScope.ts`:
   - `TeamPlayer = { user_id, team_number: number|null, flight_number: number|null, withdrawn_at: string|null }`.
   - `modeRequiresTeamNumber(mode, teamSize)` = `!isSoloFormat(mode, teamSize) && !isMatchplayMode(mode)`
     (`lib/scoring/modes/types.ts:212`, `lib/games/matchplaySides.ts:31`) — dekker best_ball,
     texas/ambrose/florida, shamble, patsome og par-stableford; matchplay-sider har egen guard.
   - `expectedTeamSize(modeConfig)` — leser `mode_config.team_size` (kilden; se `types.ts:444–720`),
     fallback 2 når feltet mangler.
   - `unassignedTeamPlayers(players)` (aktive m/ `team_number == null`), `needsTeamAssignment(...)`,
     `suggestTeamSplit(players, teamSize)` → `{user_id, team_number, flight_number}[]` KUN for de
     utildelte: fyll opp eksisterende lag som har plass (< teamSize) først, deretter nye lag fra
     laveste ledige nummer, i `created_at`-rekkefølge; `flight_number` = eksisterende hvis satt,
     ellers = `team_number` (CHECK `game_players_team_flight_consistency` 0095: team krever flight —
     samme konvensjon som lag-påmelding `teamActions.ts:358`). `teamBuckets(players)`.
   - `lib/games/teamScope.test.ts` — Type A etter `flightScope.test.ts`-mønster (tom/én/mange/
     partial siste lag/eksisterende lag fylles/matchplay & solo → false).
2. **Actions i `app/[locale]/admin/games/[id]/flightActions.ts`** (gjenbruk `loadFlightContext`):
   `suggestTeamAssignment(gameId)` og `setPlayerTeam(gameId, userId, targetTeam)`. Status-guard
   `scheduled|active` som flight-tvillingene; skriv per rad via admin-client med
   `expectAffected(… .select('user_id'), 'suggestTeamAssignment')` (`lib/supabase/affectedRows.ts`)
   — IKKE kopier flight-actionens error-only-sjekk (AGENTS.md felle 2). `setPlayerTeam`: heltall ≥1
   (`?error=bad_team`), kapasitet mot `expectedTeamSize` (`?error=team_full`), sett flight = team
   hvis flight er null. `revalidateTag('game-…','max')` + `revalidatePath` + `?status=team_suggested`
   / `team_updated`. Tester i `flightActions.test.ts` (authz-redirect, happy path, kapasitet).
3. **`app/[locale]/admin/games/[id]/LagSeksjon.tsx` (ny klient)** — klone av `FlighterSeksjon.tsx`:
   «Uten lag (n)»-varsel, «Foreslå laginndeling»-knapp, per-rad `<select>` + «Flytt». Monteres i
   `page.tsx` ved siden av FlighterSeksjon (:867–888) KUN når `modeRequiresTeamNumber` og status
   `scheduled|active`. i18n `admin.game.teams.*` (no + en) — norsk copy kort og konkret.
4. **Start-guard** `lib/games/startScheduledGame.ts`: ny reason `'unassigned_teams'` i unionen
   (:31–42), guard rett etter `incomplete_sides` (:139) via `needsTeamAssignment(mode, teamSize,
   roster)`. Surfacing: `admin/games/[id]/actions.ts` (generisk `?error=${reason}` holder),
   `admin.game.errors.unassigned_teams` (no/en), `(home)/page.tsx:408–414` (flagg + banner som
   `unassigned_flights`), `lib/notifications/autoStartBlocked.ts` `STRUCTURAL_BLOCK_REASONS` +
   `cardContent.ts:313–329` `KNOWN_BLOCK_REASONS` + `notifications.blockReasons.unassigned_teams`
   (og drive-by: legg til manglende `unassigned_flights` samme steder — nevn i commit-body).
   Tester: `startScheduledGame.test.ts` ny describe som speiler `unassigned_flights` (:451–618),
   inkl. «matchplay/solo upåvirket».
5. **Admin-oversikt** `page.tsx`: `GamePlayerRow.team_number/flight_number: number | null`
   (:121–122); erstatt literal `{1..4}`-records (:517–529, :537, :593, :805) med Map-baserte
   bøtter fra faktisk roster; `teamsMax` fra `mode_config.teams_count` / faktisk maks, ikke 4.
6. **Copy** `messages/no.json:1305` («inntil fire par») rettes til noe som ikke lover et tak
   (f.eks. «så mange par du vil»); en-tvilling.
7. Ingen DB-migrasjon (CHECKs 0095/0101 tillater alt; admin-client passerer trigger som i dag).
8. `.changes/1669-lagtildeling.md` (feat): title «Lag-tildeling etter påmelding», link
   `/admin/games`, cta «Åpne spillene», body «Melder spillere seg på enkeltvis i et lagspill, kan
   du nå fordele dem på lag i Sekretariatet før start — og spillet starter ikke før alle har lag.»

## Success Criteria
- [ ] Solo-påmeldte i best ball: admin-siden viser «Uten lag (n)», «Foreslå laginndeling» gir lag à `team_size` (flight satt), «Flytt» flytter én spiller; SQL: `team_number`/`flight_number` satt.
- [ ] Start med utildelte lag → `unassigned_teams` (admin-banner + game-home-banner + cron logger strukturelt); etter tildeling starter spillet og tavla viser alle lag.
- [ ] Solo-format og matchplay uberørt (tester).
- [ ] Admin-oversikten viser lag 5+ / flight 5+ (ingen 4-hardkoding igjen; grep `[1, 2, 3, 4]` i page.tsx = 0).
- [ ] `.changes`-notat parser; `npm run build`, `npm run lint`, full vitest grønt.

## Gates
- [ ] `npx vitest run lib/games "app/[locale]/admin/games/[id]" lib/notifications "app/[locale]/games/[id]/(home)"` + full suite før PR
- [ ] `npm run build` · `npm run lint`
- [ ] Staging: rigg best_ball-spill (`registration_type solo`, åpen påmelding, scheduled), 4 spillere med null-lag → admin: varsel, foreslå, flytt, start blokkert → start OK etter tildeling → tavla har 2 lag.

## Out of Scope
- Validering av at alle lag er fulle (delvis siste lag tillates — scoring takler det); signup-flyten (uendret); #1673.
