-- supabase/tests/upsert_score_frozen_reply_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- upsert_score_if_newer answers a locked card the same way on both paths (0245).
--
-- A delivered (submitted) or withdrawn player's card is locked by RLS. On the
-- UPDATE path the RPC already answered with an all-NULL row (#2211). On the
-- INSERT path — the first stroke on a hole — it raised 42501, so the offline
-- queue retried MAX_PERMANENT_ATTEMPTS times before it settled. Both paths now
-- give the all-NULL row, which `interpretUpsertReply` reads as 'refused'.
--
-- Unchanged: an active player's first stroke inserts, and an admin may still
-- write a locked card (RLS lets admins through; the RPC adds no rule of its own).
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

\ir fixtures/rls_helpers.psql

select torny_rls.as_service();
select torny_rls.seed_active_game();
-- An existing row for the submitted player on hole 2 (UPDATE path).
select torny_rls.seed_score(torny_rls.submitted_id(), 2);

-- call(target, hole): the impersonated user calls the RPC for target's hole.
-- Returns the reply's was_applied as text: 'null', 'true', 'false', or the
-- SQLSTATE when the call raised.
create or replace function torny_rls.call_upsert(p_target uuid, p_hole int) returns text
  language plpgsql as $$
  declare
    v_actor uuid := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
    r record;
  begin
    select * into r from public.upsert_score_if_newer(
      torny_rls.game_id(), p_target, p_hole, 4, coalesce(v_actor, p_target), now() + interval '1 second', null);
    return coalesce(r.was_applied::text, 'null');
  exception when others then return sqlstate;
  end;
$$;

-- ── Locked card, INSERT path: a clean all-NULL reply, no row ──────────────────
select torny_rls.as_user(torny_rls.submitted_id());
select is(torny_rls.call_upsert(torny_rls.submitted_id(), 1), 'null',
  'submitted player, first stroke on a hole: all-NULL reply, no error');

select torny_rls.as_user(torny_rls.withdrawn_id());
select is(torny_rls.call_upsert(torny_rls.withdrawn_id(), 1), 'null',
  'withdrawn player, first stroke on a hole: all-NULL reply, no error');

select torny_rls.as_user(torny_rls.active_id());
select is(torny_rls.call_upsert(torny_rls.submitted_id(), 3), 'null',
  'marker writing for a submitted flight-mate: all-NULL reply, no error');

select torny_rls.as_service();
select is(
  (select count(*)::int from public.scores
     where game_id = torny_rls.game_id()
       and user_id in (torny_rls.submitted_id(), torny_rls.withdrawn_id())
       and hole_number in (1, 3)),
  0,
  'no refused stroke was stored');

-- ── Locked card, UPDATE path: unchanged all-NULL reply ────────────────────────
select torny_rls.as_user(torny_rls.submitted_id());
select is(torny_rls.call_upsert(torny_rls.submitted_id(), 2), 'null',
  'submitted player, existing row: all-NULL reply (as before)');

-- ── Unchanged writes ──────────────────────────────────────────────────────────
select torny_rls.as_user(torny_rls.active_id());
select is(torny_rls.call_upsert(torny_rls.active_id(), 4), 'true',
  'active player, first stroke: inserted');

select torny_rls.as_user(torny_rls.admin_id());
select is(torny_rls.call_upsert(torny_rls.submitted_id(), 5), 'true',
  'admin may still write a submitted card');

-- ── Not swallowed: an error that is not a locked card still raises ────────────
select torny_rls.as_user(torny_rls.active_id());
select is(
  (select torny_rls.call_upsert(torny_rls.active_id(), 99)),
  '23514',
  'a CHECK violation (hole 99) still raises');

select * from finish();
rollback;
