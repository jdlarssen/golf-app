-- 0178 (#1937): the two DELETE policies on game_players leave cup matches
-- (games.tournament_id is not null) alone.
--
-- Background: a deleted game_players row in a cup match before start silently
-- breaks the match — the side is short a player and auto-start blocks forever
-- (#1814). #1814 closed the server-action paths (withdrawFromGame answers
-- game_locked and routes to /cup/[id]/trekk), but RLS still let a direct
-- PostgREST DELETE through two branches:
--
--   "game_players self withdraw pre active" — a player deletes their OWN row
--     while the game is draft/scheduled.
--   "game_players creator delete" — games.created_by deletes ANY row. On cup
--     matches created_by is the cup organizer.
--
-- Both get `g.tournament_id IS NULL`. The legitimate ways out of a cup match —
-- the cup withdrawal (lib/cup/withdrawalActions.ts) and the player swap
-- (swapCupMatchPlayer) — write with the service role and never meet RLS.
-- A policy predicate rather than a BEFORE DELETE trigger for exactly that
-- reason: a trigger also fires for the service role and would need an
-- auth.uid()-is-null escape to keep the swap working.
--
-- Unchanged: the is_admin() branch, plain games, league rounds
-- (tournament_id null), roles and the (select auth.uid()) wrapping from 0092.
-- The using-expressions are copied from pg_policies on torny-staging
-- (2026-09-16) with only the tournament_id predicate added.
--
-- Test: supabase/tests/game_players_delete_cup_rls_test.sql.
--
-- Order against prod: migration first, then merge/deploy. Without it the app
-- still works (the roster guard in the same PR refuses cup matches up front),
-- but the direct DELETE stays open.

-- No explicit begin/commit: the migration runner wraps each file in one
-- transaction, so there is no window where a policy is dropped but not recreated.

drop policy if exists "game_players self withdraw pre active" on public.game_players;
create policy "game_players self withdraw pre active" on public.game_players for delete to public
  using (
    is_admin() OR (
      (user_id = (select auth.uid()))
      AND (EXISTS ( SELECT 1 FROM games g
                     WHERE g.id = game_players.game_id
                       AND g.tournament_id IS NULL
                       AND g.status = ANY (ARRAY['draft'::game_status, 'scheduled'::game_status])))
    )
  );

comment on policy "game_players self withdraw pre active" on public.game_players is
  'A player may delete their own row before start — not in a cup match (tournament_id set): leaving a cup match goes through the cup withdrawal (#1937, #1814).';

drop policy if exists "game_players creator delete" on public.game_players;
create policy "game_players creator delete" on public.game_players for delete to authenticated
  using (EXISTS ( SELECT 1 FROM games g
                   WHERE g.id = game_players.game_id
                     AND g.created_by = (select auth.uid())
                     AND g.tournament_id IS NULL));

comment on policy "game_players creator delete" on public.game_players is
  'The game creator may delete roster rows — not in a cup match (tournament_id set): the organizer swaps players via the cup instead (#1937, #1814).';
