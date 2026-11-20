-- supabase/tests/format_choice_write_rules_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Write rules for Wolf choices, Bingo Bango Bongo holes and Patsome tee
-- starters, and Bingo Bango Bongo as one flight (migration 0249, owner-ordered
-- audit 20.11).
--
-- Fixtures (fc_ = format choice):
--   G1 wolf, active: w1..w4 hold slots 1..4.
--   G2 wolf, finished: w1..w3.          G3 wolf, scheduled: w1..w3.
--   G4 bingo_bango_bongo, active: b1 + b2, and bw who has withdrawn.
--   G5 bingo_bango_bongo, finished: b1 + b2.
--   G6 patsome, active: team 1 is p1 + p2 and pw (withdrawn), team 2 is p3 + p4.
--   G7 patsome, finished: team 1 is p1 + p2.
--   G8 bingo_bango_bongo, scheduled: b1..b5 (five active players).
--   G9 skins, active: b1..b5.
--   fc_out is in no game. The rig's admin_id() is the admin.
--
-- Every probe and its check are separate statements (#1910).
-- Depends on 0249. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(54);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures ──────────────────────────────────────────────────
create or replace function torny_rls.fc_w1() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000011'::uuid $$;
create or replace function torny_rls.fc_w2() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000012'::uuid $$;
create or replace function torny_rls.fc_w3() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000013'::uuid $$;
create or replace function torny_rls.fc_w4() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000014'::uuid $$;
create or replace function torny_rls.fc_b1() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000021'::uuid $$;
create or replace function torny_rls.fc_b2() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000022'::uuid $$;
create or replace function torny_rls.fc_bw() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000023'::uuid $$;
create or replace function torny_rls.fc_b3() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000024'::uuid $$;
create or replace function torny_rls.fc_b4() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000025'::uuid $$;
create or replace function torny_rls.fc_b5() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000026'::uuid $$;
create or replace function torny_rls.fc_p1() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000031'::uuid $$;
create or replace function torny_rls.fc_p2() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000032'::uuid $$;
create or replace function torny_rls.fc_p3() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000033'::uuid $$;
create or replace function torny_rls.fc_p4() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000034'::uuid $$;
create or replace function torny_rls.fc_pw() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000035'::uuid $$;
create or replace function torny_rls.fc_out() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-024900000041'::uuid $$;
create or replace function torny_rls.fc_game(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-a000-02490000010' || n::text)::uuid $$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into auth.users (id, instance_id, aud, role, email)
select uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
       'rls-' || uid::text || '@example.test'
  from unnest(array[
    torny_rls.fc_w1(), torny_rls.fc_w2(), torny_rls.fc_w3(), torny_rls.fc_w4(), torny_rls.fc_b1(), torny_rls.fc_b2(), torny_rls.fc_bw(), torny_rls.fc_b3(), torny_rls.fc_b4(), torny_rls.fc_b5(), torny_rls.fc_p1(), torny_rls.fc_p2(), torny_rls.fc_p3(), torny_rls.fc_p4(), torny_rls.fc_pw(), torny_rls.fc_out()
  ]) as uid;

update public.users set is_admin = false, name = 'FC ' || right(id::text, 2)
 where id::text like '00000000-0000-4000-a000-0249%';

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, mode_config, created_by, started_at) values
  (torny_rls.fc_game(1), 'FC G1', torny_rls.course_id(), torny_rls.tee_box_id(), 'active',    'wolf', '{"kind":"wolf","wolf_rotation":"catch_up"}', torny_rls.admin_id(), now()),
  (torny_rls.fc_game(2), 'FC G2', torny_rls.course_id(), torny_rls.tee_box_id(), 'finished',  'wolf', '{"kind":"wolf"}', torny_rls.admin_id(), now()),
  (torny_rls.fc_game(3), 'FC G3', torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'wolf', '{"kind":"wolf"}', torny_rls.admin_id(), null),
  (torny_rls.fc_game(4), 'FC G4', torny_rls.course_id(), torny_rls.tee_box_id(), 'active',    'bingo_bango_bongo', '{"kind":"bingo_bango_bongo","team_size":1}', torny_rls.admin_id(), now()),
  (torny_rls.fc_game(5), 'FC G5', torny_rls.course_id(), torny_rls.tee_box_id(), 'finished',  'bingo_bango_bongo', '{"kind":"bingo_bango_bongo","team_size":1}', torny_rls.admin_id(), now()),
  (torny_rls.fc_game(6), 'FC G6', torny_rls.course_id(), torny_rls.tee_box_id(), 'active',    'patsome', '{"kind":"patsome","patsome_scoring":"net"}', torny_rls.admin_id(), now()),
  (torny_rls.fc_game(7), 'FC G7', torny_rls.course_id(), torny_rls.tee_box_id(), 'finished',  'patsome', '{"kind":"patsome","patsome_scoring":"net"}', torny_rls.admin_id(), now()),
  (torny_rls.fc_game(8), 'FC G8', torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'bingo_bango_bongo', '{"kind":"bingo_bango_bongo","team_size":1}', torny_rls.admin_id(), null),
  (torny_rls.fc_game(9), 'FC G9', torny_rls.course_id(), torny_rls.tee_box_id(), 'active',    'skins', '{"kind":"skins"}', torny_rls.admin_id(), now());

insert into public.game_players (game_id, user_id, team_number, flight_number, withdrawn_at) values
  (torny_rls.fc_game(1), torny_rls.fc_w1(), 1, 1, null),
  (torny_rls.fc_game(1), torny_rls.fc_w2(), 2, 2, null),
  (torny_rls.fc_game(1), torny_rls.fc_w3(), 3, 3, null),
  (torny_rls.fc_game(1), torny_rls.fc_w4(), 4, 4, null),
  (torny_rls.fc_game(2), torny_rls.fc_w1(), 1, 1, null),
  (torny_rls.fc_game(2), torny_rls.fc_w2(), 2, 2, null),
  (torny_rls.fc_game(2), torny_rls.fc_w3(), 3, 3, null),
  (torny_rls.fc_game(3), torny_rls.fc_w1(), 1, 1, null),
  (torny_rls.fc_game(3), torny_rls.fc_w2(), 2, 2, null),
  (torny_rls.fc_game(3), torny_rls.fc_w3(), 3, 3, null),
  (torny_rls.fc_game(4), torny_rls.fc_b1(), null, null, null),
  (torny_rls.fc_game(4), torny_rls.fc_b2(), null, null, null),
  (torny_rls.fc_game(4), torny_rls.fc_bw(), null, null, now()),
  (torny_rls.fc_game(5), torny_rls.fc_b1(), null, null, null),
  (torny_rls.fc_game(5), torny_rls.fc_b2(), null, null, null),
  (torny_rls.fc_game(6), torny_rls.fc_p1(), 1, 1, null),
  (torny_rls.fc_game(6), torny_rls.fc_p2(), 1, 1, null),
  (torny_rls.fc_game(6), torny_rls.fc_pw(), 1, 1, now()),
  (torny_rls.fc_game(6), torny_rls.fc_p3(), 2, 1, null),
  (torny_rls.fc_game(6), torny_rls.fc_p4(), 2, 1, null),
  (torny_rls.fc_game(7), torny_rls.fc_p1(), 1, 1, null),
  (torny_rls.fc_game(7), torny_rls.fc_p2(), 1, 1, null),
  (torny_rls.fc_game(8), torny_rls.fc_b1(), null, null, null),
  (torny_rls.fc_game(8), torny_rls.fc_b2(), null, null, null),
  (torny_rls.fc_game(8), torny_rls.fc_b3(), null, null, null),
  (torny_rls.fc_game(8), torny_rls.fc_b4(), null, null, null),
  (torny_rls.fc_game(8), torny_rls.fc_b5(), null, null, null),
  (torny_rls.fc_game(9), torny_rls.fc_b1(), null, null, null),
  (torny_rls.fc_game(9), torny_rls.fc_b2(), null, null, null),
  (torny_rls.fc_game(9), torny_rls.fc_b3(), null, null, null),
  (torny_rls.fc_game(9), torny_rls.fc_b4(), null, null, null),
  (torny_rls.fc_game(9), torny_rls.fc_b5(), null, null, null);

select is(
  (select count(*)
     from (values
-- wolf-rotation-table:start (wolfRotationDbCheck.test.ts holds these rows to wolfTurn.ts)
  ('trailing', 3, array[1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3]::integer[]),
  ('trailing', 4, array[1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, null, null]::integer[]),
  ('trailing', 5, array[1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, null, null, null]::integer[]),
  ('catch_up', 3, array[1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, null, null, null]::integer[]),
  ('catch_up', 4, array[1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, null, null]::integer[]),
  ('catch_up', 5, array[1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, null, null, null]::integer[])
-- wolf-rotation-table:end
     ) as expected(rule, players, slots)
     cross join generate_series(1, 18) as hole
    where public.wolf_rotation_slot(hole, expected.players, expected.rule)
          is distinct from expected.slots[hole]),
  0::bigint,
  'wolf_rotation_slot gives the same slot as wolfTurn.ts on every hole, for 3 to 5 players and both rules');

select is(public.wolf_rotation_slot(19, 4, 'trailing'), null::integer, 'wolf_rotation_slot: no hole 19');

select is(public.wolf_rotation_slot(1, 0, 'trailing'), null::integer, 'wolf_rotation_slot: no players, no slot');

select is(public.bbb_max_players(), 4, 'Bingo Bango Bongo is one flight of four');

-- ══ Wolf ══

select torny_rls.as_user(torny_rls.fc_out());

select throws_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(1), 7, torny_rls.fc_out(), 'blind', null, torny_rls.fc_out()) $q$,
  '42501', 'wolf_choice_not_in_game',
  'wolf: a user outside the game cannot take a hole');

