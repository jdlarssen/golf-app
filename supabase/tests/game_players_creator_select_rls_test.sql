-- supabase/tests/game_players_creator_select_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS integration test: the game creator's SELECT branch on game_players
-- (#1595, migration 0160), end-to-end against real Postgres roles.
--
-- The bug: the only SELECT policy on game_players was
--   "game_players select shared game" → is_admin() OR is_in_game(game_id)
-- with no creator branch. Postgres requires the rows an UPDATE touches to pass
-- the SELECT policy as well, so a creator who does NOT play in their own game
-- matched 0 rows on every roster write — and PostgREST reports no error for a
-- 0-row UPDATE, so the approve button claimed success and wrote nothing.
--
--   NEW (0160):
--     1. non-participating creator SELECTs their own game's roster  → > 0 rows
--     2. …and sees the WHOLE roster (exact count, not a partial view)
--     3. non-participating creator runs the approve-shaped UPDATE    → 1 row
--     4. …and approved_at is actually set (not a silent 0-row no-op)
--
--   UNCHANGED (the additive policy must not widen anything else):
--     5. a stranger (not player, not creator, not admin) sees         → 0 rows
--     6. …and their approve-shaped UPDATE still matches               → 0 rows
--     7. an ordinary participant still sees the roster (is_in_game branch)
--
-- Runs as the `authenticated` role with a forged JWT `sub` claim — the same
-- runtime path the app uses — so the SECURITY DEFINER helpers (is_admin /
-- is_in_game) and the guard trigger execute exactly as in production. The
-- seeding role (postgres) BYPASSES RLS, so we explicitly SET ROLE authenticated
-- (torny_rls.as_user) before every authenticated probe.
--
-- Run via:  supabase test db   (boots local stack → applies migrations → here)
-- See supabase/tests/README.md (same rig + run-around as #440).
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

\ir fixtures/rls_helpers.psql

-- ── Probe helper (local to this suite) ───────────────────────────────────────
-- try_admin_approve(target): the current impersonated user runs the exact write
-- `adminApproveScorecard` performs — stamp approved_at / approved_by_user_id and
-- clear rejection_reason, filtered to a submitted, not-yet-approved row. TRUE if
-- a row updated, FALSE if RLS filtered it away (0 rows) or the guard trigger
-- rejected it (42501). The filters matter: they are what turned the RLS
-- blind spot into a "already approved" false success in #1595.
create or replace function torny_rls.try_admin_approve(p_target uuid) returns boolean
  language plpgsql as $$
  declare
    v_actor uuid := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
    v_rows  int;
  begin
    update public.game_players
       set approved_at = now(),
           approved_by_user_id = coalesce(v_actor, p_target),
           rejection_reason = null
     where game_id = torny_rls.game_id()
       and user_id = p_target
       and submitted_at is not null
       and approved_at is null;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
$$;

-- ── Seed ─────────────────────────────────────────────────────────────────────
-- seed_active_game() builds an ACTIVE game created_by admin_id with five players
-- (admin, active, flightmate, withdrawn, submitted); outsider_id is a user but
-- NOT on the roster. Two adjustments turn that into the #1595 constellation:
--
--   • created_by → outsider_id: a NON-ADMIN creator who does not play in their
--     own game — exactly the actor the missing SELECT branch locked out.
--   • withdrawn_id's roster row is deleted, promoting them to the "stranger"
--     control. Once outsider_id is the creator, every other fixture user is
--     either a participant or the global admin, so there is no unrelated
--     authenticated user left to assert the 0-row case with.
select torny_rls.as_service();
select torny_rls.seed_active_game();

update public.games set created_by = torny_rls.outsider_id()
  where id = torny_rls.game_id();

delete from public.game_players
  where game_id = torny_rls.game_id() and user_id = torny_rls.withdrawn_id();

-- ═════════════════════════════════════════════════════════════════════════════
-- UNCHANGED — a stranger sees nothing and writes nothing
-- ═════════════════════════════════════════════════════════════════════════════
-- Asserted BEFORE the creator's approve below, so submitted_id is still
-- submitted-and-unapproved: a FALSE here means RLS blocked the write, not that
-- the row had already been approved out from under the filter.
select torny_rls.as_user(torny_rls.withdrawn_id());

select is(
  (select count(*) from public.game_players where game_id = torny_rls.game_id()),
  0::bigint,
  'a stranger (not player, not creator, not admin) still sees 0 game_players rows'
);

select ok(
  not torny_rls.try_admin_approve(torny_rls.submitted_id()),
  'a stranger still cannot approve a scorecard (0 rows — additive policy widened nothing)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- UNCHANGED — an ordinary participant still reads the roster
-- ═════════════════════════════════════════════════════════════════════════════
-- The is_in_game branch of "game_players select shared game" must survive the
-- new permissive policy (they OR together).
select torny_rls.as_user(torny_rls.active_id());

select ok(
  (select count(*) from public.game_players where game_id = torny_rls.game_id()) > 0,
  'an ordinary participant still sees the roster (is_in_game branch intact)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- NEW (0160) — the non-participating creator can read, and therefore write
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.outsider_id());

select ok(
  (select count(*) from public.game_players where game_id = torny_rls.game_id()) > 0,
  'non-participating creator CAN read their own game''s game_players rows (#1595)'
);

-- The whole roster, not a partial view: admin + active + flightmate + submitted
-- (withdrawn_id was removed above to serve as the stranger).
select is(
  (select count(*) from public.game_players where game_id = torny_rls.game_id()),
  4::bigint,
  'non-participating creator sees the FULL roster, not a subset'
);

select ok(
  torny_rls.try_admin_approve(torny_rls.submitted_id()),
  'non-participating creator CAN approve a submitted scorecard (1 row, not a silent no-op)'
);

-- Read back as the service role so this asserts the WRITE landed, independent of
-- whether the creator can see the row afterwards.
select torny_rls.as_service();

select isnt(
  (select approved_at from public.game_players
     where game_id = torny_rls.game_id() and user_id = torny_rls.submitted_id()),
  null,
  'the creator''s approve actually stamped approved_at in the database'
);

select * from finish();
rollback;
