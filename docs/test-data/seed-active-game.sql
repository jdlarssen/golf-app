-- ============================================================================
-- Tørny — test-seed for ny hull-skjerm (quick-win-1)
-- Lager én aktiv turnering med deg + 3 dummy-spillere i samme flight, så du
-- kan teste hele score-input-flyten uten å invitere ekte folk.
--
-- Kjør i: Supabase Dashboard → SQL Editor
-- Forutsetning: minst ett kurs med 18 course_holes og minst én tee_box finnes.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- TRINN 1 — Finn din egen auth user id. Kopier UUID-en fra resultatet.
-- ----------------------------------------------------------------------------
select id, email
from auth.users
where email = 'eier@example.com';

-- ----------------------------------------------------------------------------
-- TRINN 2 — Sjekk hvilke kurs og tee-bokser som er tilgjengelige.
-- Velg én tee_box og kopier kombinasjonen course_id + tee_box_id under.
-- ----------------------------------------------------------------------------
select c.id as course_id,
       c.name as course_name,
       t.id as tee_box_id,
       t.name as tee_name,
       t.slope,
       t.course_rating,
       t.par_total,
       (select count(*) from public.course_holes where course_id = c.id) as holes_defined
from public.courses c
join public.tee_boxes t on t.course_id = c.id
order by c.name, t.name;


-- ----------------------------------------------------------------------------
-- TRINN 3 — Selve seeden. Bytt ut PLACEHOLDERS før du kjører.
-- ----------------------------------------------------------------------------
do $$
declare
  -- 🔧 BYTT UT disse tre verdiene fra trinn 1 + 2:
  my_user_id    constant uuid := '00000000-0000-0000-0000-000000000000';  -- din auth.users.id
  course_uuid   constant uuid := '00000000-0000-0000-0000-000000000000';  -- en courses.id
  tee_uuid      constant uuid := '00000000-0000-0000-0000-000000000000';  -- en tee_boxes.id (samme kurs)

  -- 🎲 Genererte UUIDs for dummy-spillerne:
  dummy1_id uuid := gen_random_uuid();
  dummy2_id uuid := gen_random_uuid();
  dummy3_id uuid := gen_random_uuid();
  game_uuid uuid;
begin
  -- 1) Dummy auth.users — disse logger aldri inn, bare brukes som referanser
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    ('00000000-0000-0000-0000-000000000000', dummy1_id, 'authenticated', 'authenticated',
     'erik+torny-test@example.com', '',
     now(), '{"provider":"email"}', '{"name":"Erik Test"}',
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', dummy2_id, 'authenticated', 'authenticated',
     'sindre+torny-test@example.com', '',
     now(), '{"provider":"email"}', '{"name":"Sindre Test"}',
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', dummy3_id, 'authenticated', 'authenticated',
     'andreas+torny-test@example.com', '',
     now(), '{"provider":"email"}', '{"name":"Andreas Test"}',
     now(), now(), '', '', '', '');

  -- 2) public.users — utvider auth.users med navn/HCP
  insert into public.users (id, email, name, nickname, hcp_index, is_admin) values
    (dummy1_id, 'erik+torny-test@example.com',    'Erik Test',    'Erik',  14.0, false),
    (dummy2_id, 'sindre+torny-test@example.com',  'Sindre Test',  null,    22.0, false),
    (dummy3_id, 'andreas+torny-test@example.com', 'Andreas Test', 'Bjarne', 8.0, false);

  -- 3) Selve spillet (status = 'active' så det ruter rett inn i /holes/N)
  insert into public.games (
    name, course_id, tee_box_id, status, hcp_allowance_pct,
    require_peer_approval, created_by, started_at
  ) values (
    'Test-runde (quick-win-1 smoketest)', course_uuid, tee_uuid, 'active', 100,
    false, my_user_id, now()
  ) returning id into game_uuid;

  -- 4) 4 spillere i én flight, fordelt på 2 lag (par-konkurranse)
  --    course_handicap er frozen-at-start; her satt manuelt for testen.
  insert into public.game_players
    (game_id, user_id, team_number, flight_number, course_handicap) values
    (game_uuid, my_user_id, 1, 1, 12),
    (game_uuid, dummy1_id, 1, 1, 14),
    (game_uuid, dummy2_id, 2, 1, 22),
    (game_uuid, dummy3_id, 2, 1,  8);

  raise notice '';
  raise notice '✅ Test-game opprettet.';
  raise notice '   game_id = %', game_uuid;
  raise notice '   Test-URL: https://tornygolf.no/games/%/holes/1', game_uuid;
  raise notice '';
end $$;


-- ----------------------------------------------------------------------------
-- BONUS — sjekk at det ble laget (skal returnere 1 rad):
-- ----------------------------------------------------------------------------
select g.id, g.name, g.status, g.created_at,
       (select count(*) from public.game_players where game_id = g.id) as players
from public.games g
where g.name = 'Test-runde (quick-win-1 smoketest)'
order by g.created_at desc
limit 1;


-- ============================================================================
-- CLEANUP — kjør når du er ferdig med testen.
-- Fjern alt seed-data (test-game, scores, dummy-brukere). Trygt å kjøre flere
-- ganger; sletter kun ting med 'torny-test@example.com'-mønsteret.
-- ============================================================================
-- delete from public.scores where game_id in (
--   select id from public.games where name = 'Test-runde (quick-win-1 smoketest)'
-- );
-- delete from public.game_players where game_id in (
--   select id from public.games where name = 'Test-runde (quick-win-1 smoketest)'
-- );
-- delete from public.games where name = 'Test-runde (quick-win-1 smoketest)';
-- delete from public.users where email like '%+torny-test@example.com';
-- delete from auth.users where email like '%+torny-test@example.com';