select throws_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(1), 17, torny_rls.fc_out(), 'blind', null, torny_rls.fc_out()) $q$,
  '42501', 'wolf_choice_not_in_game',
  'wolf: nor a closing hole, where the standings decide');

select torny_rls.as_user(torny_rls.fc_w2());

select throws_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(1), 1, torny_rls.fc_w2(), 'lone', null, torny_rls.fc_w2()) $q$,
  '42501', 'wolf_choice_not_your_hole',
  'wolf: slot 2 cannot take the hole that belongs to slot 1');

select throws_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(1), 2, torny_rls.fc_w1(), 'lone', null, torny_rls.fc_w2()) $q$,
  '42501', 'wolf_choice_not_your_hole',
  'wolf: a player cannot write a row for another wolf');

select torny_rls.as_user(torny_rls.fc_w1());

select throws_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(1), 1, torny_rls.fc_w1(), 'partner', torny_rls.fc_out(), torny_rls.fc_w1()) $q$,
  '42501', 'wolf_choice_partner_not_in_game',
  'wolf: the partner plays in the game');

select throws_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(1), 1, torny_rls.fc_w1(), 'lone', null, torny_rls.fc_w2()) $q$,
  '42501', 'wolf_choice_entered_by',
  'wolf: entered_by is the caller');

