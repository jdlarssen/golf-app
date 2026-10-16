-- supabase/tests/ai_consents_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / privilege / trigger integration test: ai_consents (#2561 PR B,
-- migrasjon 0210), ende-til-ende mot ekte Postgres-roller.
--
-- Samtykket bor i en egen tabell, ikke på users: users-raden kan leses av
-- medspillere, og et «nei» der ville vist dem hvem som har sagt nei. Her
-- slipper RLS bare eieren av raden til. Serveren leser med service-rollen.
--
--   ALLOWED:
--     1. eieren setter inn sin egen rad                       → PASS
--     2. eieren leser sin egen rad                            → 1 rad
--     3. eieren lagrer svaret med upsert (insert … on conflict do update),
--        slik appen og nettet gjør                            → PASS, verdien endret
--     4. eieren endrer sin egen rad                           → PASS
--
--   FORBIDDEN (den fiendtlige direkte-forespørselen):
--     5. en annen innlogget leser raden                       → 0 rader (RLS using)
--     6. en annen setter inn en rad for en tredje bruker      → REJECTED (with check)
--     7. en annen endrer eierens rad (hostile PATCH)          → 0 rader
--     8. en annen upserter over eierens rad                   → REJECTED (RLS using)
--     9. eieren flytter raden til en annen user_id            → REJECTED (with check)
--    10. eieren sletter sin egen rad                          → REJECTED (rettighet)
--    11. authenticated har ingen DELETE-rettighet på tabellen (låser revoke-en;
--        punkt 10 alene ville stått grønt uten den, fordi ingen DELETE-policy
--        finnes og slettingen da treffer null rader)
--    12. authenticated har heller ingen TRUNCATE, REFERENCES eller TRIGGER
--
--   Triggeren:
--    13. en klient-sendt answered_at overstyres med now() ved INSERT
--    14. … og ved UPDATE
--
--   anon:
--    15. anon leser hva som helst                             → REJECTED (rettighet)
--    16. anon har ingen SELECT-rettighet på tabellen
--
--   Sletting:
--    17. sletting av brukeren (auth.users) sletter raden      → CASCADE
--
--   Kontroll:
--    18. service-rollen ser eierens rad med verdien fra punkt 4
--
-- Anonymiseringen (spilleren som har spilt) dekkes i users_anonymize_test.sql
-- og users_anonymize_fk_coverage_test.sql.
-- Kjøres som `authenticated` med forfalsket JWT-`sub`, samme sti appen bruker.
-- Rigg: supabase/tests/README.md.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

\ir fixtures/rls_helpers.psql

select torny_rls.as_service();
select torny_rls.seed_active_game();

-- ── Prober (rulles tilbake med transaksjonen) ────────────────────────────────

-- count_ai_consents(owner): rader den impersonerte rollen ser for eieren.
-- -1 betyr at selve lesingen ble avvist på rettigheten.
create or replace function torny_rls.count_ai_consents(p_owner uuid)
  returns int
  language plpgsql
  as $$
  declare v_count int;
  begin
    select count(*) into v_count from public.ai_consents where user_id = p_owner;
    return v_count;
  exception
    when insufficient_privilege then return -1;
  end;
  $$;

-- try_insert_ai_consent(owner, granted): TRUE hvis raden landet. Et brudd på
-- RLS-ens with check er også 42501 (insufficient_privilege).
create or replace function torny_rls.try_insert_ai_consent(p_owner uuid, p_granted boolean)
  returns boolean
  language plpgsql
  as $$
  begin
    insert into public.ai_consents (user_id, granted) values (p_owner, p_granted);
    return true;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_update_ai_consent(owner, granted): TRUE hvis en rad faktisk ble endret.
create or replace function torny_rls.try_update_ai_consent(p_owner uuid, p_granted boolean)
  returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    update public.ai_consents set granted = p_granted where user_id = p_owner;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_upsert_ai_consent(owner, granted): PostgREST sin upsert. TRUE hvis raden
-- etterpå har verdien. Krever både INSERT- og UPDATE-retten og -policyen.
create or replace function torny_rls.try_upsert_ai_consent(p_owner uuid, p_granted boolean)
  returns boolean
  language plpgsql
  as $$
  begin
    insert into public.ai_consents (user_id, granted) values (p_owner, p_granted)
      on conflict (user_id) do update set granted = excluded.granted;
    return exists (
      select 1 from public.ai_consents where user_id = p_owner and granted = p_granted
    );
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_move_ai_consent(owner, new_owner): TRUE hvis raden fikk ny user_id.
create or replace function torny_rls.try_move_ai_consent(p_owner uuid, p_new_owner uuid)
  returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    update public.ai_consents set user_id = p_new_owner where user_id = p_owner;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_delete_ai_consent(owner): TRUE hvis en rad faktisk ble slettet.
