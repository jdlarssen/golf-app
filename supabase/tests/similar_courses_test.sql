-- supabase/tests/similar_courses_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Integrasjonstest for `public.similar_courses(text)` og `public.course_match_key(text)`
-- (#2485, 0222), kjørt som ekte `authenticated`- og `anon`-rolle mot ekte Postgres.
--
-- Funksjonen er SECURITY DEFINER fordi den teller runder i `games`, som ikke er lesbar
-- for alle. Testen låser det den skal gjøre (normalisering, maks fem, rekkefølge,
-- tellingene) og det den ikke skal (anon får ikke kalle den, utkast og planlagte
-- runder teller ikke).
--
-- ⚠️ Rigge-skriv og assertion står ALDRI i samme setning (#1910).
--
-- Kjøres via:  supabase test db   (booter lokal stack → migrasjoner → hit)
-- Se supabase/tests/README.md.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

\ir fixtures/rls_helpers.psql

create or replace function torny_rls.zyx_id(n int) returns uuid
  language sql immutable as $$ select ('00000000-0000-4000-a000-2485000000' || lpad(n::text, 2, '0'))::uuid $$;

select torny_rls.as_service();
select torny_rls.seed_active_game();

-- To baner med samme nøkkel i to skrivemåter, seks til som starter likt, og én med å.
insert into public.courses (id, name, created_by) values
  (torny_rls.zyx_id(1), 'Zyxbane Golfklubb', torny_rls.admin_id()),
  (torny_rls.zyx_id(2), 'Zyxbane North', torny_rls.admin_id()),
  (torny_rls.zyx_id(31), 'Zyxbåne Golfpark', torny_rls.admin_id()),
  (torny_rls.zyx_id(41), 'Qo Golfklubb', torny_rls.admin_id());
insert into public.courses (id, name, created_by)
  select torny_rls.zyx_id(i), 'Zyxbane ' || i, torny_rls.admin_id() from generate_series(3, 8) i;

-- Banen med «golfklubb»: 18 hull (par 73) og to tee-er, den ene arkivert.
insert into public.course_holes (course_id, hole_number, stroke_index, par_mens, par_ladies, par_juniors)
  select torny_rls.zyx_id(1), h, h, case when h = 1 then 5 else 4 end, 4, 4
    from generate_series(1, 18) h;
insert into public.tee_boxes (id, course_id, name, slope_mens, course_rating_mens, par_total_mens, archived_at) values
  (torny_rls.zyx_id(11), torny_rls.zyx_id(1), 'Gul', 113, 70.0, 73, null),
  (torny_rls.zyx_id(12), torny_rls.zyx_id(1), 'Rød', 113, 70.0, 73, now()),
  (torny_rls.zyx_id(21), torny_rls.zyx_id(2), 'Hvit', 113, 70.0, 72, null);

-- «North» har én runde av hver status. Bare aktiv og ferdig teller som brukt.
insert into public.games (name, course_id, tee_box_id, status, game_mode, created_by, started_at) values
  ('Zyx ferdig',   torny_rls.zyx_id(2), torny_rls.zyx_id(21), 'finished',  'solo_strokeplay', torny_rls.admin_id(), now()),
  ('Zyx aktiv',    torny_rls.zyx_id(2), torny_rls.zyx_id(21), 'active',    'solo_strokeplay', torny_rls.admin_id(), now()),
  ('Zyx utkast',   torny_rls.zyx_id(2), torny_rls.zyx_id(21), 'draft',     'solo_strokeplay', torny_rls.admin_id(), null),
  ('Zyx planlagt', torny_rls.zyx_id(2), torny_rls.zyx_id(21), 'scheduled', 'solo_strokeplay', torny_rls.admin_id(), null);

-- ── 1–4: nøkkelen ────────────────────────────────────────────────────────────
select is(public.course_match_key('Zyxbane Golfklubb'), 'zyxbane', '«Golfklubb» strippes');
select is(public.course_match_key('ZYXBANE gk'), 'zyxbane', 'store bokstaver og «GK» gir samme nøkkel');
select is(public.course_match_key('Ørland Golfbane Ås'), 'oerland-aas', 'æøå følger slugify_course_name');
select is(public.course_match_key('Golfklubb'), '', 'bare stoppord gir tom nøkkel');

-- ── 5–13: søket, som en vanlig innlogget spiller som ikke har spilt banene ───
select torny_rls.as_user(torny_rls.outsider_id());

select is(
  (select count(*)::int from public.similar_courses('Zyxbane')), 5,
  'maks fem rader'
);

select is(
  (select s.id from public.similar_courses('zyxbane GK') s limit 1), torny_rls.zyx_id(1),
  'samme nøkkel står først, foran fem andre som starter likt'
);

select is(
  (select s.id from public.similar_courses('zyxbane n') s limit 1), torny_rls.zyx_id(2),
  'et påbegynt navn finner banen det starter på'
);

select is(
  (select count(*)::int from public.similar_courses('Zyxbanee') s
    where s.id = torny_rls.zyx_id(1)), 0,
  'én bokstav for mye treffer ikke (bare hele ord i den retningen)'
);

select ok(
  exists (select 1 from public.similar_courses('Zyxbane Golf og Country Club') s
           where s.id = torny_rls.zyx_id(1)),
  'et lengre navn finner banen når banens nøkkel står som hele ord i det'
);

select ok(
  exists (select 1 from public.similar_courses('ZYXBÅNE') s where s.id = torny_rls.zyx_id(31)),
  'å i søket finner å i navnet'
);

select is(
  (select count(*)::int from public.similar_courses('zy')), 0,
  'en nøkkel under tre tegn treffer ikke delvis'
);

select is(
  (select s.id from public.similar_courses('QO GK') s limit 1), torny_rls.zyx_id(41),
  'en nøkkel under tre tegn treffer samme nøkkel («Qo GK» finner «Qo Golfklubb»)'
);

select is(
  (select s.hole_count || '/' || s.par || '/' || s.tee_count from public.similar_courses('Zyxbane Golfklubb') s
    where s.id = torny_rls.zyx_id(1)), '18/73/1',
  'hull, par (herrer) og bare aktive tee-er'
);

select is(
  (select s.round_count from public.similar_courses('Zyxbane North') s
    where s.id = torny_rls.zyx_id(2)), 2,
  'runder = aktive og ferdige; utkast og planlagte teller ikke'
);

-- ── 14: anon får ikke kalle funksjonen ───────────────────────────────────────
select torny_rls.as_service();
select set_config('role', 'anon', true);

select throws_ok(
  $$ select * from public.similar_courses('Zyxbane') $$,
  '42501',
  null,
  'anon har ikke execute på similar_courses'
);

-- ── 15–16: grantene i katalogen ──────────────────────────────────────────────
select torny_rls.as_service();

select ok(
  not exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'public' and routine_name = 'similar_courses'
       and grantee in ('anon', 'PUBLIC') and privilege_type = 'EXECUTE'
  ),
  'similar_courses: ingen execute for anon eller PUBLIC'
);

select ok(
  exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'public' and routine_name = 'similar_courses'
       and grantee = 'authenticated' and privilege_type = 'EXECUTE'
  ),
  'similar_courses: authenticated har execute'
);

select * from finish();

rollback;
