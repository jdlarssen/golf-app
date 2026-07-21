-- supabase/tests/games_invitations_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS integration test for the #414-consolidated read/register policies on the
-- highest-risk tables: games, game_players, invitations. Added alongside #412 +
-- #414 (migration 0092) which merged the standalone admin-ALL policies into the
-- per-cmd self/participant policies. This file proves the EFFECTIVE access set
-- on those tables is unchanged post-0092 — not just that the migration applies.
--
-- Reuses the #440 rig primitives in fixtures/rls_helpers.psql (same seed graph +
-- impersonation path the score-write suite uses). Runs as the `authenticated`
-- role with a forged JWT `sub`/`email`, so the SECURITY DEFINER helpers
-- (is_admin / is_in_game) and the new merged quals execute exactly as in prod.
--
-- Coverage:
--   games SELECT          — participant CAN, outsider CANNOT, admin CAN
--   game_players SELECT   — participant CAN, outsider CANNOT, admin CAN
--   game_players INSERT   — self-register-open path: self into an open draft CAN;
--                           self into an active game CANNOT; into someone else
--                           CANNOT; admin CAN.
--   invitations SELECT    — own incoming by email CAN, another's CANNOT, admin CAN
--
-- Run via:  supabase test db   (or the psql path-B in README.md).
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

\ir fixtures/rls_helpers.psql

-- ── Seed: the standard active game (admin + 5 players + 1 outsider) ───────────
select torny_rls.as_service();
select torny_rls.seed_active_game();

-- ── Extra fixtures this suite needs, seeded as the service role ───────────────
-- (1) An OPEN-registration DRAFT game the outsider can self-register into. Uses
--     the same course/tee fixtures so no extra FK targets are needed.
-- (2) Two invitations: one addressed to the outsider's email (their incoming),
--     one addressed to the active player's email (someone else's, from the
--     outsider's POV).
select set_config('role', 'postgres', true);

-- created_by = outsider so the self-register policy's EXISTS-on-games subquery
-- (which runs under the *inserting* user's RLS context) can see the row. A user
-- self-registering into an open game in practice reaches it through a path where
-- the game is already visible to them (creator / shared link); the creator case
-- is the deterministic one to seed. This is unchanged by 0092.
insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, registration_mode)
  values ('00000000-0000-4000-a000-0000000000a1', 'RLS Open Draft',
          torny_rls.course_id(), torny_rls.tee_box_id(),
          'draft', 'solo_strokeplay', torny_rls.outsider_id(), 'open');

-- An open DRAFT game created by the ADMIN. Used for: (a) a non-creator/non-admin
-- (the active player, a participant of the *other* game but not of this one and
-- not its creator) cannot register a DIFFERENT user here; (b) admin CAN insert
-- any player. The admin player is also a participant elsewhere, so they can see
-- their own created game via the admin branch.
insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, registration_mode)
  values ('00000000-0000-4000-a000-0000000000a4', 'RLS Admin Open Draft',
          torny_rls.course_id(), torny_rls.tee_box_id(),
          'draft', 'solo_strokeplay', torny_rls.admin_id(), 'open');

insert into public.invitations (email, token, invited_by, expires_at, game_id)
  values
    ('rls-outsider@example.test', 'tok-outsider', torny_rls.admin_id(), now() + interval '7 days', null),
    ('rls-active@example.test',   'tok-active',   torny_rls.admin_id(), now() + interval '7 days', null);

-- A helper to probe game_players self-register INSERT and games/invitations SELECT
-- visibility under the current impersonation. Lives in torny_rls so it inherits
-- the schema grants from the fixtures file.
create or replace function torny_rls.try_insert_self_player(p_game uuid) returns boolean
  language plpgsql as $$
  declare v_actor uuid := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
  begin
    insert into public.game_players (game_id, user_id, team_number, flight_number)
      values (p_game, v_actor, 1, 1);
    return true;
  exception when insufficient_privilege then return false;
  end; $$;

create or replace function torny_rls.try_insert_player_for(p_game uuid, p_target uuid) returns boolean
  language plpgsql as $$
  begin
    insert into public.game_players (game_id, user_id, team_number, flight_number)
      values (p_game, p_target, 2, 2);
    return true;
  exception when insufficient_privilege then return false;
  end; $$;

create or replace function torny_rls.can_see_game(p_game uuid) returns boolean
  language sql stable as $$
    select exists (select 1 from public.games where id = p_game);
  $$;

create or replace function torny_rls.can_see_player(p_game uuid, p_user uuid) returns boolean
  language sql stable as $$
    select exists (select 1 from public.game_players where game_id = p_game and user_id = p_user);
  $$;

