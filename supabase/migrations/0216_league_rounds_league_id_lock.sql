-- 0216_league_rounds_league_id_lock.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- #2638: the orchestrator's check of 0215 (25.10). A round stays in its
-- league. 0215 locks course and tee of a started round in a simulator league,
-- but the guard reads the league through old.league_id: an organiser of two
-- leagues could move a started simulator round to their regular league,
-- change the tee there and move it back. Now only the server (auth.uid() is
-- null) may change league_rounds.league_id. No app path moves a round: the
-- actions only insert rounds into a league and update other columns.
--
-- guard_league_rounds_sim_settings_lock (0214, 0215) is replaced; the only
-- change is the league_id check at the top of the UPDATE branch.
--
-- Direction (what does OLD code do with this applied?): old code never
-- writes league_id on an update, so nothing changes for it.
-- supabase/tests/league_simulator_test.sql covers the move (case 37).

create or replace function public.guard_league_rounds_sim_settings_lock()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  declare
    v_started boolean;
  begin
    if auth.uid() is null then
      return new;
    end if;

    if tg_op = 'INSERT' then
      if new.sim_frozen_default is not null then
        raise exception
          'league_rounds.sim_frozen_default is set by the server only'
          using errcode = 'insufficient_privilege';
      end if;
      return new;
    end if;

    if new.league_id is distinct from old.league_id then
      raise exception
        'league_rounds.league_id is set by the server only'
        using errcode = 'insufficient_privilege';
    end if;

    if new.sim_frozen_default is distinct from old.sim_frozen_default then
      raise exception
        'league_rounds.sim_frozen_default is set by the server only'
        using errcode = 'insufficient_privilege';
    end if;

    if new.sim_settings is not distinct from old.sim_settings
       and new.course_id is not distinct from old.course_id
       and new.tee_box_id is not distinct from old.tee_box_id then
      return new;
    end if;

    v_started := exists (select 1 from public.games g where g.league_round_id = old.id);
    if not v_started then
      return new;
    end if;

    if new.sim_settings is distinct from old.sim_settings then
      raise exception
        'league_rounds.sim_settings is locked once a player has started the round'
        using errcode = 'insufficient_privilege';
    end if;

    if exists (select 1 from public.leagues l where l.id = old.league_id and l.is_simulator) then
      raise exception
        'league_rounds.course_id and tee_box_id of a simulator league are locked once a player has started the round'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
  $$;

comment on function public.guard_league_rounds_sim_settings_lock() is
  '#2638: BEFORE INSERT/UPDATE on league_rounds. Only the server (auth.uid() IS NULL) writes sim_frozen_default and moves a round to another league (league_id, 0216); sim_settings cannot change once any game exists for the round, nor (0215) course_id and tee_box_id in a simulator league. SECURITY DEFINER so the check sees flights the caller cannot read under games RLS.';

revoke execute on function public.guard_league_rounds_sim_settings_lock() from public, anon, authenticated;
