-- Adds the `scheduled` game status (venterom phase between draft and active),
-- a planned tee-off timestamp on games, and an optional course-length column
-- on tee_boxes.
--
-- Design: docs/plans/2026-05-11-empty-states-and-scheduled-status-design.md
--
-- IMPORTANT — paste-and-run notes for Supabase SQL Editor:
--   `alter type ... add value` cannot run inside a transaction block. Supabase
--   SQL Editor auto-wraps multi-statement scripts in a transaction, so the
--   enum extension is delivered as the first standalone statement and the
--   remaining schema/policy changes follow. If the dashboard rejects this as
--   a single run, execute the `alter type` line on its own first, then run
--   the rest as a second script.

-- 1. Extend game_status enum: add `scheduled` before `active`.
alter type game_status add value if not exists 'scheduled' before 'active';

-- 2. games.scheduled_tee_off_at — planned tee-off time, set when admin
--    publishes (status = scheduled). Used by countdown UI and auto-start
--    fallback.
alter table public.games
  add column scheduled_tee_off_at timestamptz;

comment on column public.games.scheduled_tee_off_at is
  'Planned tee-off time. Set when admin publishes (status=scheduled). Used by countdown UI and auto-start fallback.';

-- 3. tee_boxes.length_meters — total course length in meters from this
--    tee-box. Optional; shown on pre-round scorecard if set.
alter table public.tee_boxes
  add column length_meters int check (length_meters between 1000 and 12000);

comment on column public.tee_boxes.length_meters is
  'Total course length in meters from this tee-box. Optional; shown on pre-round scorecard if set.';

-- 4. RLS — player-visible reads on games / game_players / course_holes /
--    tee_boxes.
--
--    Audit result: none of these tables currently gate their SELECT policies
--    on `games.status`. Existing policies (from 0002_rls_policies.sql and
--    0003_fix_rls_recursion.sql):
--      - games:        "games select if participant or admin" — gates on
--                      participation only
--      - game_players: "game_players select shared game" — gates on
--                      is_in_game() (no status)
--      - course_holes: "holes select all" — using (true)
--      - tee_boxes:    "tees select all" — using (true)
--    Participants therefore already see games regardless of status, so the
--    new `scheduled` value is visible to them without any policy change.
--
--    Helper functions (is_admin, same_flight, is_in_game) also do not gate
--    on status, so nothing to update there either.
--
--    No drop/create-policy pairs are emitted for these four tables.
--    `scores` policies intentionally remain gated on `status = 'active'` —
--    players cannot enter scores during the venterom phase.
