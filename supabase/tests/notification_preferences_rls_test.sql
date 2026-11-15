-- supabase/tests/notification_preferences_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / privilege / CHECK / trigger integration test: notification_preferences
-- (#2315 PR A, migrasjon 0236), ende-til-ende mot ekte Postgres-roller.
--
-- Varselvalgene bor i en egen tabell, ikke på users: users-raden kan leses av
-- medspillere. Her slipper RLS bare eieren av raden til. Serveren leser med
-- service-rollen (notify()).
--
--   ALLOWED:
--     1. eieren setter inn sin egen rad                       → PASS
--     2. eieren leser sin egen rad                            → 1 rad
--     3. eieren lagrer valgene med upsert (insert … on conflict do update),
--        slik appen gjør                                      → PASS, verdien endret
--     4. eieren endrer sin egen rad (stille tid av → på)      → PASS, verdien endret
--
--   FORBIDDEN (den fiendtlige direkte-forespørselen):
--     5. en annen innlogget leser raden                       → 0 rader (RLS using)
--     6. en annen setter inn en rad for en tredje bruker      → REJECTED (with check)
--     7. en annen endrer eierens rad (hostile PATCH)          → 0 rader
--     8. en annen upserter over eierens rad                   → eierens verdi står
--        uendret, lest som service-rollen
--     9. eieren flytter raden til en annen user_id            → REJECTED (with check)
--    10. eieren sletter sin egen rad                          → REJECTED (rettighet)
--    11. authenticated har ingen DELETE-rettighet på tabellen (låser revoke-en;
--        punkt 10 alene ville stått grønt uten den, fordi ingen DELETE-policy
--        finnes og slettingen da treffer null rader)
--    12. authenticated har heller ingen TRUNCATE, REFERENCES eller TRIGGER
--
--   CHECK (bare de tre gruppene som kan slås av):
--    13. 'rounds' (alltid på) i lista                         → check_violation
--    14. 'news' (gruppa som gikk ut, eierens svar 14.11)      → check_violation
--    15. en ukjent verdi                                      → check_violation
--    16. alle tre gruppene som kan slås av                    → lagret
--
--   Standardverdier og triggeren:
--    17. en rad med bare user_id får tom liste, stille tid av og deling på
--        (share_rare_shots, #2894, 0238)
--    18. en klient-sendt updated_at overstyres med now() ved INSERT
--    19. … og ved UPDATE
--
--   anon:
--    20. anon leser hva som helst                             → REJECTED (rettighet)
--    21. anon har ingen SELECT-rettighet på tabellen
--
--   Sletting:
--    22. sletting av brukeren (auth.users) sletter raden      → CASCADE
--
--   «Del sjeldne slag med alle» (#2894, 0238):
--    23. en annen slår av delingen på eierens rad (hostile PATCH) → 0 rader
--    24. eieren slår av delingen med PostgREST-upserten (bare den kolonnen
--        i SET-lista, slik appens saveRareShotSharing sender den) → PASS
--
--   Kontroll:
--    25. service-rollen ser eierens rad med verdiene fra punkt 4, 16 og 24:
--        upserten i 24 lot varselvalgene stå
--
-- Anonymiseringen (spilleren som har spilt) dekkes i users_anonymize_test.sql
-- og users_anonymize_fk_coverage_test.sql.
-- Kjøres som `authenticated` med forfalsket JWT-`sub`, samme sti appen bruker.
-- Rigg: supabase/tests/README.md.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

\ir fixtures/rls_helpers.psql

select torny_rls.as_service();
select torny_rls.seed_active_game();

-- ── Prober (rulles tilbake med transaksjonen) ────────────────────────────────

-- count_notification_preferences(owner): rader den impersonerte rollen ser for
-- eieren. -1 betyr at selve lesingen ble avvist på rettigheten.
create or replace function torny_rls.count_notification_preferences(p_owner uuid)
  returns int
  language plpgsql
  as $$
  declare v_count int;
  begin
    select count(*) into v_count from public.notification_preferences where user_id = p_owner;
    return v_count;
  exception
    when insufficient_privilege then return -1;
  end;
  $$;

-- try_insert_notification_preferences(owner, quiet): TRUE hvis raden landet.
-- Et brudd på RLS-ens with check er også 42501 (insufficient_privilege).
create or replace function torny_rls.try_insert_notification_preferences(p_owner uuid, p_quiet boolean)
  returns boolean
  language plpgsql
  as $$
  begin
    insert into public.notification_preferences (user_id, quiet_hours) values (p_owner, p_quiet);
    return true;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_update_notification_preferences(owner, quiet): TRUE hvis en rad faktisk
-- ble endret.
create or replace function torny_rls.try_update_notification_preferences(p_owner uuid, p_quiet boolean)
  returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    update public.notification_preferences set quiet_hours = p_quiet where user_id = p_owner;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_upsert_notification_preferences(owner, quiet): PostgREST sin upsert.
-- TRUE hvis raden etterpå har verdien. Krever både INSERT- og UPDATE-retten og
-- -policyen.
create or replace function torny_rls.try_upsert_notification_preferences(p_owner uuid, p_quiet boolean)
  returns boolean
  language plpgsql
  as $$
  begin
    insert into public.notification_preferences (user_id, quiet_hours) values (p_owner, p_quiet)
      on conflict (user_id) do update set quiet_hours = excluded.quiet_hours;
    return exists (
      select 1 from public.notification_preferences where user_id = p_owner and quiet_hours = p_quiet
    );
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_move_notification_preferences(owner, new_owner): TRUE hvis raden fikk ny
-- user_id.
create or replace function torny_rls.try_move_notification_preferences(p_owner uuid, p_new_owner uuid)
  returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    update public.notification_preferences set user_id = p_new_owner where user_id = p_owner;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_delete_notification_preferences(owner): TRUE hvis en rad faktisk ble
-- slettet.
create or replace function torny_rls.try_delete_notification_preferences(p_owner uuid)
  returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    delete from public.notification_preferences where user_id = p_owner;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_set_muted_groups(owner, groups): 'saved' når raden fikk lista,
-- 'check_violation' når CHECK-en stoppet den, 'no_rows' når ingen rad ble
-- truffet, 'denied' når rettigheten manglet.
create or replace function torny_rls.try_set_muted_groups(p_owner uuid, p_groups text[])
  returns text
  language plpgsql
  as $$
  declare v_rows int;
  begin
    update public.notification_preferences set muted_groups = p_groups where user_id = p_owner;
    get diagnostics v_rows = row_count;
    return case when v_rows > 0 then 'saved' else 'no_rows' end;
  exception
    when check_violation then return 'check_violation';
    when insufficient_privilege then return 'denied';
  end;
  $$;

-- probe_as_anon_notification_preferences(owner): lesingen som anon, og rollen
-- tilbake etterpå.
create or replace function torny_rls.probe_as_anon_notification_preferences(p_owner uuid)
  returns int
  language plpgsql
  as $$
  declare v int;
  begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', null, true);
    v := torny_rls.count_notification_preferences(p_owner);
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
  torny_rls.try_insert_notification_preferences(torny_rls.active_id(), true),
  'eieren kan sette inn sin EGEN rad'
);

select is(
  torny_rls.count_notification_preferences(torny_rls.active_id()),
  1,
  'eieren SER sin egen rad'
);

select ok(
  torny_rls.try_upsert_notification_preferences(torny_rls.active_id(), false),
  'eieren kan lagre valgene med upsert (insert … on conflict do update)'
);

select ok(
  torny_rls.try_update_notification_preferences(torny_rls.active_id(), true),
  'eieren kan endre sin egen rad (stille tid av → på)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — den fiendtlige flata
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.flightmate_id());

select is(
  torny_rls.count_notification_preferences(torny_rls.active_id()),
  0,
  'en medspiller ser INGEN rader for eieren (RLS using filtrerer til 0)'
);

select ok(
  not torny_rls.try_insert_notification_preferences(torny_rls.outsider_id(), true),
  'en annen kan IKKE sette inn en rad med andres user_id (with check)'
);

select ok(
  not torny_rls.try_update_notification_preferences(torny_rls.active_id(), false),
  'en annen kan IKKE endre eierens rad (hostile PATCH treffer 0 rader)'
);

select torny_rls.try_upsert_notification_preferences(torny_rls.active_id(), false);
select torny_rls.as_service();
select is(
  (select quiet_hours from public.notification_preferences where user_id = torny_rls.active_id()),
  true,
  'en annen kan IKKE upserte over eierens rad (verdien står uendret)'
);

select torny_rls.as_user(torny_rls.active_id());

select ok(
  not torny_rls.try_move_notification_preferences(torny_rls.active_id(), torny_rls.flightmate_id()),
  'eieren kan IKKE flytte raden til en annen user_id (with check på update)'
);

select ok(
  not torny_rls.try_delete_notification_preferences(torny_rls.active_id()),
  'eieren kan IKKE slette raden (ingen DELETE-rettighet)'
);

select ok(
  not has_table_privilege('authenticated', 'public.notification_preferences', 'delete'),
  'authenticated mangler DELETE-rettigheten på notification_preferences'
);

select ok(
  not has_table_privilege('authenticated', 'public.notification_preferences', 'truncate')
    and not has_table_privilege('authenticated', 'public.notification_preferences', 'references')
    and not has_table_privilege('authenticated', 'public.notification_preferences', 'trigger'),
  'authenticated mangler TRUNCATE, REFERENCES og TRIGGER på notification_preferences'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- CHECK — bare de tre gruppene som kan slås av
-- ═════════════════════════════════════════════════════════════════════════════
select is(
  torny_rls.try_set_muted_groups(torny_rls.active_id(), array['friends', 'rounds']),
  'check_violation',
  'CHECK stopper rounds («Rundene dine» er alltid på)'
);

select is(
  torny_rls.try_set_muted_groups(torny_rls.active_id(), array['news']),
  'check_violation',
  'CHECK stopper news (gruppa finnes ikke)'
);

select is(
  torny_rls.try_set_muted_groups(torny_rls.active_id(), array['ukjent']),
  'check_violation',
  'CHECK stopper en ukjent verdi'
);

select is(
  torny_rls.try_set_muted_groups(torny_rls.active_id(), array['scorecards', 'friends', 'signups']),
  'saved',
  'alle tre gruppene som kan slås av, lagres'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Standardverdier og triggeren — updated_at settes av databasen
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.outsider_id());
insert into public.notification_preferences (user_id, updated_at)
  values (torny_rls.outsider_id(), '2000-01-01T00:00:00Z');

select torny_rls.as_service();
select ok(
  (select muted_groups = '{}'::text[] and quiet_hours = false and share_rare_shots = true
     from public.notification_preferences where user_id = torny_rls.outsider_id()),
  'en rad med bare user_id får tom liste, stille tid av og deling på (standardverdiene)'
);

select is(
  (select updated_at from public.notification_preferences where user_id = torny_rls.outsider_id()),
  now(),
  'en klient-sendt updated_at overstyres av triggeren (now())'
);

select torny_rls.as_user(torny_rls.outsider_id());
update public.notification_preferences
  set quiet_hours = true, updated_at = '2000-01-01T00:00:00Z'
  where user_id = torny_rls.outsider_id();

select torny_rls.as_service();
select is(
  (select updated_at from public.notification_preferences where user_id = torny_rls.outsider_id()),
  now(),
  'en klient-sendt updated_at overstyres også ved endring (update)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- anon — ingenting
-- ═════════════════════════════════════════════════════════════════════════════
select is(
  torny_rls.probe_as_anon_notification_preferences(torny_rls.active_id()),
  -1,
  'anon har INGEN lesetilgang (rettigheter trukket)'
);

select ok(
  not has_table_privilege('anon', 'public.notification_preferences', 'select'),
  'anon mangler SELECT-rettigheten på notification_preferences'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Sletting — raden følger brukeren (ON DELETE CASCADE ved full sletting)
-- ═════════════════════════════════════════════════════════════════════════════
delete from auth.users where id = torny_rls.outsider_id();

select is(
  (select count(*) from public.notification_preferences where user_id = torny_rls.outsider_id()),
  0::bigint,
  'sletting av brukeren sletter raden med varselvalgene (cascade)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- «Del sjeldne slag med alle» (#2894, 0238) — samme eier-policyer som resten
-- ═════════════════════════════════════════════════════════════════════════════
-- try_set_share_rare_shots(owner, share): TRUE hvis en rad faktisk ble endret.
create or replace function torny_rls.try_set_share_rare_shots(p_owner uuid, p_share boolean)
  returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    update public.notification_preferences set share_rare_shots = p_share where user_id = p_owner;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

select torny_rls.as_user(torny_rls.flightmate_id());
select ok(
  not torny_rls.try_set_share_rare_shots(torny_rls.active_id(), false),
  'en annen kan IKKE slå av delingen på eierens rad (0 rader)'
);

-- PostgREST sin upsert med bare user_id og share_rare_shots i nyttelasten:
-- SET-lista har bare kolonnene som ble sendt.
select torny_rls.as_user(torny_rls.active_id());
select lives_ok(
  $$insert into public.notification_preferences (user_id, share_rare_shots)
      values (torny_rls.active_id(), false)
      on conflict (user_id) do update
        set user_id = excluded.user_id, share_rare_shots = excluded.share_rare_shots$$,
  'eieren slår av delingen med upsert av bare den kolonnen'
);

-- Kontroll: eierens rad finnes, med verdiene fra endringene over.
select torny_rls.as_service();
select ok(
  (select quiet_hours = true
          and muted_groups = array['scorecards', 'friends', 'signups']::text[]
          and share_rare_shots = false
     from public.notification_preferences where user_id = torny_rls.active_id()),
  'service-rollen ser eierens rad med stille tid på, de tre gruppene dempet og delingen av'
);

select * from finish();
rollback;
