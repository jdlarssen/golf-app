-- 0219_league_hcp_allowance.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- #2660: a league plays on a share of the course handicap, with an optional
-- cap on the strokes. The organiser picks both when the league is created;
-- the create form preselects 75 % and at most 32 strokes for a simulator
-- league and 95 % without a cap otherwise (LEAGUE_HCP_DEFAULTS in
-- lib/league/types.ts).
--
--   1. leagues.hcp_allowance_pct — the percentage of the course handicap the
--      league's flights play on, 1–100. 0 is not allowed: gross already has
--      its home in leagues.scoring = 'gross' (which stores 100 here).
--   2. leagues.hcp_max_strokes — the most strokes a player gets after the
--      percentage, 1–54. null = no cap. Simulator cups count it this way: 75 %
--      of a 54 course handicap is 40.5, and the cap makes it 32.
--   3. games.hcp_max_strokes — the flight's frozen copy. The league flight
--      copies both values onto its game at start (startLeagueRoundFlightCore),
--      so the freeze, the late-profile recompute and both pre-start previews
--      read the game and compute the same number (lib/scoring/courseHandicap.ts
--      applyAllowance). null = no cap, which every other game keeps.
--   4. guard_leagues_locked_fields: both league columns lock with scoring,
--      format and is_simulator once the league has left draft. Global admins
--      are not exempt; only the service role passes.
--   5. guard_games_league_hcp: the flight's copy is server-owned. A client
--      may not set games.hcp_max_strokes (insert or update), nor change
--      hcp_allowance_pct on a league flight (league_round_id set). Without it
--      the player who started a flight could PATCH their own flight to 100 %
--      and no cap under the «games creator update» policy, and the recompute
--      after a handicap change (recomputeCourseHandicap) would honour it. The
--      flight insert runs on the admin client, so it passes. Global admins are
--      not exempt, as in 4.
--
-- Defaults are 100 and null, so every league and game that exists keeps full
-- handicap and no cap. No backfill.
--
-- Direction (what does OLD code do with this applied?): nothing changes. Old
-- code never reads or writes the new columns, the defaults keep the flights it
-- creates at 100 % without a cap, and the lock only adds two columns to a
-- guard old code never trips (no app path edits a league's settings after
-- draft). Old code never writes games.hcp_max_strokes, and no app path edits
-- a league flight's percentage.
-- supabase/tests/league_simulator_test.sql covers the CHECKs and both locks
-- (cases 39–53).

alter table public.leagues
  add column hcp_allowance_pct int not null default 100,
  add column hcp_max_strokes int null,
  add constraint leagues_hcp_allowance_pct_check
    check (hcp_allowance_pct between 1 and 100),
  add constraint leagues_hcp_max_strokes_check
    check (hcp_max_strokes is null or hcp_max_strokes between 1 and 54);

comment on column public.leagues.hcp_allowance_pct is
  '#2660: the share of the course handicap the league''s flights play on (1–100). A gross league stores 100. Copied onto each flight game at start; locked once the league leaves draft (guard_leagues_locked_fields).';
comment on column public.leagues.hcp_max_strokes is
  '#2660: the most strokes a player gets after hcp_allowance_pct (1–54); null = no cap. Copied onto each flight game at start; locked once the league leaves draft (guard_leagues_locked_fields).';

alter table public.games
  add column hcp_max_strokes int null,
  add constraint games_hcp_max_strokes_check
    check (hcp_max_strokes is null or hcp_max_strokes between 1 and 54);

comment on column public.games.hcp_max_strokes is
  '#2660: cap on the frozen course handicap after hcp_allowance_pct; null = no cap. Set by league flights (copied from leagues.hcp_max_strokes). lib/scoring/courseHandicap.ts applyAllowance is the one place it is applied.';

create or replace function public.guard_leagues_locked_fields()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  begin
    if auth.uid() is null or old.status = 'draft' then
      return new;
    end if;

    if new.scoring is distinct from old.scoring
       or new.format is distinct from old.format
       or new.is_simulator is distinct from old.is_simulator
       or new.hcp_allowance_pct is distinct from old.hcp_allowance_pct
       or new.hcp_max_strokes is distinct from old.hcp_max_strokes then
      raise exception
        'leagues.scoring, format, is_simulator, hcp_allowance_pct and hcp_max_strokes are locked once the league has started'
        using errcode = 'insufficient_privilege';
    end if;

    if new.status = 'draft' then
      raise exception
        'a league that has started cannot go back to draft'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
  $$;

comment on function public.guard_leagues_locked_fields() is
  '#2638: BEFORE UPDATE on leagues. After draft, scoring, format (0215), is_simulator, hcp_allowance_pct and hcp_max_strokes (0219) are fixed and status cannot return to draft. Only the service role (auth.uid() IS NULL) passes; global admins do not.';

revoke execute on function public.guard_leagues_locked_fields() from public, anon, authenticated;

-- ── The flight's copy is server-owned ────────────────────────────────────────

create or replace function public.guard_games_league_hcp()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  begin
    if auth.uid() is null then
      return new;
    end if;

    if tg_op = 'INSERT' then
      if new.hcp_max_strokes is not null then
        raise exception
          'games.hcp_max_strokes, and hcp_allowance_pct on a league flight, are set by the server'
          using errcode = 'insufficient_privilege';
      end if;
      return new;
    end if;

    if new.hcp_max_strokes is distinct from old.hcp_max_strokes
       or (old.league_round_id is not null
           and new.hcp_allowance_pct is distinct from old.hcp_allowance_pct) then
      raise exception
        'games.hcp_max_strokes, and hcp_allowance_pct on a league flight, are set by the server'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
  $$;

comment on function public.guard_games_league_hcp() is
  '#2660: BEFORE INSERT/UPDATE on games. Only the service role (auth.uid() IS NULL) sets hcp_max_strokes or changes hcp_allowance_pct on a league flight; the flight start copies both from the league on the admin client. Global admins are not exempt.';

create trigger guard_games_league_hcp
  before insert or update of hcp_allowance_pct, hcp_max_strokes on public.games
  for each row
  execute function public.guard_games_league_hcp();

revoke execute on function public.guard_games_league_hcp() from public, anon, authenticated;
