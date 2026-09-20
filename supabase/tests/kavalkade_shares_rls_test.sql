-- supabase/tests/kavalkade_shares_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / privilege / constraint integration test: kavalkade_shares (#2130, epic
-- #1040, migrasjon 0183), ende-til-ende mot ekte Postgres-roller.
--
--   ALLOWED:
--     1. eieren leser sine egne delinger                      → PASS
--
--   FORBIDDEN (den fiendtlige direkte-forespørselen):
--     2. en annen innlogget spiller leser dem                 → 0 rader (RLS using)
--     3. anon leser hva som helst                             → REJECTED (rettigheter)
--     4. INSERT som innlogget, med sin egen user_id           → REJECTED (rettighet)
--     5. UPDATE av sin egen rad                               → REJECTED (rettighet)
--     6. DELETE av sin egen rad                               → REJECTED (rettighet)
--
--   Formen på raden (felle 4 — DB-en er ytterste vakt):
--     7. ukjent card_kind                                     → REJECTED (23514)
--     8. year utenfor 2020–2100                               → REJECTED (23514)
--
--   Kontroll:
--     9. raden står urørt etter alle forsøkene
--
-- Merk hva som IKKE testes: det finnes ingen unik nøkkel. To delinger av samme
-- kort er to hendelser, og det er med vilje (se 0183).
--
-- Kjøres som `authenticated` med forfalsket JWT-`sub`, samme sti appen bruker.
-- Rigg: supabase/tests/README.md.
-- Run via:  supabase test db   (npm run test:rls)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

\ir fixtures/rls_helpers.psql

-- Seed: brukerne kommer fra den delte fikstur-grafen.
select torny_rls.as_service();
select torny_rls.seed_active_game();

-- Eieren delte ett kort. Skrevet som service-rolle, slik server-actionen gjør.
insert into public.kavalkade_shares (user_id, year, card_kind)
  values (torny_rls.active_id(), 2026, 'best-round');

-- ── Prober (rulles tilbake med transaksjonen) ────────────────────────────────

-- count_shares(owner): antall rader den impersonerte rollen ser for den eieren.
-- -1 betyr at selve lesingen ble avvist på rettigheten.
create or replace function torny_rls.count_shares(p_owner uuid)
  returns int
  language plpgsql
  as $$
  declare v_count int;
  begin
    select count(*) into v_count from public.kavalkade_shares where user_id = p_owner;
    return v_count;
  exception
    when insufficient_privilege then return -1;
  end;
  $$;

-- try_insert_share(owner): TRUE hvis raden landet.
create or replace function torny_rls.try_insert_share(p_owner uuid)
  returns boolean
  language plpgsql
  as $$
  begin
    insert into public.kavalkade_shares (user_id, year, card_kind)
      values (p_owner, 2026, 'team');
    return true;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_update_share(owner): TRUE hvis en rad faktisk ble endret.
create or replace function torny_rls.try_update_share(p_owner uuid)
  returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    update public.kavalkade_shares set card_kind = 'rival' where user_id = p_owner;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_delete_share(owner): TRUE hvis en rad faktisk ble slettet.
create or replace function torny_rls.try_delete_share(p_owner uuid)
  returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    delete from public.kavalkade_shares where user_id = p_owner;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- probe_as_anon_share(owner): kjør lesingen som anon, og legg rollen tilbake
-- etterpå — pgTAP selv skal ikke kjøre som anon.
create or replace function torny_rls.probe_as_anon_share(p_owner uuid)
  returns int
  language plpgsql
  as $$
  declare v int;
  begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', null, true);
    v := torny_rls.count_shares(p_owner);
    perform set_config('role', 'postgres', true);
    return v;
  end;
  $$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- ALLOWED — dine egne delinger
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select is(
  torny_rls.count_shares(torny_rls.active_id()),
  1,
  'eieren SER sin egen deling'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — den fiendtlige flata
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.outsider_id());

select is(
  torny_rls.count_shares(torny_rls.active_id()),
  0,
  'en annen innlogget spiller ser INGEN rader (RLS using filtrerer til 0)'
);

select torny_rls.as_service();
select is(
  torny_rls.probe_as_anon_share(torny_rls.active_id()),
  -1,
  'anon har INGEN lesetilgang i det hele tatt (rettigheter trukket)'
);

select torny_rls.as_user(torny_rls.active_id());

select ok(
  not torny_rls.try_insert_share(torny_rls.active_id()),
  'INSERT er blokkert selv med sin EGEN user_id (skriving eies av service-rollen)'
);

select ok(
  not torny_rls.try_update_share(torny_rls.active_id()),
  'UPDATE av sin egen rad er blokkert (raden er en hendelse, ikke en tilstand)'
);

select ok(
  not torny_rls.try_delete_share(torny_rls.active_id()),
  'DELETE av sin egen rad er blokkert'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Formen på raden — DB-en er ytterste vakt (felle 4)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_service();

select throws_ok(
  $$ insert into public.kavalkade_shares (user_id, year, card_kind)
       values (torny_rls.outsider_id(), 2026, 'beste-runde') $$,
  '23514',
  null,
  'ukjent card_kind er REJECTED (lista har ett hjem, speilet i cardModel.ts)'
);

select throws_ok(
  $$ insert into public.kavalkade_shares (user_id, year, card_kind)
       values (torny_rls.outsider_id(), 1999, 'team') $$,
  '23514',
  null,
  'year utenfor 2020–2100 er REJECTED'
);

-- Kontroll: raden finnes fortsatt, så assertene over målte noe ekte.
select is(
  (select count(*)::int from public.kavalkade_shares where user_id = torny_rls.active_id()),
  1,
  'kontroll: eierens rad står urørt etter alle forsøkene'
);

select * from finish();
rollback;
