-- supabase/tests/friend_requests_by_email_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Friend requests by e-mail, and who counts as a friend when a roster is filled
-- (migration 0252).
--
-- The surface:
--   1–3   the lookup runs for the service role only; a user session and anon
--         cannot call it
--   4     the old user-callable lookup is gone
--   5–8   the two address helpers run for the service role only
--
-- The lookup (the server, no JWT):
--   9     an address without an account                 → unknown, no row
--   10    the caller's own address                      → self, no row
--   11    an address with an account                    → requested
--   12    the same address again                        → already_pending, one row
--   13    the row is a pending request marked by_email
--
-- Who reads a request sent by e-mail:
--   14    the sender                                    → 0 rows
--   15    the person who received it                    → 1 row
--   16    the sender's withdrawal                       → not_found
--   17    the row is still there
--
-- A request that is not answered gives nothing:
--   18–19 is_invite_eligible, both directions           → false
--   20    roster_candidates for the sender              → not listed
--   21    the sender puts the person on an own roster   → refused
--   22    roster_candidates for the receiver            → not listed
--
-- The sender picks the same person from a list:
--   23    send_friend_request                           → requested
--   24    the sender now reads the request
--   25    still not invite-eligible
--   26    the sender withdraws it                       → removed
--
-- The answer:
--   27    declined                                      → the row is gone
--   28    accepted                                      → the sender reads it
--   29    invite-eligible
--   30    the sender puts the friend on an own roster   → ok
--   31    the lookup for a friend                       → already_friends
--   32    the lookup when the other person asked first  → accepted
--   33    the lookup for a deleted account              → unknown
--
-- Rig writes and assertions never share a statement (#1910).
--
-- Run via:  supabase test db   (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

\ir fixtures/rls_helpers.psql

-- A round the sender created (cleaned up by the rollback).
create or replace function torny_rls.fr_own_game() returns uuid
  language sql immutable as $$ select '00000000-0000-4000-a000-025200000001'::uuid $$;

select torny_rls.as_service();
select torny_rls.seed_active_game();
-- active_id is the sender. outsider_id shares no game with the sender.
insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by)
  values (torny_rls.fr_own_game(), 'FR Own Game', torny_rls.course_id(),
          torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.active_id());

-- ── 1–8: the surface ─────────────────────────────────────────────────────────
select ok(not has_function_privilege('authenticated', 'public.friend_request_by_email(uuid,text)', 'EXECUTE'),
  '1: a user session cannot call the lookup');
select ok(not has_function_privilege('anon', 'public.friend_request_by_email(uuid,text)', 'EXECUTE'),
  '2: anon cannot call the lookup');
select ok(has_function_privilege('service_role', 'public.friend_request_by_email(uuid,text)', 'EXECUTE'),
  '3: the service role calls the lookup');
select hasnt_function('public', 'send_friend_request_by_email', array['text'],
  '4: the old user-callable lookup is gone');
select ok(not has_function_privilege('authenticated', 'public.email_is_registered(text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.email_is_registered(text)', 'EXECUTE'),
  '5: a user session and anon cannot call email_is_registered');
select ok(has_function_privilege('service_role', 'public.email_is_registered(text)', 'EXECUTE'),
  '6: the service role calls email_is_registered');
select ok(not has_function_privilege('authenticated', 'public.email_is_in_auth_users(text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.email_is_in_auth_users(text)', 'EXECUTE'),
  '7: a user session and anon cannot call email_is_in_auth_users');
select ok(has_function_privilege('service_role', 'public.email_is_in_auth_users(text)', 'EXECUTE'),
  '8: the service role calls email_is_in_auth_users');

-- ── 9–13: the lookup ─────────────────────────────────────────────────────────
select is(
  public.friend_request_by_email(torny_rls.active_id(), 'nobody-0252@example.test'),
  jsonb_build_object('outcome', 'unknown', 'target_id', null),
  '9: an address without an account → unknown');
select is(
  public.friend_request_by_email(torny_rls.active_id(), ' RLS-Active@Example.test ')->>'outcome',
  'self',
  '10: the caller''s own address → self');
select is(
  public.friend_request_by_email(torny_rls.active_id(), 'RLS-Outsider@example.test'),
  jsonb_build_object('outcome', 'requested', 'target_id', torny_rls.outsider_id()),
  '11: an address with an account → requested');
select is(
  public.friend_request_by_email(torny_rls.active_id(), 'rls-outsider@example.test')->>'outcome',
  'already_pending',
  '12: the same address again → already_pending');
select is(
  (select array_agg(status || ':' || by_email::text) from public.friendships
    where requester_id = torny_rls.active_id()),
  array['pending:true'],
  '13: one row, a pending request marked by_email');

-- ── 14–17: who reads it ──────────────────────────────────────────────────────
select torny_rls.as_user(torny_rls.active_id());
select is(
  (select count(*)::int from public.friendships),
  0,
  '14: the sender does not read the request');
select torny_rls.as_user(torny_rls.outsider_id());
select is(
  (select count(*)::int from public.friendships where requester_id = torny_rls.active_id()),
  1,
  '15: the person who received it reads it');
select torny_rls.as_user(torny_rls.active_id());
select is(public.remove_friend(torny_rls.outsider_id()), 'not_found',
  '16: the sender''s withdrawal → not_found');
select torny_rls.as_service();
select is(
  (select count(*)::int from public.friendships
    where requester_id = torny_rls.active_id() and addressee_id = torny_rls.outsider_id()),
  1,
  '17: the row is still there');

-- ── 18–22: a request that is not answered gives nothing ─────────────────────
select ok(not public.is_invite_eligible(torny_rls.active_id(), torny_rls.outsider_id(), null),
  '18: the sender is not invite-eligible for the receiver');
select ok(not public.is_invite_eligible(torny_rls.outsider_id(), torny_rls.active_id(), null),
  '19: the receiver is not invite-eligible for the sender');
select torny_rls.as_user(torny_rls.active_id());
select ok(
  not exists (select 1 from public.roster_candidates() r where r.id = torny_rls.outsider_id()),
  '20: the receiver is not in the sender''s roster candidates');
select throws_like(
  $$ insert into public.game_players (game_id, user_id)
     values (torny_rls.fr_own_game(), torny_rls.outsider_id()) $$,
  '%not invite-eligible%',
  '21: the sender cannot put the receiver on an own roster');
select torny_rls.as_user(torny_rls.outsider_id());
select ok(
  not exists (select 1 from public.roster_candidates() r where r.id = torny_rls.active_id()),
  '22: the sender is not in the receiver''s roster candidates');

-- ── 23–26: the sender picks the same person from a list ─────────────────────
select torny_rls.as_user(torny_rls.active_id());
select is(public.send_friend_request(torny_rls.outsider_id()), 'requested',
  '23: send_friend_request for the same person → requested');
select is(
  (select array_agg(status || ':' || by_email::text) from public.friendships
    where addressee_id = torny_rls.outsider_id()),
  array['pending:false'],
  '24: the sender now reads the request');
select ok(not public.is_invite_eligible(torny_rls.active_id(), torny_rls.outsider_id(), null),
  '25: a request the sender reads is still not invite-eligible');
select is(public.remove_friend(torny_rls.outsider_id()), 'removed',
  '26: the sender withdraws a request the sender reads');

-- ── 27–33: the answer ────────────────────────────────────────────────────────
select torny_rls.as_service();
select public.friend_request_by_email(torny_rls.active_id(), 'rls-outsider@example.test');
select torny_rls.as_user(torny_rls.outsider_id());
select public.respond_friend_request(
  (select id from public.friendships where requester_id = torny_rls.active_id()), false);
select torny_rls.as_service();
select is(
  (select count(*)::int from public.friendships
    where requester_id = torny_rls.active_id() and addressee_id = torny_rls.outsider_id()),
  0,
  '27: declined → the row is gone');

select public.friend_request_by_email(torny_rls.active_id(), 'rls-outsider@example.test');
select torny_rls.as_user(torny_rls.outsider_id());
select public.respond_friend_request(
  (select id from public.friendships where requester_id = torny_rls.active_id()), true);
select torny_rls.as_user(torny_rls.active_id());
select is(
  (select array_agg(status) from public.friendships where addressee_id = torny_rls.outsider_id()),
  array['accepted'],
  '28: accepted → the sender reads the friendship');
select ok(public.is_invite_eligible(torny_rls.active_id(), torny_rls.outsider_id(), null),
  '29: an accepted friendship is invite-eligible');
select lives_ok(
  $$ insert into public.game_players (game_id, user_id)
     values (torny_rls.fr_own_game(), torny_rls.outsider_id()) $$,
  '30: the sender puts the friend on an own roster');
select torny_rls.as_service();
select is(
  public.friend_request_by_email(torny_rls.active_id(), 'rls-outsider@example.test')->>'outcome',
  'already_friends',
  '31: the lookup for a friend → already_friends');

-- flightmate_id asked active_id first; active_id then adds flightmate by e-mail.
insert into public.friendships (requester_id, addressee_id, status)
  values (torny_rls.flightmate_id(), torny_rls.active_id(), 'pending');
select is(
  public.friend_request_by_email(torny_rls.active_id(), 'rls-flightmate@example.test')->>'outcome',
  'accepted',
  '32: the other person asked first → accepted');

update public.users set deleted_at = now() where id = torny_rls.submitted_id();
select is(
  public.friend_request_by_email(torny_rls.active_id(), 'rls-submitted@example.test')->>'outcome',
  'unknown',
  '33: a deleted account → unknown');

select * from finish();

rollback;