select throws_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(2), 1, torny_rls.fc_w1(), 'lone', null, torny_rls.fc_w1()) $q$,
  '42501', 'wolf_choice_game_not_active',
  'wolf: no choice in a finished round');

select throws_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(3), 1, torny_rls.fc_w1(), 'lone', null, torny_rls.fc_w1()) $q$,
  '42501', 'wolf_choice_game_not_active',
  'wolf: no choice before the round has started');

select throws_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(4), 1, torny_rls.fc_w1(), 'lone', null, torny_rls.fc_w1()) $q$,
  '42501', 'wolf_choice_wrong_game',
  'wolf: no choice in a game of another format');

select lives_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(1), 1, torny_rls.fc_w1(), 'lone', null, torny_rls.fc_w1()) $q$,
  'wolf: the wolf saves the choice on their own hole');

select lives_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(1), 1, torny_rls.fc_w1(), 'partner', torny_rls.fc_w3(), torny_rls.fc_w1()) on conflict (game_id, hole_number) do update set choice = excluded.choice, partner_user_id = excluded.partner_user_id, wolf_user_id = excluded.wolf_user_id, entered_by = excluded.entered_by $q$,
  'wolf: and changes it (the upsert both clients send)');

select is((select partner_user_id from public.wolf_hole_choices where game_id = torny_rls.fc_game(1) and hole_number = 1),
  torny_rls.fc_w3(),
  'wolf: the changed choice is the one stored');

select torny_rls.as_user(torny_rls.fc_w2());

