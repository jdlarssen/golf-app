-- 0200 (#2258, PR 2): how a round starts — from the first tee or as a shotgun.
--
-- The terminliste shows «første start» or «shotgun» under the clock (the
-- design draws both; recommendation 2, accepted by the owner). Nothing in
-- `games` said how a round starts, so the organiser now ticks «Shotgun-start»
-- by the tee-off time in the wizard and when editing. Off by default.
--
-- The allowed values have one home in TypeScript (START_TYPES in
-- lib/games/startType.ts); lib/games/startType.test.ts asserts this CHECK
-- lists exactly those (trap 4).
--
-- Additive with a default: every existing round becomes 'first_tee', which
-- is what they all were. The table-level grants and the games RLS policies
-- cover the new column as they cover scheduled_tee_off_at; no column guard
-- trigger on games names columns, so none needs a change.
--
-- Order against prod: migration FIRST, then merge/deploy. The code on main
-- does not read or write the column. The new code against the old database
-- would fail: the discovery selects and the game insert/update name it.

alter table public.games
  add column start_type text not null default 'first_tee'
    constraint games_start_type_valid check (start_type in ('first_tee', 'shotgun'));

comment on column public.games.start_type is
  '#2258 (0200): how the round starts. first_tee (default) = from the first '
  'tee, shotgun = every group from its own hole at the same time. Set by the '
  'organiser with «Shotgun-start» in the wizard and the edit form; shown under '
  'the clock in the terminliste.';
