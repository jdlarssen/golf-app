-- 0148_putts_backfill.sql
--
-- Feature #1290 (del B): let a player back-fill FORGOTTEN putt counts after the
-- game is finished. Strokes freeze at finish (the `scores update by flight`
-- policy requires an active game), so a putt the player never entered used to be
-- lost forever — the round fell permanently out of the Putte-statistikk panel and
-- manual service-role SQL was the only recovery. This migration opens a single,
-- tightly-scoped crack in the freeze: putts-only, own rows, finished games.
--
-- Two DB-layer pieces (trap 3 — the rule lives in the database, not just TS):
--
--   1. A NEW permissive RLS UPDATE policy that ADDS a path for
--      «own row · finished game · not withdrawn». Permissive policies OR together,
--      so this widens UPDATE access without touching the existing active-game
--      policy. Its WITH CHECK deliberately does NOT require `entered_by = auth.uid()`
--      (the existing policy does): a flight-mate may have entered the strokes, and
--      the player must still be able to back-fill their own putts. The column-guard
--      trigger below is what keeps that from becoming a hijack vector.
--
--   2. A BEFORE UPDATE column-guard trigger `guard_scores_finished_putts_only`:
--      on a FINISHED game, any non-service-role writer may change ONLY `putts`.
--      Every other column (strokes, entered_by, client_updated_at, …) must be
--      byte-identical (allowlist-by-subtraction, same jsonb-diff pattern as the
--      game_players peer guard in 0147 — future columns are protected by default).
--      This holds even against a hostile direct PostgREST PATCH, so the server
--      action can use a plain authenticated client (RLS + trigger are the vakt).
--
-- Interaction with the existing scores triggers/policies:
--   • guard_scores_self_update (0109) also fires BEFORE UPDATE. It only inspects
--     client_updated_at; a putts-only back-fill leaves that column untouched, so
--     it passes both guards. The two triggers are independent pure validators, so
--     firing order between them is irrelevant.
--   • The back-fill server action MUST NOT touch client_updated_at — leaving the
--     LWW key untouched means a delayed offline sync of stale strokes can never
--     lose to (or be lost to) the back-fill, and 0109 stays satisfied.
--
-- ⚠ Admin tightening (documented per the #1290 del B contract):
--   The existing `scores update by flight` policy lets is_admin() through on a
--   finished game (the is_admin() branch skips the active-game check). This trigger
--   now restricts admins to putts-only on finished games TOO — it bypasses only the
--   service role (auth.uid() IS NULL), not is_admin(). This is safe: admin score
--   corrections go through reopenGame (status → active) first, where this guard
--   no-ops. Bulk ops fixes still run as the service role and bypass entirely.
--
-- ⚠ Apply to STAGING first, verify (see supabase/tests/scores_putts_backfill_rls_test.sql),
--   THEN prod behind the owner gate (per CLAUDE.md DB discipline). This migration is
--   delivered staging-verified only; prod application is an explicit remaining step.

-- ── 1) Permissive UPDATE policy: own putts on a finished game ────────────────────
create policy "scores backfill own putts when finished" on public.scores
  for update
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.games g
      where g.id = public.scores.game_id and g.status = 'finished'
    )
    and not exists (
      select 1 from public.game_players gp
      where gp.game_id = public.scores.game_id
        and gp.user_id = (select auth.uid())
        and gp.withdrawn_at is not null
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.games g
      where g.id = public.scores.game_id and g.status = 'finished'
    )
    and not exists (
      select 1 from public.game_players gp
      where gp.game_id = public.scores.game_id
        and gp.user_id = (select auth.uid())
        and gp.withdrawn_at is not null
    )
  );

-- ── 2) Column-guard trigger: only putts may change on a finished game ────────────
create or replace function public.guard_scores_finished_putts_only()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  declare
    v_status public.game_status;
  begin
    -- Service-role writes (no JWT → auth.uid() IS NULL) bypass: bulk ops fixes.
    if auth.uid() is null then
      return new;
    end if;

    -- Only engage on finished games. On active games the existing write policies
    -- + the 0109 LWW guard govern; strokes/putts flow through the normal sync RPC.
    select g.status into v_status
      from public.games g
     where g.id = new.game_id;

    if v_status is distinct from 'finished' then
      return new;
    end if;

    -- On a finished game: allowlist-by-subtraction. Every column EXCEPT putts must
    -- be unchanged. Protects strokes, entered_by, client_updated_at, user_id, … and
    -- any column added later. Applies to admins too (see header note).
    if (to_jsonb(new) - 'putts') is distinct from (to_jsonb(old) - 'putts') then
      raise exception
        'On a finished game only putts may be changed (scores back-fill guard, #1290)'
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    end if;

    return new;
  end;
$$;

comment on function public.guard_scores_finished_putts_only() is
  '#1290: on a finished game, restricts every non-service-role writer (players AND '
  'admins) to changing ONLY scores.putts — the post-round putt back-fill. Bypasses '
  'the service role (auth.uid() IS NULL) for ops fixes. No-ops on active games.';

drop trigger if exists guard_scores_finished_putts_only on public.scores;
create trigger guard_scores_finished_putts_only
  before update on public.scores
  for each row
  execute function public.guard_scores_finished_putts_only();