create or replace function torny_rls.try_delete_ai_consent(p_owner uuid)
  returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    delete from public.ai_consents where user_id = p_owner;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- probe_as_anon_ai_consents(owner): lesingen som anon, og rollen tilbake etterpå.
create or replace function torny_rls.probe_as_anon_ai_consents(p_owner uuid)
  returns int
  language plpgsql
  as $$
  declare v int;
  begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', null, true);
    v := torny_rls.count_ai_consents(p_owner);
    perform set_config('role', 'postgres', true);
    return v;
  end;
  $$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- ALLOWED — din egen rad
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select ok(
  torny_rls.try_insert_ai_consent(torny_rls.active_id(), true),
  'eieren kan sette inn sin EGEN rad'
);

select is(
  torny_rls.count_ai_consents(torny_rls.active_id()),
  1,
  'eieren SER sin egen rad'
);

select ok(
  torny_rls.try_upsert_ai_consent(torny_rls.active_id(), false),
  'eieren kan lagre svaret med upsert (insert … on conflict do update)'
);

select ok(
  torny_rls.try_update_ai_consent(torny_rls.active_id(), false),
  'eieren kan endre sin egen rad (ombestemme seg)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — den fiendtlige flata
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.flightmate_id());

select is(
  torny_rls.count_ai_consents(torny_rls.active_id()),
  0,
  'en medspiller ser INGEN rader for eieren (RLS using filtrerer til 0)'
);

select ok(
  not torny_rls.try_insert_ai_consent(torny_rls.outsider_id(), true),
  'en annen kan IKKE sette inn en rad med andres user_id (with check)'
);

select ok(
  not torny_rls.try_update_ai_consent(torny_rls.active_id(), true),
  'en annen kan IKKE endre eierens rad (hostile PATCH treffer 0 rader)'
);

select ok(
  not torny_rls.try_upsert_ai_consent(torny_rls.active_id(), true),
  'en annen kan IKKE upserte over eierens rad'
);

select torny_rls.as_user(torny_rls.active_id());

select ok(
  not torny_rls.try_move_ai_consent(torny_rls.active_id(), torny_rls.flightmate_id()),
  'eieren kan IKKE flytte raden til en annen user_id (with check på update)'
);

select ok(
  not torny_rls.try_delete_ai_consent(torny_rls.active_id()),
  'eieren kan IKKE slette raden (ingen DELETE-rettighet)'
);

select ok(
  not has_table_privilege('authenticated', 'public.ai_consents', 'delete'),
  'authenticated mangler DELETE-rettigheten på ai_consents'
);

select ok(
  not has_table_privilege('authenticated', 'public.ai_consents', 'truncate')
    and not has_table_privilege('authenticated', 'public.ai_consents', 'references')
    and not has_table_privilege('authenticated', 'public.ai_consents', 'trigger'),
  'authenticated mangler TRUNCATE, REFERENCES og TRIGGER på ai_consents'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Triggeren — answered_at settes av databasen
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.outsider_id());
insert into public.ai_consents (user_id, granted, answered_at)
  values (torny_rls.outsider_id(), true, '2000-01-01T00:00:00Z');

select torny_rls.as_service();
select is(
  (select answered_at from public.ai_consents where user_id = torny_rls.outsider_id()),
  now(),
  'en klient-sendt answered_at overstyres av triggeren (now())'
);

select torny_rls.as_user(torny_rls.outsider_id());
update public.ai_consents
  set granted = false, answered_at = '2000-01-01T00:00:00Z'
  where user_id = torny_rls.outsider_id();

select torny_rls.as_service();
select is(
  (select answered_at from public.ai_consents where user_id = torny_rls.outsider_id()),
  now(),
  'en klient-sendt answered_at overstyres også ved endring (update)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- anon — ingenting
-- ═════════════════════════════════════════════════════════════════════════════
select is(
  torny_rls.probe_as_anon_ai_consents(torny_rls.active_id()),
  -1,
  'anon har INGEN lesetilgang (rettigheter trukket)'
);

select ok(
  not has_table_privilege('anon', 'public.ai_consents', 'select'),
  'anon mangler SELECT-rettigheten på ai_consents'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Sletting — raden følger brukeren (ON DELETE CASCADE ved full sletting)
-- ═════════════════════════════════════════════════════════════════════════════
delete from auth.users where id = torny_rls.outsider_id();

select is(
  (select count(*) from public.ai_consents where user_id = torny_rls.outsider_id()),
  0::bigint,
  'sletting av brukeren sletter samtykke-raden (cascade)'
);

-- Kontroll: eierens rad finnes, med verdien fra endringen over.
select is(
  (select granted from public.ai_consents where user_id = torny_rls.active_id()),
  false,
  'service-rollen ser eierens rad med granted = false etter endringen'
);

select * from finish();
rollback;
