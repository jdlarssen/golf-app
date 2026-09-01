-- 0171_finish_pipeline_index_excludes_derived.sql
-- =============================================================================
-- #1856 (native N6c) - corrects the finish-pipeline sweep's partial index so it
-- matches the sweep's real candidate set.
--
-- WHAT WAS WRONG. 0169 created games_finish_pipeline_pending_idx over
--   status = 'finished' and finish_pipeline_at is null and tournament_id is null
-- but the sweep must ALSO exclude derived games (source_game_id is not null,
-- the per-match games a cup host fans out to, #1441 D3). Their host's tail
-- finishes them through finishDerivedGames, which writes only
-- {status, ended_at} and never touches the marker, so every derived game is
-- born matching the first two predicates. tournament_id does not cover them
-- either: games_tournament_id_fkey is ON DELETE SET NULL (verified live on
-- staging), so deleting a cup nulls tournament_id across its whole match tree
-- and turns every match into a sweep candidate. Each one swept would re-run the
-- FULL tail with the cup's suppressPerGameNotifications unset: a per-match
-- "Resultatet er klart" mail to the same players, a billed Anthropic round
-- report per match, and duplicate audit rows.
--
-- ONE RULE, THREE HOMES (AGENTS.md trap #4). The candidate set is written out in
-- three places and they must stay identical:
--   1. app/api/cron/finish-pipeline/route.ts - the route's own query
--   2. 0170's cron.schedule EXISTS gate
--   3. this index
-- Change one, change all three in the same commit.
--
-- WHY A NEW MIGRATION INSTEAD OF EDITING 0169. 0169 is already applied to
-- staging (schema_migrations 20260901184933). An applied migration is history;
-- corrections come as new files. Prod, which has neither yet, simply gets the
-- 0169 index and then this replacement - the end state is identical either way.
--
-- Safe to apply whenever 0169 is applied, and required before 0170 goes live:
-- without it the per-minute EXISTS gate degrades to a table scan the moment a
-- derived game exists, and it keeps firing the route for rows the route now
-- (correctly) refuses to sweep.
-- =============================================================================

drop index if exists public.games_finish_pipeline_pending_idx;

create index if not exists games_finish_pipeline_pending_idx
  on public.games (id)
  where status = 'finished'
    and finish_pipeline_at is null
    and tournament_id is null
    and source_game_id is null;