update public.wolf_hole_choices
   set choice = 'blind', partner_user_id = null, entered_by = torny_rls.fc_w2()
 where game_id = torny_rls.fc_game(1) and hole_number = 1;

select is((select choice from public.wolf_hole_choices where game_id = torny_rls.fc_game(1) and hole_number = 1),
  'partner',
  'wolf: another player''s update of the wolf''s row changes nothing');

delete from public.wolf_hole_choices
 where game_id = torny_rls.fc_game(1) and hole_number = 1;

select is((select count(*) from public.wolf_hole_choices where game_id = torny_rls.fc_game(1) and hole_number = 1),
  1::bigint,
  'wolf: another player cannot delete the wolf''s row');

select torny_rls.as_user(torny_rls.fc_w3());

select lives_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(1), 17, torny_rls.fc_w3(), 'blind', null, torny_rls.fc_w3()) $q$,
  'wolf: on a closing hole any player with a slot can save (the standings decide, and only the app knows them)');

select torny_rls.as_user(torny_rls.admin_id());

select lives_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(1), 3, torny_rls.fc_w4(), 'lone', null, torny_rls.admin_id()) $q$,
  'wolf: an admin can set another wolf (the override)');

select lives_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(2), 2, torny_rls.fc_w2(), 'lone', null, torny_rls.admin_id()) $q$,
  'wolf: an admin can correct a finished round');

select throws_ok(
  $q$ insert into public.wolf_hole_choices (game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by) values (torny_rls.fc_game(1), 4, torny_rls.fc_out(), 'lone', null, torny_rls.admin_id()) $q$,
  '42501', 'wolf_choice_not_in_game',
  'wolf: not even an admin can name a wolf outside the game');

-- ══ Bingo Bango Bongo ══

select torny_rls.as_user(torny_rls.fc_out());

select throws_ok(
  $q$ insert into public.bingo_bango_bongo_holes (game_id, hole_number, bingo_user_id, entered_by) values (torny_rls.fc_game(4), 1, torny_rls.fc_b1(), torny_rls.fc_out()) $q$,
  '42501', 'bbb_hole_not_in_game',
  'bbb: a user outside the game cannot write');

select torny_rls.as_user(torny_rls.fc_bw());

select throws_ok(
  $q$ insert into public.bingo_bango_bongo_holes (game_id, hole_number, bingo_user_id, entered_by) values (torny_rls.fc_game(4), 1, torny_rls.fc_b1(), torny_rls.fc_bw()) $q$,
  '42501', 'bbb_hole_not_in_game',
  'bbb: a withdrawn player cannot write');

select torny_rls.as_user(torny_rls.fc_b1());

select throws_ok(
  $q$ insert into public.bingo_bango_bongo_holes (game_id, hole_number, bingo_user_id, entered_by) values (torny_rls.fc_game(5), 1, torny_rls.fc_b1(), torny_rls.fc_b1()) $q$,
  '42501', 'bbb_hole_game_not_active',
  'bbb: no point in a finished round');

select throws_ok(
  $q$ insert into public.bingo_bango_bongo_holes (game_id, hole_number, bingo_user_id, entered_by) values (torny_rls.fc_game(4), 1, torny_rls.fc_out(), torny_rls.fc_b1()) $q$,
  '42501', 'bbb_hole_recipient_not_in_game',
  'bbb: a point goes to a player in the game');

select throws_ok(
  $q$ insert into public.bingo_bango_bongo_holes (game_id, hole_number, bingo_user_id, entered_by) values (torny_rls.fc_game(4), 1, torny_rls.fc_b1(), torny_rls.fc_b2()) $q$,
  '42501', 'bbb_hole_entered_by',
  'bbb: entered_by is the caller');

select throws_ok(
  $q$ insert into public.bingo_bango_bongo_holes (game_id, hole_number, bingo_user_id, entered_by) values (torny_rls.fc_game(1), 1, torny_rls.fc_w1(), torny_rls.fc_b1()) $q$,
  '42501', 'bbb_hole_wrong_game',
  'bbb: no row in a game of another format');

