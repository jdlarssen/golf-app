-- supabase/tests/report_block_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- #3019 (0259): the hostile-request rig for user_blocks, content_reports and
-- terms_acceptances, plus the block's effect on friendships.
--
-- A = active_id (blocks and reports), B = flightmate_id (blocked).
--
--   user_blocks
--    1. A inserts A → B                                   ALLOWED
--    2. A inserts B → A (forged blocker)                  FORBIDDEN
--    3. B reads the block                                 0 rows
--    4. A reads the block                                 1 row
--    5. B deletes the block                               0 rows changed
--    6. the block removed A and B's friendship            0 rows
--    7. B inserts a friendship with A                     FORBIDDEN
--   content_reports
--    8. A reports B                                       ALLOWED
--    9. A files a report as B (forged reporter)           FORBIDDEN
--   10. A files a report already marked handled           FORBIDDEN
--   11. A reads reports back                              0 rows
--   12. A marks a report handled                          0 rows changed
--   13. the service role sees A's report                  1 row
--   terms_acceptances
--   14. A accepts version 1                               ALLOWED
--   15. A accepts for B                                   FORBIDDEN
--   16. B reads A's acceptance                            0 rows
--   word filter
--   17. «Fitjar Golfklubb» passes, «Kuk» does not
--   18. a signed-in user cannot ask is_blocked_between (0260)    FORBIDDEN
--   19. nor is_invite_eligible, which asks it (0261)              FORBIDDEN
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

\ir fixtures/rls_helpers.psql

select torny_rls.as_service();
select torny_rls.seed_active_game();

-- The two are friends before the block.
insert into public.friendships (requester_id, addressee_id, status, responded_at)
values (torny_rls.active_id(), torny_rls.flightmate_id(), 'accepted', now());

-- ── Probes (rolled back with the transaction) ───────────────────────────────

create or replace function torny_rls.try_block(p_blocker uuid, p_blocked uuid)
  returns boolean
  language plpgsql
  as $$
  begin
    insert into public.user_blocks (blocker_id, blocked_id) values (p_blocker, p_blocked);
    return true;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

create or replace function torny_rls.count_blocks()
  returns int
  language plpgsql
  as $$
  declare v_count int;
  begin
    select count(*) into v_count from public.user_blocks;
    return v_count;
  exception
    when insufficient_privilege then return -1;
  end;
  $$;

create or replace function torny_rls.try_unblock_all()
  returns int
  language plpgsql
  as $$
  declare v_rows int;
  begin
    delete from public.user_blocks;
    get diagnostics v_rows = row_count;
    return v_rows;
  exception
    when insufficient_privilege then return -1;
  end;
  $$;

create or replace function torny_rls.try_friendship(p_from uuid, p_to uuid)
  returns boolean
  language plpgsql
  as $$
  begin
    insert into public.friendships (requester_id, addressee_id, status)
    values (p_from, p_to, 'pending');
    return true;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

create or replace function torny_rls.try_report(p_reporter uuid, p_target uuid, p_handled boolean)
  returns boolean
  language plpgsql
  as $$
  begin
    insert into public.content_reports (reporter_id, target_user_id, reason, handled_at)
    values (p_reporter, p_target, 'harassment', case when p_handled then now() end);
    return true;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

create or replace function torny_rls.count_reports()
  returns int
  language plpgsql
  as $$
  declare v_count int;
  begin
    select count(*) into v_count from public.content_reports;
    return v_count;
  exception
    when insufficient_privilege then return -1;
  end;
  $$;

create or replace function torny_rls.try_handle_reports()
  returns int
  language plpgsql
  as $$
  declare v_rows int;
  begin
    update public.content_reports set handled_at = now();
    get diagnostics v_rows = row_count;
    return v_rows;
  exception
    when insufficient_privilege then return -1;
  end;
  $$;

