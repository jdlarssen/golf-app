-- supabase/tests/roster_candidates_rpc_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Fiendtlig integrasjonstest for `public.roster_candidates(uuid)` (#1919, 0181),
-- kjørt som ekte `authenticated`-rolle mot ekte Postgres.
--
-- Funksjonen er SECURITY DEFINER, altså leser den `public.users` med definer-
-- rettigheter og går UTENOM RLS. Det er hele grunnen til at den finnes — og
-- nøyaktig derfor den må angripes: den er nå den eneste porten mellom en
-- innlogget bruker og navnene i basen.
--
-- De to egenskapene som bærer sikkerheten:
--   (a) Kalleren er `auth.uid()` og ALDRI en parameter. Det finnes ingen id å
--       bytte ut, så «vis meg en annens nettverk» er ikke uttrykkbart.
--   (b) `p_game_id` slås kun opp når runden er kallerens EGEN. Uten den
--       betingelsen kunne hvem som helst høste medlemslista til en fremmed
--       klubb ved å sende inn en tilfeldig spill-id. Prøve 9 er den prøven.
--
-- ⚠️ Rigge-skriv og assertion står ALDRI i samme setning (#1910): et snapshot
-- tatt i samme setning som skrivet ser ikke skrivet, og testen blir falsk rød.
--
-- Kjøres via:  supabase test db   (booter lokal stack → migrasjoner → hit)
-- Se supabase/tests/README.md.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

\ir fixtures/rls_helpers.psql

-- Fast id for klubb-runden kalleren selv eier (rigget under, ryddet av reset()).
create or replace function torny_rls.own_club_game_id() returns uuid
  language sql immutable as $$ select '00000000-0000-4000-a000-0000000000a1'::uuid $$;

select torny_rls.as_service();
select torny_rls.seed_active_game();

-- ── 1–3: grunnlinja for en ikke-admin ────────────────────────────────────────
-- active_id og flightmate_id deler et spill, altså er de medspillere.
-- outsider_id er hverken venn, medspiller eller klubbmedlem.
select torny_rls.as_user(torny_rls.active_id());

select ok(
  exists (select 1 from public.roster_candidates() r where r.id = torny_rls.flightmate_id()),
  'medspiller står i lista'
);

select ok(
  not exists (select 1 from public.roster_candidates() r where r.id = torny_rls.outsider_id()),
  'en fremmed står IKKE i lista'
);

select ok(
  not exists (select 1 from public.roster_candidates() r where r.id = torny_rls.active_id()),
  'du står ikke i din egen liste'
);

-- ── 4: venn UTEN delt spill — hele poenget med #1919 del B ───────────────────
-- Under RLS er en slik venn usynlig for appen (`users`-policyen krever delt
-- spill). Her skal hen dukke opp.
select torny_rls.as_service();
insert into public.friendships (requester_id, addressee_id, status)
  values (torny_rls.active_id(), torny_rls.outsider_id(), 'accepted');
select torny_rls.as_user(torny_rls.active_id());

select ok(
  exists (select 1 from public.roster_candidates() r where r.id = torny_rls.outsider_id()),
  'en venn du aldri har spilt med står i lista'
);

-- ── 5–6: gjester og slettede kontoer faller ut ───────────────────────────────
-- Begge er medspillere, så det ENESTE som kan fjerne dem er filtrene.
select torny_rls.as_service();
update public.users set is_guest = true where id = torny_rls.submitted_id();
update public.users set deleted_at = now() where id = torny_rls.withdrawn_id();
select torny_rls.as_user(torny_rls.active_id());

select ok(
  not exists (select 1 from public.roster_candidates() r where r.id = torny_rls.submitted_id()),
  'en gjest står ikke i lista, selv som medspiller'
);

select ok(
  not exists (select 1 from public.roster_candidates() r where r.id = torny_rls.withdrawn_id()),
  'en slettet konto står ikke i lista, selv som medspiller (#1012)'
);

-- ── 7–9: klubb-grenen, og angrepet på den ────────────────────────────────────
-- flightmate_id eier klubben; vi legger inn et medlem kalleren ellers ikke ser.
-- Deretter to runder i samme klubb: én kalleren eier, én hen ikke eier.
select torny_rls.as_service();
select torny_rls.seed_group_join();
delete from public.friendships
  where requester_id = torny_rls.active_id() and addressee_id = torny_rls.outsider_id();
insert into public.group_members (group_id, user_id, role)
  values (torny_rls.group_id(), torny_rls.outsider_id(), 'member');
-- Runden kalleren SELV har opprettet, i klubben.
insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, group_id)
  values (torny_rls.own_club_game_id(), 'RLS Own Club Game', torny_rls.course_id(),
          torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay',
          torny_rls.active_id(), torny_rls.group_id());
-- `torny_rls.game_id()` er opprettet av admin_id() — altså IKKE kallerens.
update public.games set group_id = torny_rls.group_id() where id = torny_rls.game_id();
select torny_rls.as_user(torny_rls.active_id());

select ok(
  not exists (select 1 from public.roster_candidates() r where r.id = torny_rls.outsider_id()),
  'klubbmedlemmet dukker ikke opp uten en runde å knytte klubben til'
);

select ok(
  exists (
    select 1 from public.roster_candidates(torny_rls.own_club_game_id()) r
     where r.id = torny_rls.outsider_id()
  ),
  'klubbmedlemmet står i lista for en runde du selv har opprettet'
);

-- DETTE er angrepet: samme klubb, men runden tilhører en annen. Ville
-- `p_game_id` blitt slått opp uten eier-betingelsen, ville en hvilken som helst
-- innlogget bruker kunne lest medlemslista til en klubb hen ikke er med i.
select ok(
  not exists (
    select 1 from public.roster_candidates(torny_rls.game_id()) r
     where r.id = torny_rls.outsider_id()
  ),
  'en fremmed runde gir INGEN tilgang til klubbens medlemmer'
);

-- ── 10: admin-escapen ────────────────────────────────────────────────────────
-- `users`-lesepolicyen gir en admin alle rader i dag. Escapen finnes for at
-- lista ikke skal KRYMPE for eieren når appen bytter til denne funksjonen.
select torny_rls.as_user(torny_rls.admin_id());

select ok(
  exists (select 1 from public.roster_candidates() r where r.id = torny_rls.outsider_id()),
  'en admin ser en bruker hen hverken er venn eller medspiller med'
);

-- ── 11–12: flaten utad ───────────────────────────────────────────────────────
select torny_rls.as_service();

select ok(
  not has_function_privilege('anon', 'public.roster_candidates(uuid)', 'execute'),
  'anon kan ikke kjøre funksjonen'
);

-- `unalike`, ikke `unlike`: pgTAP har ingen `unlike()`. De negerte påstandene
-- heter `unalike` (LIKE) og `doesnt_match` (regex). Argumentene castes eksplisitt
-- til text, så overload-oppslaget ikke står og gjetter på `unknown`.
select unalike(
  (select pg_get_function_result(p.oid)::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'roster_candidates'),
  '%email%'::text,
  'returtypen bærer ingen e-postkolonne'::text
);

select * from finish();

rollback;