select lives_ok(
  $q$ insert into public.bingo_bango_bongo_holes (game_id, hole_number, bingo_user_id, entered_by) values (torny_rls.fc_game(4), 1, torny_rls.fc_b2(), torny_rls.fc_b1()) on conflict (game_id, hole_number) do update set bingo_user_id = excluded.bingo_user_id, entered_by = excluded.entered_by $q$,
  'bbb: a player saves one category');

select torny_rls.as_user(torny_rls.fc_b2());

select lives_ok(
  $q$ insert into public.bingo_bango_bongo_holes (game_id, hole_number, bango_user_id, entered_by) values (torny_rls.fc_game(4), 1, torny_rls.fc_bw(), torny_rls.fc_b2()) on conflict (game_id, hole_number) do update set bango_user_id = excluded.bango_user_id, entered_by = excluded.entered_by $q$,
  'bbb: a second player adds another category, to a player who has since withdrawn');

select lives_ok(
  $q$ insert into public.bingo_bango_bongo_holes (game_id, hole_number, bingo_user_id, entered_by) values (torny_rls.fc_game(4), 1, null, torny_rls.fc_b2()) on conflict (game_id, hole_number) do update set bingo_user_id = excluded.bingo_user_id, entered_by = excluded.entered_by $q$,
  'bbb: and clears the first');

select is(
  (select array[bingo_user_id, bango_user_id, bongo_user_id] from public.bingo_bango_bongo_holes
    where game_id = torny_rls.fc_game(4) and hole_number = 1),
  array[null::uuid, torny_rls.fc_bw(), null::uuid],
  'bbb: the row holds exactly what the three writes left');

delete from public.bingo_bango_bongo_holes
 where game_id = torny_rls.fc_game(4) and hole_number = 1;

select is((select count(*) from public.bingo_bango_bongo_holes where game_id = torny_rls.fc_game(4) and hole_number = 1),
  1::bigint,
  'bbb: a player cannot delete a hole row');

select torny_rls.as_user(torny_rls.admin_id());

select lives_ok(
  $q$ insert into public.bingo_bango_bongo_holes (game_id, hole_number, bongo_user_id, entered_by) values (torny_rls.fc_game(5), 2, torny_rls.fc_b1(), torny_rls.admin_id()) on conflict (game_id, hole_number) do update set bongo_user_id = excluded.bongo_user_id, entered_by = excluded.entered_by $q$,
  'bbb: an admin can correct a finished round');

-- ══ Patsome ══

select torny_rls.as_user(torny_rls.fc_p1());

select throws_ok(
  $q$ insert into public.patsome_tee_starters (game_id, team_number, tee_starter_user_id) values (torny_rls.fc_game(6), 1, torny_rls.fc_out()) $q$,
  '42501', 'patsome_starter_pick_not_on_team',
  'patsome: the starter is on the team, not outside the game');

select throws_ok(
  $q$ insert into public.patsome_tee_starters (game_id, team_number, tee_starter_user_id) values (torny_rls.fc_game(6), 1, torny_rls.fc_p3()) $q$,
  '42501', 'patsome_starter_pick_not_on_team',
  'patsome: nor on the other team');

select throws_ok(
  $q$ insert into public.patsome_tee_starters (game_id, team_number, tee_starter_user_id) values (torny_rls.fc_game(6), 1, torny_rls.fc_pw()) $q$,
  '42501', 'patsome_starter_pick_not_on_team',
  'patsome: nor a teammate who has withdrawn');

select throws_ok(
  $q$ insert into public.patsome_tee_starters (game_id, team_number, tee_starter_user_id) values (torny_rls.fc_game(6), 2, torny_rls.fc_p3()) $q$,
  '42501', 'patsome_starter_not_on_team',
  'patsome: a player cannot pick for the other team');

select throws_ok(
  $q$ insert into public.patsome_tee_starters (game_id, team_number, tee_starter_user_id) values (torny_rls.fc_game(7), 1, torny_rls.fc_p1()) $q$,
  '42501', 'patsome_starter_game_not_active',
  'patsome: no pick in a finished round');

select throws_ok(
  $q$ insert into public.patsome_tee_starters (game_id, team_number, tee_starter_user_id) values (torny_rls.fc_game(1), 1, torny_rls.fc_p1()) $q$,
  '42501', 'patsome_starter_wrong_game',
  'patsome: no pick in a game of another format');