create or replace function torny_rls.try_accept_terms(p_owner uuid)
  returns boolean
  language plpgsql
  as $$
  begin
    insert into public.terms_acceptances (user_id, version) values (p_owner, 1);
    return true;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

create or replace function torny_rls.count_terms(p_owner uuid)
  returns int
  language plpgsql
  as $$
  declare v_count int;
  begin
    select count(*) into v_count from public.terms_acceptances where user_id = p_owner;
    return v_count;
  exception
    when insufficient_privilege then return -1;
  end;
  $$;

-- ── user_blocks ─────────────────────────────────────────────────────────────

select torny_rls.as_user(torny_rls.active_id());
select ok(torny_rls.try_block(torny_rls.active_id(), torny_rls.flightmate_id()),
  '1. A blocks B');
select ok(not torny_rls.try_block(torny_rls.flightmate_id(), torny_rls.active_id()),
  '2. A cannot write a block in B''s name');

select torny_rls.as_user(torny_rls.flightmate_id());
select is(torny_rls.count_blocks(), 0, '3. B does not see that A blocked B');

select torny_rls.as_user(torny_rls.active_id());
select is(torny_rls.count_blocks(), 1, '4. A sees the block');

select torny_rls.as_user(torny_rls.flightmate_id());
select is(torny_rls.try_unblock_all(), 0, '5. B cannot lift A''s block');

select torny_rls.as_service();
select is(
  (select count(*)::int from public.friendships
    where (requester_id = torny_rls.active_id() and addressee_id = torny_rls.flightmate_id())
       or (requester_id = torny_rls.flightmate_id() and addressee_id = torny_rls.active_id())),
  0,
  '6. the block ended the friendship'
);

select torny_rls.as_user(torny_rls.flightmate_id());
select ok(not torny_rls.try_friendship(torny_rls.flightmate_id(), torny_rls.active_id()),
  '7. B cannot ask A to be friends');

-- ── content_reports ─────────────────────────────────────────────────────────

select torny_rls.as_user(torny_rls.active_id());
select ok(torny_rls.try_report(torny_rls.active_id(), torny_rls.flightmate_id(), false),
  '8. A reports B');
select ok(not torny_rls.try_report(torny_rls.flightmate_id(), torny_rls.outsider_id(), false),
  '9. A cannot file a report as B');
select ok(not torny_rls.try_report(torny_rls.active_id(), torny_rls.outsider_id(), true),
  '10. A cannot file a report that is already handled');
select is(torny_rls.count_reports(), 0, '11. A does not read reports back');
select is(torny_rls.try_handle_reports(), 0, '12. A cannot mark a report handled');

select torny_rls.as_service();
select is(torny_rls.count_reports(), 1, '13. the service role sees the one report');

-- ── terms_acceptances ───────────────────────────────────────────────────────

select torny_rls.as_user(torny_rls.active_id());
select ok(torny_rls.try_accept_terms(torny_rls.active_id()), '14. A accepts the terms');
select ok(not torny_rls.try_accept_terms(torny_rls.flightmate_id()), '15. A cannot accept for B');

select torny_rls.as_user(torny_rls.flightmate_id());
select is(torny_rls.count_terms(torny_rls.active_id()), 0, '16. B does not see A''s acceptance');

-- ── word filter ─────────────────────────────────────────────────────────────

select ok(
  not public.contains_blocked_word('Fitjar Golfklubb')
  and public.contains_blocked_word('Kuk'),
  '17. whole words only: a place name passes, the word does not'
);

select torny_rls.as_user(torny_rls.flightmate_id());
select ok(
  not has_function_privilege('authenticated', 'public.is_blocked_between(uuid, uuid)', 'execute'),
  '18. a signed-in user cannot ask whether two people have a block'
);
select ok(
  not has_function_privilege('authenticated', 'public.is_invite_eligible(uuid, uuid, uuid)', 'execute'),
  '19. nor ask is_invite_eligible, which would show the same thing'
);

select * from finish();
rollback;
