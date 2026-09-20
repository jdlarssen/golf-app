-- supabase/tests/kavalkades_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / privilege / constraint integration test: kavalkades (#2128, epic #1040,
-- migrasjon 0182), ende-til-ende mot ekte Postgres-roller.
--
--   ALLOWED:
--     1. eieren leser sin egen kavalkade                      → PASS
--
--   FORBIDDEN (den fiendtlige direkte-forespørselen):
--     2. en annen innlogget spiller leser den                 → 0 rader (RLS using)
--     3. anon leser hva som helst                             → REJECTED (rettigheter)
--     4. INSERT som innlogget, med sin egen user_id           → REJECTED (rettighet)
--     5. UPDATE av sin egen rad                               → REJECTED (rettighet)
--     6. DELETE av sin egen rad                               → REJECTED (rettighet)
--
--   Formen på raden (felle 4 — DB-en er ytterste vakt):
--     7. to rader for samme (user_id, year)                   → REJECTED (23505)
--     8. facts som ikke er et objekt                          → REJECTED (23514)
--     9. year utenfor 2020–2100                               → REJECTED (23514)
--
--   Kontroll:
--    10. service-rollen ser raden (så assertene over målte noe ekte)
--
-- Kjøres som `authenticated` med forfalsket JWT-`sub`, samme sti appen bruker.
-- Rigg: supabase/tests/README.md.
-- Run via:  supabase test db   (npm run test:rls)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

\ir fixtures/rls_helpers.psql

-- Seed: brukerne kommer fra den delte fikstur-grafen.
select torny_rls.as_service();
select torny_rls.seed_active_game();

-- Eierens kavalkade for 2026. Skrevet som service-rolle, slik appen gjør det.
insert into public.kavalkades (user_id, year, facts, narrative)
  values (torny_rls.active_id(), 2026, '{"year": 2026, "rounds": 7}'::jsonb, 'Året ditt ble langt.');

-- ── Prober (rulles tilbake med transaksjonen) ────────────────────────────────

-- count_kavalkades(owner): antall rader den impersonerte rollen ser for den
-- eieren. -1 betyr at selve lesingen ble avvist på rettigheten.
create or replace function torny_rls.count_kavalkades(p_owner uuid)
  returns int
  language plpgsql
  as $$
  declare v_count int;
  begin
    select count(*) into v_count from public.kavalkades where user_id = p_owner;
    return v_count;
  exception
    when insufficient_privilege then return -1;
  end;
  $$;

-- try_insert_kavalkade(owner, year): TRUE hvis raden landet.
create or replace function torny_rls.try_insert_kavalkade(p_owner uuid, p_year int)
  returns boolean
  language plpgsql
  as $$
  begin
    insert into public.kavalkades (user_id, year, facts)
      values (p_owner, p_year, '{"year": 2026}'::jsonb);
    return true;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_update_kavalkade(owner): TRUE hvis en rad faktisk ble endret.
create or replace function torny_rls.try_update_kavalkade(p_owner uuid)
  returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    update public.kavalkades set narrative = 'overskrevet' where user_id = p_owner;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_delete_kavalkade(owner): TRUE hvis en rad faktisk ble slettet.
create or replace function torny_rls.try_delete_kavalkade(p_owner uuid)
  returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    delete from public.kavalkades where user_id = p_owner;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- probe_as_anon_kavalkade(owner): kjør lesingen som anon, og legg rollen
-- tilbake etterpå — pgTAP selv skal ikke kjøre som anon.
create or replace function torny_rls.probe_as_anon_kavalkade(p_owner uuid)
  returns int
  language plpgsql
  as $$
  declare v int;
  begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', null, true);
    v := torny_rls.count_kavalkades(p_owner);
    perform set_config('role', 'postgres', true);
    return v;
  end;
  $$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- ALLOWED — din egen kavalkade
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select is(
  torny_rls.count_kavalkades(torny_rls.active_id()),
  1,
  'eieren SER sin egen kavalkade'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — den fiendtlige flata
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.outsider_id());

select is(
  torny_rls.count_kavalkades(torny_rls.active_id()),
  0,
  'en annen innlogget spiller ser INGEN rader (RLS using filtrerer til 0)'
);

select torny_rls.as_service();
select is(
  torny_rls.probe_as_anon_kavalkade(torny_rls.active_id()),
  -1,
  'anon har INGEN lesetilgang i det hele tatt (rettigheter trukket)'
);

select torny_rls.as_user(torny_rls.active_id());

select ok(
  not torny_rls.try_insert_kavalkade(torny_rls.active_id(), 2025),
  'INSERT er blokkert selv med sin EGEN user_id (skriving eies av service-rollen)'
);

select ok(
  not torny_rls.try_update_kavalkade(torny_rls.active_id()),
  'UPDATE av sin egen rad er blokkert (raden er uforanderlig)'
);

select ok(
  not torny_rls.try_delete_kavalkade(torny_rls.active_id()),
  'DELETE av sin egen rad er blokkert'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Formen på raden — DB-en er ytterste vakt (felle 4)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_service();

select throws_ok(
  $$ insert into public.kavalkades (user_id, year, facts)
       values (torny_rls.active_id(), 2026, '{"year": 2026}'::jsonb) $$,
  '23505',
  null,
  'to kavalkader for samme spiller og år er REJECTED (én rad per åpning)'
);

select throws_ok(
  $$ insert into public.kavalkades (user_id, year, facts)
       values (torny_rls.outsider_id(), 2026, '[]'::jsonb) $$,
  '23514',
  null,
  'facts som ikke er et objekt er REJECTED'
);

select throws_ok(
  $$ insert into public.kavalkades (user_id, year, facts)
       values (torny_rls.outsider_id(), 1999, '{"year": 1999}'::jsonb) $$,
  '23514',
  null,
  'year utenfor 2020–2100 er REJECTED'
);

-- Kontroll: raden finnes fortsatt, så assertene over målte noe ekte.
select is(
  (select count(*)::int from public.kavalkades where user_id = torny_rls.active_id()),
  1,
  'kontroll: eierens rad står urørt etter alle forsøkene'
);

select * from finish();
rollback;
