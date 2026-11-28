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
--   9     the receipt helper is not callable through a user session
--
-- The lookup (the server, no JWT). Every address gets one receipt row:
--   10    an address without an account                 → unknown
--   11    the caller's own address                      → self
--   12    an address with an account                    → requested
--   13    the same address again                        → already_sent
--   14    one pending request marked by_email
--   15    one receipt row per address, none for the caller's own
--
-- The request and the receipt land together, or not at all:
--   16    a receipt that cannot be written              → the call fails
--   17    and leaves no request behind
--
-- Who reads a request sent by e-mail:
--   18    the sender                                    → 0 rows
--   19    the person who received it                    → 1 row
--   20    the sender's withdrawal                       → not_found
--   21    the row is still there
--
-- A request that is not answered gives nothing:
--   22–23 is_invite_eligible, both directions           → false
--   24    roster_candidates for the sender              → not listed
--   25    the sender puts the person on an own roster   → refused
--   26    roster_candidates for the receiver            → not listed
--
-- The sender picks the same person from a list:
--   27    send_friend_request                           → requested
--   28    the sender now reads the request
--   29    still not invite-eligible
--   30    the sender withdraws it                       → removed
--   31    the lookup with a request already waiting and no receipt → already_pending
--
-- The answer:
--   32    declined                                      → the request is gone
--   33    and the receipt is as it was written
--   34    accepted                                      → the sender reads it
--   35    and the receipt is marked accepted
--   36    invite-eligible
--   37    the sender puts the friend on an own roster   → ok
--   38    the lookup for a friend                       → already_friends
--   39    the lookup when the other person asked first  → accepted
--   40    the lookup for a deleted account              → unknown
--
-- The receipt mark, and who writes invitations:
--   41    a receipt for a person with an account is marked; one for an
--         address without an account is not
--   42    the lookup holds a lock for its sender and address until the
--         transaction ends
--   43    a user session and anon have no privilege on the marks
--   44    a player reads the marks                      → 42501
--   45    a player inserts a game-less invitation       → 42501
--   46    the same with a back-dated created_at         → 42501
--   47    a player invites to an own game with crafted created_at,
--         opened_at and accepted_at                     → ok
--   48    and the database set all three itself
--   49    a global admin inserts a game-less invitation through a user
--         session (the admin door)                      → ok
--
-- Rig writes and assertions never share a statement (#1910).
--
-- Run via:  supabase test db   (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(49);

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

-- ── 1–9: the surface ─────────────────────────────────────────────────────────
select ok(not has_function_privilege('authenticated', 'public.friend_request_by_email(uuid,text,text,timestamptz)', 'EXECUTE'),
  '1: a user session cannot call the lookup');
select ok(not has_function_privilege('anon', 'public.friend_request_by_email(uuid,text,text,timestamptz)', 'EXECUTE'),
  '2: anon cannot call the lookup');
select ok(has_function_privilege('service_role', 'public.friend_request_by_email(uuid,text,text,timestamptz)', 'EXECUTE'),
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

select ok(not has_function_privilege('authenticated', 'public.mark_email_receipt_accepted(uuid,uuid)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.mark_email_receipt_accepted(uuid,uuid)', 'EXECUTE'),
  '9: a user session and anon cannot call the receipt helper');

-- The lookup with a receipt that runs out in a week, as the server calls it.
create or replace function torny_rls.fr_lookup(p_email text, p_token text) returns jsonb
  language sql as $$
    select public.friend_request_by_email(torny_rls.active_id(), p_email, p_token, now() + interval '7 days')
  $$;
-- The sender's receipt rows, as 'address:accepted?:opened?'.
create or replace function torny_rls.fr_receipts() returns text[]
  language sql as $$
    select coalesce(array_agg(email || ':' || (accepted_at is not null)::text || ':' || (opened_at is not null)::text order by email), '{}')
      from public.invitations
     where invited_by = torny_rls.active_id() and game_id is null
  $$;

-- ── 10–15: the lookup ────────────────────────────────────────────────────────
select is(
  torny_rls.fr_lookup('Nobody-0252@example.test', 'fr-tok-1'),
  jsonb_build_object('outcome', 'unknown', 'target_id', null),
  '10: an address without an account → unknown');
select is(
  torny_rls.fr_lookup(' RLS-Active@Example.test ', 'fr-tok-2')->>'outcome',
  'self',
  '11: the caller''s own address → self');
select is(
  torny_rls.fr_lookup('RLS-Outsider@example.test', 'fr-tok-3'),
  jsonb_build_object('outcome', 'requested', 'target_id', torny_rls.outsider_id()),
  '12: an address with an account → requested');
select is(
  torny_rls.fr_lookup('rls-outsider@example.test', 'fr-tok-4'),
  jsonb_build_object('outcome', 'already_sent', 'target_id', null),
  '13: the same address again → already_sent');
select is(
  (select array_agg(status || ':' || by_email::text) from public.friendships
    where requester_id = torny_rls.active_id()),
  array['pending:true'],
  '14: one pending request marked by_email');
select is(
  torny_rls.fr_receipts(),
  array['nobody-0252@example.test:false:false', 'rls-outsider@example.test:false:false'],
  '15: one receipt row per address, none for the caller''s own');

-- ── 16–17: both land, or neither ─────────────────────────────────────────────
-- 'fr-tok-1' is taken (invitations.token is unique), so the receipt for the
-- flightmate's address cannot be written.
select throws_ok(
  $$ select torny_rls.fr_lookup('rls-flightmate@example.test', 'fr-tok-1') $$,
  '23505', null,
  '16: a receipt that cannot be written fails the call');
select is(
  (select count(*)::int from public.friendships
    where requester_id = torny_rls.active_id() and addressee_id = torny_rls.flightmate_id()),
  0,
  '17: and leaves no request behind');

-- ── 18–21: who reads it ──────────────────────────────────────────────────────
select torny_rls.as_user(torny_rls.active_id());
select is(
  (select count(*)::int from public.friendships),
  0,
  '18: the sender does not read the request');
select torny_rls.as_user(torny_rls.outsider_id());
select is(
  (select count(*)::int from public.friendships where requester_id = torny_rls.active_id()),
  1,
  '19: the person who received it reads it');
select torny_rls.as_user(torny_rls.active_id());
select is(public.remove_friend(torny_rls.outsider_id()), 'not_found',
  '20: the sender''s withdrawal → not_found');
select torny_rls.as_service();
select is(
  (select count(*)::int from public.friendships
    where requester_id = torny_rls.active_id() and addressee_id = torny_rls.outsider_id()),
  1,
  '21: the row is still there');

-- ── 22–26: a request that is not answered gives nothing ─────────────────────
select ok(not public.is_invite_eligible(torny_rls.active_id(), torny_rls.outsider_id(), null),
  '22: the sender is not invite-eligible for the receiver');
select ok(not public.is_invite_eligible(torny_rls.outsider_id(), torny_rls.active_id(), null),
  '23: the receiver is not invite-eligible for the sender');
select torny_rls.as_user(torny_rls.active_id());
select ok(
  not exists (select 1 from public.roster_candidates() r where r.id = torny_rls.outsider_id()),
  '24: the receiver is not in the sender''s roster candidates');
select throws_like(
  $$ insert into public.game_players (game_id, user_id)
     values (torny_rls.fr_own_game(), torny_rls.outsider_id()) $$,
  '%not invite-eligible%',
  '25: the sender cannot put the receiver on an own roster');
select torny_rls.as_user(torny_rls.outsider_id());
select ok(
  not exists (select 1 from public.roster_candidates() r where r.id = torny_rls.active_id()),
  '26: the sender is not in the receiver''s roster candidates');

-- ── 27–31: the sender picks the same person from a list ─────────────────────
select torny_rls.as_user(torny_rls.active_id());
select is(public.send_friend_request(torny_rls.outsider_id()), 'requested',
  '27: send_friend_request for the same person → requested');
select is(
  (select array_agg(status || ':' || by_email::text) from public.friendships
    where addressee_id = torny_rls.outsider_id()),
  array['pending:false'],
  '28: the sender now reads the request');
-- 0259 (#3019): only the service role may ask is_invite_eligible directly.
select torny_rls.as_service();
select ok(not public.is_invite_eligible(torny_rls.active_id(), torny_rls.outsider_id(), null),
  '29: a request the sender reads is still not invite-eligible');
select torny_rls.as_user(torny_rls.active_id());
select is(public.remove_friend(torny_rls.outsider_id()), 'removed',
  '30: the sender withdraws a request the sender reads');

-- A request from the list is waiting, and there is no receipt for the address.
select torny_rls.as_service();
delete from public.invitations where invited_by = torny_rls.active_id();
insert into public.friendships (requester_id, addressee_id, status)
  values (torny_rls.active_id(), torny_rls.outsider_id(), 'pending');
select is(
  torny_rls.fr_lookup('rls-outsider@example.test', 'fr-tok-5')->>'outcome',
  'already_pending',
  '31: a request already waiting and no receipt → already_pending');

-- ── 32–40: the answer ────────────────────────────────────────────────────────
-- Clean slate, then one request by e-mail that is declined.
delete from public.friendships where requester_id = torny_rls.active_id();
delete from public.invitations where invited_by = torny_rls.active_id();
select torny_rls.fr_lookup('rls-outsider@example.test', 'fr-tok-6');
select torny_rls.as_user(torny_rls.outsider_id());
select public.respond_friend_request(
  (select id from public.friendships where requester_id = torny_rls.active_id()), false);
select torny_rls.as_service();
select is(
  (select count(*)::int from public.friendships
    where requester_id = torny_rls.active_id() and addressee_id = torny_rls.outsider_id()),
  0,
  '32: declined → the request is gone');
select is(
  torny_rls.fr_receipts(),
  array['rls-outsider@example.test:false:false'],
  '33: declined → the receipt is as it was written');

-- Clean slate, then one request by e-mail that is accepted.
delete from public.invitations where invited_by = torny_rls.active_id();
select torny_rls.fr_lookup('rls-outsider@example.test', 'fr-tok-7');
select torny_rls.as_user(torny_rls.outsider_id());
select public.respond_friend_request(
  (select id from public.friendships where requester_id = torny_rls.active_id()), true);
select torny_rls.as_user(torny_rls.active_id());
select is(
  (select array_agg(status) from public.friendships where addressee_id = torny_rls.outsider_id()),
  array['accepted'],
  '34: accepted → the sender reads the friendship');
select torny_rls.as_service();
select is(
  torny_rls.fr_receipts(),
  array['rls-outsider@example.test:true:true'],
  '35: accepted → the receipt is marked accepted');
select ok(public.is_invite_eligible(torny_rls.active_id(), torny_rls.outsider_id(), null),
  '36: an accepted friendship is invite-eligible');
select torny_rls.as_user(torny_rls.active_id());
select lives_ok(
  $$ insert into public.game_players (game_id, user_id)
     values (torny_rls.fr_own_game(), torny_rls.outsider_id()) $$,
  '37: the sender puts the friend on an own roster');
select torny_rls.as_service();
select is(
  torny_rls.fr_lookup('rls-outsider@example.test', 'fr-tok-8')->>'outcome',
  'already_friends',
  '38: the lookup for a friend → already_friends');

-- flightmate_id asked active_id first; active_id then adds flightmate by e-mail.
insert into public.friendships (requester_id, addressee_id, status)
  values (torny_rls.flightmate_id(), torny_rls.active_id(), 'pending');
select is(
  torny_rls.fr_lookup('rls-flightmate@example.test', 'fr-tok-9')->>'outcome',
  'accepted',
  '39: the other person asked first → accepted');

update public.users set deleted_at = now() where id = torny_rls.submitted_id();
select is(
  torny_rls.fr_lookup('rls-submitted@example.test', 'fr-tok-10')->>'outcome',
  'unknown',
  '40: a deleted account → unknown');

-- ── 41–49: the receipt mark, and who writes invitations ─────────────────────
select is(
  (select array_agg(i.email || ':' || (r.invitation_id is not null)::text order by i.email, i.created_at)
     from public.invitations i
     left join public.invitation_receipts r on r.invitation_id = i.id
    where i.invited_by = torny_rls.active_id() and i.game_id is null),
  array[
    'rls-flightmate@example.test:true',
    'rls-outsider@example.test:true',
    'rls-outsider@example.test:true',
    'rls-submitted@example.test:false'
  ],
  '41: a receipt for a person with an account is marked, one for an address without an account is not');
select ok(
  (select count(*) from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()) >= 1,
  '42: the lookup holds a lock for its sender and address until the transaction ends');
select ok(not has_table_privilege('authenticated', 'public.invitation_receipts', 'SELECT')
      and not has_table_privilege('authenticated', 'public.invitation_receipts', 'INSERT')
      and not has_table_privilege('anon', 'public.invitation_receipts', 'SELECT')
      and not has_table_privilege('anon', 'public.invitation_receipts', 'INSERT'),
  '43: a user session and anon have no privilege on the marks');

select torny_rls.as_user(torny_rls.active_id());
select throws_ok(
  $$ select count(*) from public.invitation_receipts $$,
  '42501', null,
  '44: a player cannot read the marks');
select throws_ok(
  $$ insert into public.invitations (email, token, invited_by, game_id, expires_at)
     values ('rls-withdrawn@example.test', 'fr-hostile-1', torny_rls.active_id(), null, now() + interval '7 days') $$,
  '42501', null,
  '45: a player cannot insert a game-less invitation');
select throws_ok(
  $$ insert into public.invitations (email, token, invited_by, game_id, expires_at, created_at)
     values ('rls-withdrawn@example.test', 'fr-hostile-2', torny_rls.active_id(), null, now() + interval '7 days', '2000-01-01') $$,
  '42501', null,
  '46: nor one with a back-dated created_at');
select lives_ok(
  $$ insert into public.invitations (email, token, invited_by, game_id, expires_at, created_at, opened_at, accepted_at)
     values ('rls-withdrawn@example.test', 'fr-hostile-3', torny_rls.active_id(), torny_rls.fr_own_game(),
             now() + interval '7 days', '2000-01-01', '2000-01-02', '2000-01-03') $$,
  '47: a player invites to an own game, with crafted created_at, opened_at and accepted_at');
select torny_rls.as_service();
select is(
  (select (created_at > now() - interval '1 hour')::text || ':' || (opened_at is null)::text || ':' || (accepted_at is null)::text
     from public.invitations where token = 'fr-hostile-3'),
  'true:true:true',
  '48: the database set created_at itself and left opened_at and accepted_at empty');
select torny_rls.as_user(torny_rls.admin_id());
select lives_ok(
  $$ insert into public.invitations (email, token, invited_by, game_id, expires_at)
     values ('rls-new-player@example.test', 'fr-admin-1', torny_rls.admin_id(), null, now() + interval '7 days') $$,
  '49: a global admin inserts a game-less invitation through a user session');

select * from finish();

rollback;
