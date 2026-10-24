-- 0214_league_round_frozen_default.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- #2638: «Endret denne runden» marks only what the organiser changed for a
-- round (the orchestrator's ruling 24.10, after the approved artboard 8b).
--
-- 0212 froze a round by writing the effective values into
-- league_rounds.sim_settings at its first start. That kept the values right
-- but lost which keys the organiser had overridden: once the default changed
-- (stimp 9 → 10), every played round looked «changed». Now the round keeps
-- two things apart:
--   - sim_settings: the organiser's override, as before (locked at start);
--   - sim_frozen_default (new): the league default as it stood at the round's
--     first start. The start core writes it with the admin client while no
--     game exists for the round. What a round shows is the override over the
--     frozen default (lib/league/simSettings.ts roundSimSettings), and only the
--     override's keys are marked.
--
-- guard_league_rounds_sim_settings_lock (0212) is replaced: besides the round
-- lock, only the server (auth.uid() is null) may write sim_frozen_default, on
-- insert or update. A second trigger runs the same function on insert, so an
-- organiser cannot create a round with a frozen default either.
--
-- Direction (what does OLD code do with this applied?): the old start core
-- still writes its effective values into sim_settings and never touches the
-- new column; the old display reads only sim_settings. Nothing breaks; staging
-- is the only place rounds were frozen the old way.
-- supabase/tests/league_simulator_test.sql covers the column, its CHECK and
-- both guards (cases 26–30).

alter table public.league_rounds
  add column sim_frozen_default jsonb null,
  add constraint league_rounds_sim_frozen_default_check
    check (
      sim_frozen_default is null
      or (
        jsonb_typeof(sim_frozen_default) = 'object'
        and length(sim_frozen_default::text) <= 2000
        and public.sim_settings_valid(sim_frozen_default)
      )
    );

comment on column public.league_rounds.sim_frozen_default is
  '#2638: the league default round settings as they stood at the round''s first start, written by the start core only (guard_league_rounds_sim_settings_lock). The round shows sim_settings (the override) over this.';

comment on column public.league_rounds.sim_settings is
  '#2638: this round''s override of the league default (only differing keys; null = follows the default). Locked once any game exists for the round (guard_league_rounds_sim_settings_lock). The default it is shown over after the first start is sim_frozen_default (0214).';

create or replace function public.guard_league_rounds_sim_settings_lock()
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
      if new.sim_frozen_default is not null then
        raise exception
          'league_rounds.sim_frozen_default is set by the server only'
          using errcode = 'insufficient_privilege';
      end if;
      return new;
    end if;

    if new.sim_frozen_default is distinct from old.sim_frozen_default then
      raise exception
        'league_rounds.sim_frozen_default is set by the server only'
        using errcode = 'insufficient_privilege';
    end if;

    if new.sim_settings is distinct from old.sim_settings
       and exists (select 1 from public.games g where g.league_round_id = old.id) then
      raise exception
        'league_rounds.sim_settings is locked once a player has started the round'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
  $$;

comment on function public.guard_league_rounds_sim_settings_lock() is
  '#2638: BEFORE INSERT/UPDATE on league_rounds. Only the server (auth.uid() IS NULL) writes sim_frozen_default; sim_settings cannot change once any game exists for the round. SECURITY DEFINER so the check sees flights the caller cannot read under games RLS.';

revoke execute on function public.guard_league_rounds_sim_settings_lock() from public, anon, authenticated;

create trigger guard_league_rounds_frozen_default_insert
  before insert on public.league_rounds
  for each row execute function public.guard_league_rounds_sim_settings_lock();
