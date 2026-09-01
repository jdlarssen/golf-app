-- 0169_games_finish_pipeline_at.sql
-- =============================================================================
-- #1856 (native N6c) - idempotency marker for the server-side finish pipeline.
--
-- WHY THE COLUMN EXISTS
-- The native app can flip a game to 'finished' on its own (RLS already lets the
-- creator write every games column on their own game), but it can NEVER run the
-- tail that the web runs after the flip: game_players.score_differential is
-- service-role-only (0117), and result summaries, achievement notifications, the
-- AI round report and the "Resultatet er klart" mail need Next/Resend/Anthropic.
-- So the tail moves server-side into runFinishPipeline(), and a per-minute
-- pg_cron sweep (migration 0170 - POST-DEPLOY) picks up games the app finished
-- and runs it there. This column is the only thing that tells that sweep whether
-- a finished game still owes its tail.
--
-- Deliberately a marker, not a derived criterion. "Has a score_differential" or
-- "has a result_summary" cannot tell "web finished it and one best-effort step
-- failed" apart from "the app finished it and nothing has run yet" - and
-- re-running the tail double-sends notifications and re-bills an Anthropic call.
-- One extra column beats a guess.
--
-- WHY THE BACKFILL IS LOAD-BEARING
-- Without it, every game ever finished (33 on staging, 29 on prod when this was
-- written) matches the sweep's gate the minute 0170 lands: the whole history
-- would get its achievements re-notified, its finish mail re-sent and a fresh AI
-- round report billed per game. The backfill is the difference between a silent
-- no-op and a mass mailing.
--
-- coalesce(ended_at, now()): 8 finished games on staging have ended_at IS NULL
-- (e2e fixtures that set status straight through the service role; prod has 0
-- such rows today, but staging is where the sweep gets verified and the
-- generators keep making more). A plain "set finish_pipeline_at = ended_at"
-- would leave exactly those rows as sweep candidates - the failure the backfill
-- exists to prevent. The load-bearing property of the marker is NOT NULL ("no
-- tail is owed here"), not the exact instant, so a row with no ended_at is
-- marked at backfill time.
--
-- THE MARKER IS WON FIRST, NOT SET LAST
-- runFinishPipeline claims the row BEFORE doing any work, with the win-the-row
-- shape lib/notifications/autoStartBlocked.ts:67-82 already uses - status
-- predicate included, so a game reopened between the sweep's candidate read and
-- the claim cannot have its tail run against a live round:
--   .update({ finish_pipeline_at: now }).eq('status', 'finished')
--   .is('finish_pipeline_at', null).select('id').maybeSingle()
-- 0 rows back = another runner owns this game = return. That is at-most-once for
-- the steps that cannot survive a re-run: notifyAchievementUnlocks is a bare
-- INSERT and public.notifications has no unique index, and
-- generateAndPersistRoundReport bills a new Anthropic call on every pass.
-- Setting the marker last would be at-least-once, and a duplicate "Resultatet er
-- klart" mail is worse than a missing round report.
--
-- !! REOPENING A GAME MUST CLEAR THE MARKER. reopenGame (admin-only) nulls
-- finish_pipeline_at together with ended_at and round_report. Without that, a
-- corrected round that is finished a second time finds nothing to claim and
-- silently loses its entire tail - including the round report reopen just
-- deleted. The admin path passes the guard trigger below on its is_admin()
-- escape hatch, so no service-role client is needed there.
--
-- !! THE MARKER NEEDS THE ADMIN CLIENT. The guard trigger below rejects the write
-- from every non-admin authenticated caller - and the web's endGame path allows a
-- non-admin CREATOR (requireAdminOrCreator). Write the marker with
-- getAdminClient(), never with the caller's RLS client, or finishing a game as a
-- non-admin creator starts failing with SQLSTATE 42501.
--
-- !! DEPLOY ORDER: THIS MIGRATION GOES FIRST, BEFORE THE CODE IS MERGED.
-- The column is additive, so it is safe in the "nothing breaks" sense - but it
-- is NOT safe to apply late, and an earlier version of this header said it was.
-- Merging to main deploys to prod immediately, and the deployed code claims the
-- marker on EVERY web finish. Against a database without the column, PostgREST
-- answers 42703 (undefined column); claimFinishPipeline treats any error as
-- "not claimed" and returns false, so the whole tail is skipped - no result
-- summaries, no differentials, no achievements, no round report, no audit row
-- and no "Resultatet er klart" mail - while endGameCore still returns
-- { ok: true } and the organiser sees a perfectly normal finish. Silent, and
-- for every round finished in that window.
--
-- Then it gets permanent: the backfill below stamps every already-finished game
-- as done, so those orphaned rounds are invisible to the sweep the moment this
-- lands. There is no automatic second chance.
--
-- THE ORDER, IN FULL:
--   1. 0169 (this file) + 0171 (index correction) on prod, through the owner
--      gate (#1074). No code depends on them yet; nothing writes the column.
--   2. Merge -> Vercel deploys the code that claims the marker.
--   3. 0170 (the pg_cron job) LAST - it POSTs to /api/cron/finish-pipeline, so
--      applying it before step 2 makes every fire a 404.
--
-- NOTE ON THE INDEX BELOW: its predicate was corrected by migration 0171, which
-- drops and recreates it with `and source_game_id is null` so it keeps matching
-- the sweep's real candidate set (derived cup matches must be excluded). This
-- file is left as applied - see 0171's header.
-- =============================================================================

alter table public.games
  add column if not exists finish_pipeline_at timestamptz;

comment on column public.games.finish_pipeline_at is
  '#1856: when the server-side finish pipeline (runFinishPipeline) claimed this game. NULL on a finished game means the tail - score differentials, result summaries, achievements, round report, finish notifications and mail - has not run yet, which is exactly what the finish-pipeline-sweep cron looks for. Claimed BEFORE the work runs (win-the-row UPDATE ... IS NULL) so the non-idempotent steps run at most once. Written only by the service role and global admins; enforced by guard_games_finish_pipeline_at.';

-- Backfill: every already-finished game is declared done, so the sweep starts
-- with an empty candidate set instead of the entire history. See the header for
-- why coalesce() is here and not a bare ended_at.
update public.games
  set finish_pipeline_at = coalesce(ended_at, now())
  where status = 'finished'
    and finish_pipeline_at is null;

-- Partial index for the sweep gate, mirroring games_scheduled_tee_off_idx (0094)
-- and its rationale: the games table is small today, but this EXISTS gate runs
-- once a minute forever, so make it an index lookup that does not care how big
-- the table gets. The predicate is the sweep's gate verbatim, which keeps the
-- index to the handful of rows that actually owe a tail.
create index if not exists games_finish_pipeline_pending_idx
  on public.games (id)
  where status = 'finished'
    and finish_pipeline_at is null
    and tournament_id is null;

-- -- Guard trigger function ----------------------------------------------------
-- Mirrors guard_game_players_score_differential (0117), whose live body on both
-- staging and prod was dumped and diffed before this was written. SECURITY
-- DEFINER so public.is_admin() (which reads public.users) runs with definer
-- privileges; search_path = '' with every reference schema-qualified.
--
-- Why a trigger and not RLS: the "games creator update" policy (0071:29-33) is a
-- blanket per-row grant with no column list, so the creator can write every
-- column on their own game. The marker drives who gets notified and whether a
-- paid Anthropic call fires, so a client that can null it can force a re-run of
-- the whole tail. RLS cannot express "this one column is server-owned"; a
-- BEFORE trigger can.
--
-- One difference from 0117 on purpose: this guard covers INSERT as well as
-- UPDATE. 0117's is BEFORE UPDATE only, which leaves the creator free to set the
-- column at INSERT time - here that would let an organiser pre-mark a game and
-- permanently opt it out of the sweep. New guard, no legacy, so the hole is
-- closed from the start rather than inherited.
--
-- Note the escape covers anon too (auth.uid() is NULL for anon as well as for
-- the service role), exactly as 0117's does. That is safe because RLS is the
-- outer gate: no games policy grants anon INSERT or UPDATE.
create or replace function public.guard_games_finish_pipeline_at()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    -- Service role (admin client: runFinishPipeline, the cron sweep) carries no
    -- JWT sub, so auth.uid() is NULL. Global admins have full access per RLS.
    -- Both pass through unchanged.
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;

    if tg_op = 'INSERT' then
      if new.finish_pipeline_at is not null then
        raise exception
          'finish_pipeline_at is set by the server when the finish pipeline runs and cannot be set by a client (games.finish_pipeline_at)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;
      return new;
    end if;

    if new.finish_pipeline_at is distinct from old.finish_pipeline_at then
      raise exception
        'finish_pipeline_at is set by the server when the finish pipeline runs and cannot be changed by a client (games.finish_pipeline_at)'
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    end if;

    return new;
  end;
  $$;

comment on function public.guard_games_finish_pipeline_at() is
  '#1856: blocks any non-admin authenticated user from setting or changing games.finish_pipeline_at. The marker is claimed by the server (runFinishPipeline / the finish-pipeline-sweep cron) via the service role and decides whether the finish tail - notifications, mail and a billed Anthropic round-report call - runs again. No-ops for the service role (auth.uid() IS NULL) and global admins (is_admin()). Covers INSERT as well as UPDATE, unlike guard_game_players_score_differential (0117).';

-- -- Trigger --------------------------------------------------------------------
-- First non-internal trigger on public.games (verified against live staging and
-- prod before writing this: pg_trigger has no non-internal rows for the table),
-- so there was no existing BEFORE trigger to extend.
drop trigger if exists guard_games_finish_pipeline_at on public.games;
create trigger guard_games_finish_pipeline_at
  before insert or update on public.games
  for each row
  execute function public.guard_games_finish_pipeline_at();

-- Trigger functions never need client-callable EXECUTE - Postgres invokes them
-- through the trigger mechanism regardless of grants - and leaving the default
-- PUBLIC grant trips the security advisor (0137, and 0150 for the one function
-- that was added after 0137 and missed it).
revoke execute on function public.guard_games_finish_pipeline_at() from public, anon, authenticated;
