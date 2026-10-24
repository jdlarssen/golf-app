-- 0213_league_sim_settings_options.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- #2638: the round settings of a simulator league are Trackman's own choices,
-- not free text (the owner, 24.10: «samme alternativene, ikke at det skal
-- skrives inn manuelt, det må være valg»). 0212 bounded the two jsonb columns
-- (object, at most 2 000 characters); this adds the option set itself.
--
-- sim_settings_valid(s) is the SQL mirror of the list in
-- lib/league/simSettings.ts (one home there; simSettings.test.ts parses this
-- file and fails if the two drift apart):
--   - every key is one of the eight settings and every value one of its
--     option codes (strings only);
--   - the gimme coupling: when both putting and gimme are in the object, a
--     putting that makes Trackman lock the gimme (Auto - Tour Pro, Auto - By
--     HCP, Auto - Fixed) goes with NOT_APPLICABLE, and every other putting
--     with a distance. A round override that holds putting alone passes: its
--     gimme comes from the league default (the app validates the merged
--     values).
-- null passes, as before.
--
-- Some options are not confirmed yet (the contract addendum lists them). The
-- owner checks them on the simulator; a change is one edit in simSettings.ts
-- and one migration that replaces this function.
--
-- IMMUTABLE and with an empty search_path: it only reads its argument. It
-- stays executable by everyone, because a CHECK runs it as the writing role.
--
-- Direction (what does OLD code do with this applied?): old code never writes
-- sim_settings, and no row holds a value yet (checked on staging before the
-- apply), so nothing changes for it.
-- supabase/tests/league_simulator_test.sql covers the options and the rule.

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
    and (
      not (s ? 'putting' and s ? 'gimme')
      -- putting_locks_gimme: the putting values that lock gimme to NOT_APPLICABLE
      or ((s ->> 'putting') = any (array['AUTO_TOUR_PRO', 'AUTO_BY_HCP', 'AUTO_FIXED']))
         = ((s ->> 'gimme') = 'NOT_APPLICABLE')
    )
  )
$$;

comment on function public.sim_settings_valid(jsonb) is
  '#2638: the Trackman option set for league/round sim_settings and the gimme coupling. Mirror of lib/league/simSettings.ts (locked by simSettings.test.ts).';

alter table public.leagues
  add constraint leagues_sim_settings_options_check check (public.sim_settings_valid(sim_settings));

alter table public.league_rounds
  add constraint league_rounds_sim_settings_options_check check (public.sim_settings_valid(sim_settings));
