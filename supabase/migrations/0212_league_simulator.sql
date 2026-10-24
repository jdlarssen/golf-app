-- 0212_league_simulator.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- #2638 Del 1: a league on a simulator (Trackman). Players take the round alone
-- when it suits them, and the organiser fixes the round settings (stimp, wind,
-- gimme …) that everyone plays under.
--
--   1. leagues.is_simulator — one switch for everything simulator-specific. A
--      simulator flight counts with one delivered player (lib/league/flightRules).
--   2. leagues.sim_settings — the league's DEFAULT round settings. Fixed label
--      keys with free-text values (lib/league/simSettings.ts is the key list and
--      the validator; this CHECK is the outer bound). Not locked: the organiser
--      may change the default during the season.
--   3. league_rounds.sim_settings — one round's OVERRIDE: only the keys that
--      differ from the default. null = the round follows the default. The start
--      core writes the effective values here when the first flight starts (the
--      freeze), so a later change of the default never moves a round that is in
--      play or done.
--   4. guard_leagues_locked_fields: once a league has left 'draft', scoring and
--      is_simulator cannot change, and the league cannot go back to 'draft' (that
--      would reopen the lock). Global admins are NOT exempt: the organiser of a
--      standalone league is a global admin, and the lock is there for the players.
--      Only the service role (auth.uid() is null) passes.
--   5. guard_league_rounds_sim_settings_lock: a round's sim_settings cannot change
--      once any game exists for the round (any status: delivered implies started),
--      so nobody in a round plays under other settings than the others. SECURITY
--      DEFINER so it sees every flight: under the games SELECT policy the
--      organiser cannot see other players' flights, and an invoker-rights check
--      would let every change through (#440 hostile-PATCH trap). The service role
--      passes, so the start core's freeze (admin client) works.
--
-- Both CHECKs bound the serialised JSON at 2 000 characters. The app's own
-- limits are far lower (60 per value, 300 for «Annet»); simSettings.test.ts
-- asserts that the largest object the validator can produce fits the CHECK.
--
-- Direction (what does OLD code do with this applied?): nothing changes. Old
-- code never reads or writes the new columns, the defaults keep every existing
-- league non-simulator with no settings, and no app path changes scoring or
-- is_simulator on an active league or sets a league back to 'draft'.
-- supabase/tests/league_simulator_test.sql covers the CHECKs and both guards.

alter table public.leagues
  add column is_simulator boolean not null default false,
  add column sim_settings jsonb null,
  add constraint leagues_sim_settings_check
    check (sim_settings is null or (jsonb_typeof(sim_settings) = 'object' and length(sim_settings::text) <= 2000));

comment on column public.leagues.is_simulator is
  '#2638: simulator league (Trackman). A flight counts with one delivered player. Locked once the league leaves draft (guard_leagues_locked_fields).';
comment on column public.leagues.sim_settings is
  '#2638: the league default round settings, {key: free text}. Keys and per-value limits: lib/league/simSettings.ts. Not locked.';

alter table public.league_rounds
  add column sim_settings jsonb null,
  add constraint league_rounds_sim_settings_check
    check (sim_settings is null or (jsonb_typeof(sim_settings) = 'object' and length(sim_settings::text) <= 2000));

comment on column public.league_rounds.sim_settings is
  '#2638: this round''s override of the league default (only differing keys; null = follows the default). Frozen to the effective values at the first start; locked once any game exists for the round (guard_league_rounds_sim_settings_lock).';

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
       or new.is_simulator is distinct from old.is_simulator then
      raise exception
        'leagues.scoring and is_simulator are locked once the league has started'
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
  '#2638: BEFORE UPDATE on leagues. After draft, scoring and is_simulator are fixed and status cannot return to draft. Only the service role (auth.uid() IS NULL) passes; global admins do not.';

revoke execute on function public.guard_leagues_locked_fields() from public, anon, authenticated;

create trigger guard_leagues_locked_fields
  before update on public.leagues
  for each row execute function public.guard_leagues_locked_fields();

create or replace function public.guard_league_rounds_sim_settings_lock()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  begin
    if auth.uid() is null
       or new.sim_settings is not distinct from old.sim_settings then
      return new;
    end if;

    if exists (select 1 from public.games g where g.league_round_id = old.id) then
      raise exception
        'league_rounds.sim_settings is locked once a player has started the round'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
  $$;

comment on function public.guard_league_rounds_sim_settings_lock() is
  '#2638: BEFORE UPDATE on league_rounds. sim_settings cannot change once any game exists for the round. SECURITY DEFINER so the check sees flights the caller cannot read under games RLS. Only the service role (auth.uid() IS NULL) passes.';

revoke execute on function public.guard_league_rounds_sim_settings_lock() from public, anon, authenticated;

create trigger guard_league_rounds_sim_settings_lock
  before update on public.league_rounds
  for each row execute function public.guard_league_rounds_sim_settings_lock();