create or replace function torny_rls.can_see_invite_email(p_email text) returns boolean
  language sql stable as $$
    select exists (select 1 from public.invitations where email = p_email and game_id is null);
  $$;

-- as_user_email(uid, email): impersonate like as_user() but also carry an `email`
-- claim, since the invitations "select own incoming" policy keys off
-- auth.jwt() ->> 'email'. Mirrors the GoTrue JWT shape (sub + role + email).
create or replace function torny_rls.as_user_email(p_uid uuid, p_email text) returns void
  language plpgsql as $$
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', 'authenticated', 'email', p_email)::text,
      true);
  end; $$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- games SELECT — participant CAN, outsider CANNOT, admin CAN
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());
select ok( torny_rls.can_see_game(torny_rls.game_id()),
  'participant CAN select their active game' );

select torny_rls.as_user(torny_rls.outsider_id());
select ok( not torny_rls.can_see_game(torny_rls.game_id()),
  'outsider CANNOT select a game they are not in' );

select torny_rls.as_user(torny_rls.admin_id());
select ok( torny_rls.can_see_game(torny_rls.game_id()),
  'admin CAN select any game' );

-- ═════════════════════════════════════════════════════════════════════════════
-- game_players SELECT — participant CAN, outsider CANNOT, admin CAN
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());
select ok( torny_rls.can_see_player(torny_rls.game_id(), torny_rls.flightmate_id()),
  'participant CAN see a co-player row in their shared game' );

select torny_rls.as_user(torny_rls.outsider_id());
select ok( not torny_rls.can_see_player(torny_rls.game_id(), torny_rls.active_id()),
  'outsider CANNOT see game_players rows of a game they are not in' );

select torny_rls.as_user(torny_rls.admin_id());
select ok( torny_rls.can_see_player(torny_rls.game_id(), torny_rls.active_id()),
  'admin CAN see any game_players row' );

-- ═════════════════════════════════════════════════════════════════════════════
-- game_players INSERT — self-register-open path
-- ═════════════════════════════════════════════════════════════════════════════

-- Outsider self-registers into the OPEN DRAFT game → allowed.
select torny_rls.as_user(torny_rls.outsider_id());
select ok( torny_rls.try_insert_self_player('00000000-0000-4000-a000-0000000000a1'::uuid),
  'self CAN register into an open draft game' );

-- The active player (not the creator, not a participant of, and not admin over
-- the ADMIN-owned open draft) tries to self-register into it → blocked. They
-- cannot satisfy the self-register EXISTS-on-games subquery for a game they
-- cannot see, and the creator/admin branches don't apply. This is the real
-- production block on registering into someone else's open game.
select torny_rls.as_user(torny_rls.active_id());
select ok( not torny_rls.try_insert_self_player('00000000-0000-4000-a000-0000000000a4'::uuid),
  'self CANNOT register into an open game they are not creator/participant of' );

-- A non-creator, non-admin (the active player) tries to register SOMEONE ELSE
-- into the admin-owned open draft → blocked. Self-register needs
-- user_id = auth.uid(); creator-insert needs them to own the game; neither holds.
select torny_rls.as_user(torny_rls.active_id());
select ok( not torny_rls.try_insert_player_for('00000000-0000-4000-a000-0000000000a4'::uuid, torny_rls.flightmate_id()),
  'a non-creator/non-admin CANNOT register a different user' );

-- Admin inserts another player into the admin-owned open draft → allowed (admin branch).
select torny_rls.as_user(torny_rls.admin_id());
select ok( torny_rls.try_insert_player_for('00000000-0000-4000-a000-0000000000a4'::uuid, torny_rls.flightmate_id()),
  'admin CAN insert any player into a game' );

-- ═════════════════════════════════════════════════════════════════════════════
-- invitations SELECT — own incoming by email CAN, another's CANNOT, admin CAN
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user_email(torny_rls.outsider_id(), 'rls-outsider@example.test');
select ok( torny_rls.can_see_invite_email('rls-outsider@example.test'),
  'invitee CAN see their own incoming invitation (email match)' );

select torny_rls.as_user_email(torny_rls.outsider_id(), 'rls-outsider@example.test');
select ok( not torny_rls.can_see_invite_email('rls-active@example.test'),
  'invitee CANNOT see another person''s incoming invitation' );

select torny_rls.as_user_email(torny_rls.admin_id(), 'rls-admin@example.test');
select ok( torny_rls.can_see_invite_email('rls-active@example.test'),
  'admin CAN see any invitation' );

select * from finish();
rollback;
