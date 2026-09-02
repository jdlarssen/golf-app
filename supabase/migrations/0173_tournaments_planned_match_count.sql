-- 0173_tournaments_planned_match_count.sql
-- Issue #1902 (etappe 3) — poengmålet følger PLANLAGT antall kamper.
--
-- `tournaments.points_to_win` settes én gang, i startTournament, fra de
-- `games`-radene som finnes akkurat da (#1142). Kaptein-uttaket (#1884) åpner
-- økt 2 og 3 MENS cupen er aktiv, og hver avdekking setter inn nye kamper uten
-- å røre målet. En Ryder Cup (8 foursomes + 8 four-ball + 12 singler) starter
-- derfor med 8 kamper → mål 4,5, og computeCupLeaderboard kårer vinneren så
-- snart et lag når 4,5 av det som til slutt blir 28. Cupen kan være «vunnet»
-- etter dag 1.
--
-- Arrangøren oppgir i stedet planlagt antall kamper totalt, i uttaks-rommet,
-- før første økt. Målet regnes av `max(faktisk antall kamper, planlagt)` —
-- planlagt er et GULV, aldri et tak: blir det flere kamper enn planlagt,
-- flytter målet seg opp av seg selv. Regelen har ett hjem:
-- `resolveCupMatchTotal` i lib/cup/pointsToWin.ts.
--
-- NULL = ikke oppgitt → dagens oppførsel, bit for bit. Det gjelder alle cuper
-- fra før denne fiksen og alle cuper uten kapteiner.
--
-- ⚠⚠ DENNE MÅ PÅ PROD **FØR** KODEN DEPLOYES — IKKE ETTER. ⚠⚠
--
-- Migrasjonen er additiv og helt trygg å påføre mens bare den GAMLE koden
-- kjører: ingenting som er deployet i dag leser eller skriver kolonnen.
-- Motsatt rekkefølge er et driftsavbrudd for HVER eneste cup. Den nye koden
-- leser `planned_match_count` i fire flater med eksplisitt kolonneliste, og
-- PostgREST svarer 42703 (ukjent kolonne) som HTTP 400 på alle fire — som
-- feiler LUKKET:
--
--   * `startTournament` (lib/cup/actions.ts) leser `{ data: current }` uten å
--     se på error-kanalen → `current` er null → redirect `?error=not_found`.
--     Ikke bare kapteins-cuper: HVER eneste cup-start, i hele appen.
--   * `loadCupLineupBoard` (lib/cup/lineupData.ts) → uttaks-rommet viser
--     feilsiden.
--   * `openCupLineupSession` (lib/cup/lineupActions.ts) → `save_failed` på
--     hver åpning av en økt.
--   * `syncCupPointsToWin` (lib/cup/pointsToWinSync.ts) → kastet ved hver
--     avdekking.
--
-- Rekkefølgen er altså: staging → verifiser → PROD (bak eier-luka, #1074) →
-- merge → deploy. Nøyaktig samme lærdom som 0172 og 0169.
--
-- Ledger-slug (#1410): tournaments_planned_match_count

alter table public.tournaments
  add column if not exists planned_match_count integer;

-- Nedre grense 2: startTournament nekter å starte en cup med færre enn 2
-- kamper, så et planlagt antall under det kunne aldri blitt sant.
--
-- Øvre grense 400 er en tullverdi-vakt mot en avsporet tastetrykk-rekke, IKKE
-- match-taket. Det EKTE taket bor i lib/cup/limits.ts
-- (MAX_PERSONAL_CUP_MATCHES = 36 for personlige cuper) og håndheves i
-- setCupPlannedMatchCount; klubb-cuper og global admin er uncapped (#526), så
-- CHECK-en her må ligge godt over alt de kan finne på å arrangere.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tournaments_planned_match_count_range'
  ) then
    alter table public.tournaments
      add constraint tournaments_planned_match_count_range
      check (
        planned_match_count is null
        or (planned_match_count >= 2 and planned_match_count <= 400)
      );
  end if;
end $$;

comment on column public.tournaments.planned_match_count is
  'Planlagt antall kamper totalt i cupen, oppgitt av arrangøren i uttaks-rommet (#1902). NULL = ikke oppgitt. Poengmålet regnes av max(faktisk antall kamper, planlagt).';