select lives_ok(
  $q$ insert into public.patsome_tee_starters (game_id, team_number, tee_starter_user_id) values (torny_rls.fc_game(6), 1, torny_rls.fc_p2()) on conflict (game_id, team_number) do update set tee_starter_user_id = excluded.tee_starter_user_id $q$,
  'patsome: a team member saves the pick');

select torny_rls.as_user(torny_rls.fc_pw());

select throws_ok(
  $q$ insert into public.patsome_tee_starters (game_id, team_number, tee_starter_user_id) values (torny_rls.fc_game(6), 1, torny_rls.fc_p1()) on conflict (game_id, team_number) do update set tee_starter_user_id = excluded.tee_starter_user_id $q$,
  '42501', 'patsome_starter_not_on_team',
  'patsome: a withdrawn teammate cannot change it');

select torny_rls.as_user(torny_rls.fc_p2());

select lives_ok(
  $q$ insert into public.patsome_tee_starters (game_id, team_number, tee_starter_user_id) values (torny_rls.fc_game(6), 1, torny_rls.fc_p1()) on conflict (game_id, team_number) do update set tee_starter_user_id = excluded.tee_starter_user_id $q$,
  'patsome: the partner changes it');

delete from public.patsome_tee_starters
 where game_id = torny_rls.fc_game(6) and team_number = 1;

select is((select tee_starter_user_id from public.patsome_tee_starters where game_id = torny_rls.fc_game(6) and team_number = 1),
  torny_rls.fc_p1(),
  'patsome: a player cannot delete the pick');

select torny_rls.as_user(torny_rls.fc_p3());

select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.fc_game(6), 2, torny_rls.fc_p4())),
  true,
  'patsome: the app''s queue call still applies (0231)');

-- ══ Bingo Bango Bongo is one flight ══

select torny_rls.as_service();

select lives_ok(
  $q$ insert into public.game_players (game_id, user_id) values (torny_rls.fc_game(4), torny_rls.fc_b3()), (torny_rls.fc_game(4), torny_rls.fc_b4()) $q$,
  'one flight: a round in progress grows from two to four active players');

select throws_ok(
  $q$ insert into public.game_players (game_id, user_id) values (torny_rls.fc_game(4), torny_rls.fc_b5()) $q$,
  '23514', 'bbb_too_many_players',
  'one flight: a fifth active player is refused, also for the service role');

select throws_ok(
  $q$ update public.game_players set withdrawn_at = null where game_id = torny_rls.fc_game(4) and user_id = torny_rls.fc_bw() $q$,
  '23514', 'bbb_too_many_players',
  'one flight: a withdrawn player cannot return as the fifth');

select lives_ok(
  $q$ insert into public.game_players (game_id, user_id, withdrawn_at) values (torny_rls.fc_game(4), torny_rls.fc_b5(), now()) $q$,
  'one flight: a withdrawn row does not count');

select throws_ok(
  $q$ update public.games set status = 'active', started_at = now() where id = torny_rls.fc_game(8) $q$,
  '23514', 'bbb_too_many_players',
  'one flight: a round with five active players does not start');

update public.game_players set withdrawn_at = now() where game_id = torny_rls.fc_game(8) and user_id = torny_rls.fc_b5();

select lives_ok(
  $q$ update public.games set status = 'active', started_at = now() where id = torny_rls.fc_game(8) $q$,
  'one flight: with four it starts');

update public.games set status = 'finished' where id = torny_rls.fc_game(8);

update public.game_players set withdrawn_at = null where game_id = torny_rls.fc_game(8) and user_id = torny_rls.fc_b5();

select lives_ok(
  $q$ update public.games set status = 'active' where id = torny_rls.fc_game(8) $q$,
  'one flight: reopening a finished round is not a start');

select throws_ok(
  $q$ update public.games set game_mode = 'bingo_bango_bongo', mode_config = '{"kind":"bingo_bango_bongo","team_size":1}' where id = torny_rls.fc_game(9) $q$,
  '23514', 'bbb_too_many_players',
  'one flight: a round in progress with five cannot change format to Bingo Bango Bongo');

select lives_ok(
  $q$ insert into public.game_players (game_id, user_id) values (torny_rls.fc_game(9), torny_rls.fc_out()) $q$,
  'one flight: other formats are not limited by it');

select * from finish();

rollback;
