-- 0215_league_sim_rules_review.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- #2638: the orchestrator's review of 0212–0214 (24.10). Four rules, each in
-- the database where a hand-made PATCH meets it, not only in the app:
--
--   1. Putting and gimme travel as a pair. sim_settings_valid (0213) checked
--      the gimme coupling only when both keys were in the object, so a round
--      override with putting alone passed and showed «Manual» with «Not
--      applicable» under a Tour Pro default. Now both or neither, and the
--      pair meets the coupling. The form always writes them together
--      (lib/league/simSettings.ts roundOverrideFrom), so nothing the app
--      writes changes. The function is replaced here; the list is unchanged.
--   2. The league format is locked after draft, beside scoring and
--      is_simulator (guard_leagues_locked_fields). A change from Stableford
--      to stroke play mid-season would re-score every played round.
--   3. In a simulator league, a started round keeps its course and tee
--      (guard_league_rounds_sim_settings_lock). The settings card shows the
--      round's tee; a change after the first start would show a tee the
--      flights did not play. Regular leagues are left as they are: an
--      organiser there can still correct a wrong tee (the orchestrator's
--      choice, 25.10).
--   4. The column comments from 0212 that still said «free text» are brought
--      up to date.
--
-- How the Trackman list changes (here and in every later migration that
-- replaces sim_settings_valid): FIRST rewrite the stored values that the new
-- rule refuses (leagues.sim_settings, league_rounds.sim_settings and
-- league_rounds.sim_frozen_default) to the nearest valid value, THEN replace
-- the function, in the same migration. Replacing a function a CHECK calls
-- does not re-check the rows already stored, so the order matters. Here the
-- nearest valid value for an unpaired object is the object without putting
-- and gimme: the round then follows the default's pair, and an empty override
-- becomes null («follows the default»). Staging had no such row on 25.10;
-- the rewrite runs anyway, so the pattern is in place.
--
-- Direction (what does OLD code do with this applied?): the old form writes
-- putting and gimme together and every default with all eight keys, never
-- changes format after draft, and its tee form on a started simulator round
-- now gets the lock error instead of a silent change. Nothing it does today
-- breaks.
-- supabase/tests/league_simulator_test.sql covers the four rules (cases 25,
-- 4, 31–36).

-- ── 1. The stored values first, then the rule ─────────────────────────────────

update public.league_rounds
   set sim_settings = nullif(sim_settings - 'putting' - 'gimme', '{}'::jsonb)
 where sim_settings is not null
   and (sim_settings ? 'putting') <> (sim_settings ? 'gimme');

update public.league_rounds
   set sim_frozen_default = sim_frozen_default - 'putting' - 'gimme'
 where sim_frozen_default is not null
   and (sim_frozen_default ? 'putting') <> (sim_frozen_default ? 'gimme');

update public.leagues
   set sim_settings = sim_settings - 'putting' - 'gimme'
 where sim_settings is not null
   and (sim_settings ? 'putting') <> (sim_settings ? 'gimme');

create or replace function public.sim_settings_valid(s jsonb)
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select s is null or (
    jsonb_typeof(s) = 'object'
    and not exists (
      select 1
        from jsonb_each(s) as e(key, value)
       where jsonb_typeof(e.value) <> 'string'
          or (e.key, e.value #>> '{}') not in (
            values
              -- Game
              ('pins', 'EASY'), ('pins', 'MEDIUM'), ('pins', 'HARD'),
              ('putting', 'AUTO_BY_HCP'), ('putting', 'AUTO_TOUR_PRO'), ('putting', 'AUTO_TWO_PUTT'),
              ('putting', 'AUTO_FIXED'), ('putting', 'MANUAL'), ('putting', 'MANUAL_AIMED'),
              ('putting', 'MANUAL_INPUT'),
              ('gimme', 'NOT_APPLICABLE'), ('gimme', 'FT4'), ('gimme', 'FT8'), ('gimme', 'FT12'),
              ('gimme', 'FT16'), ('gimme', 'FT20'),
              ('mulligans', 'NO'), ('mulligans', 'ALWAYS'),
              -- Course
              ('wind', 'OFF'), ('wind', 'CALM'), ('wind', 'BREEZY'), ('wind', 'STRONG_BREEZE'),
              ('wind', 'VARIABLE'), ('wind', 'GUSTY'), ('wind', 'WINDY'), ('wind', 'STORMY'),
              ('fairway_firmness', 'SOFT'), ('fairway_firmness', 'MEDIUM'), ('fairway_firmness', 'HARD'),
              ('green_firmness', 'SOFT'), ('green_firmness', 'MEDIUM'), ('green_firmness', 'HARD'),
              ('green_stimp', '6'), ('green_stimp', '7'), ('green_stimp', '8'), ('green_stimp', '9'),
              ('green_stimp', '10'), ('green_stimp', '11'), ('green_stimp', '12'), ('green_stimp', '13'),
              ('green_stimp', '14')
          )
    )
    -- putting_and_gimme_pair: both or neither
    and (s ? 'putting') = (s ? 'gimme')
    and (
      not (s ? 'putting')
      -- putting_locks_gimme: the putting values that lock gimme to NOT_APPLICABLE
      or ((s ->> 'putting') = any (array['AUTO_TOUR_PRO', 'AUTO_BY_HCP', 'AUTO_FIXED']))
         = ((s ->> 'gimme') = 'NOT_APPLICABLE')
    )
  )
$$;

comment on function public.sim_settings_valid(jsonb) is
  '#2638: the Trackman option set for league/round sim_settings, putting and gimme as a pair (0215) and the gimme coupling. Mirror of lib/league/simSettings.ts validSimSettings (locked by simSettings.test.ts, which reads the newest definition of this function).';

-- ── 2. The format is locked after draft ──────────────────────────────────────

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
       or new.is_simulator is distinct from old.is_simulator then
      raise exception
        'leagues.scoring, format and is_simulator are locked once the league has started'
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
  '#2638: BEFORE UPDATE on leagues. After draft, scoring, format (0215) and is_simulator are fixed and status cannot return to draft. Only the service role (auth.uid() IS NULL) passes; global admins do not.';

revoke execute on function public.guard_leagues_locked_fields() from public, anon, authenticated;

-- ── 3. A started simulator round keeps its course and tee ────────────────────

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
  '#2638: BEFORE INSERT/UPDATE on league_rounds. Only the server (auth.uid() IS NULL) writes sim_frozen_default; sim_settings cannot change once any game exists for the round, nor (0215) course_id and tee_box_id in a simulator league. SECURITY DEFINER so the check sees flights the caller cannot read under games RLS.';

revoke execute on function public.guard_league_rounds_sim_settings_lock() from public, anon, authenticated;

-- ── 4. The comments that still said «free text» ──────────────────────────────

comment on column public.leagues.sim_settings is
  '#2638: the league default round settings, {key: Trackman option code}, all eight keys. The list: lib/league/simSettings.ts; the CHECK: sim_settings_valid (0213, 0215). Not locked: a change reaches only rounds nobody has started.';

-- The format comment keeps its text from before #2638 and gains the lock.
comment on column public.leagues.format is
  'Liga-globalt spillformat. ''stroke'' = slagspill (mot-par, lavest best); ''stableford'' / ''modified_stableford'' = poeng-basert (høyest best). Sesong-tabellen aggregerer den native per-runde-verdien retnings-bevisst. Låst når ligaen forlater utkast (guard_leagues_locked_fields, 0215, #2638).';
