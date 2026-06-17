-- 0104_harden_security_definer_functions.sql
-- #671: Hardne SECURITY DEFINER-funksjoner: fjern anon-tilgang til
-- email_is_in_auth_users + legg til SET search_path på 5 RLS-helpere.
--
-- Del 1 — email_is_in_auth_users: revoke anon EXECUTE
-- ─────────────────────────────────────────────────────────────────────────────
-- Situasjon (0017): email_is_in_auth_users(text) er SECURITY DEFINER og er
-- gitt EXECUTE til `anon`. Det betyr at en ikke-innlogget bruker kan sende
--   POST /rpc/email_is_in_auth_users {"email_to_check":"offer@example.com"}
-- og få boolean-svar om e-posten har en konto i auth.users — det mest
-- sensitive oppslags-punktet (avslører konto-eksistens, inkludert ufullstendige
-- registreringer). Enabler e-post-enumerering og phishing-liste-validering.
--
-- Lovlig kall-sted: app/[locale]/invite/actions.ts og
-- app/[locale]/admin/spillere/[id]/actions.ts. Begge bruker en allerede
-- autentisert server-action-klient (authenticated-rolla) — aldri anon.
-- Kommentaren i 0017 ("defensive symmetry / before auth session propagates")
-- holder ikke: begge kall-stedene er bak innloggede ruter.
--
-- Contrast: email_is_registered (0009) og email_is_invited (0013) er korrekt
-- håndtert — email_is_registered er kun authenticated, email_is_invited er
-- anon fordi login-siden kaller den FØR autentisering (shouldCreateUser-gate).
-- Den forrige settes IKKE på som anon her.
--
-- Konservativ vurdering: email_is_invited RØRES IKKE. Den kalles av sendCode-
-- server-action-en som handler i to trinn: (1) e-post-oppslag pre-login
-- (unauthenticated/anon), (2) OTP-verifisering. Å fjerne anon der ville
-- knekke selve innloggings-porten. Se 0013 + 0100.
--
-- email_is_in_auth_users — kun authenticated fra nå:
revoke execute on function public.email_is_in_auth_users(text) from anon;
-- (authenticated-grantet fra 0017 beholdes; revoke from anon er subtraktiv)

comment on function public.email_is_in_auth_users(text) is
  '#671 (0104): SECURITY DEFINER, checks auth.users for email existence. '
  'Granted to authenticated only (anon revoked). '
  'Callers are authenticated server-actions (invite, admin/spillere). '
  'email_is_invited stays anon-granted — it is the pre-login shouldCreateUser gate.';

-- Del 2 — 5 SECURITY DEFINER RLS-helpere: legg til SET search_path
-- ─────────────────────────────────────────────────────────────────────────────
-- Uten en eksplisitt SET search_path kan en aktør som kan opprette objekter i
-- et skjema som er tidlig i den løste search_path skyggelegge et ukvalifisert
-- navn og kjøre kode som funksjonseieren. Supabase Advisor rapporterer dette
-- som `function_search_path_mutable` WARN for alle fem.
--
-- Fiksen er trygg og bakoverkompatibel: funksjonene beholder signatur, kropp,
-- SECURITY DEFINER, STABLE og alle ACLer — eneste endring er SET search_path.
-- Mønsteret (SET search_path = public, pg_catalog  eller  SET search_path = '')
-- er allerede i bruk i 0009/0013/0017/0076/0099/0103.
--
-- Valg av search_path-verdi:
--   • is_admin / same_flight / is_in_game / can_score_for / same_flight_or_solo
--     refererer kun public-tabeller → SET search_path = public, pg_catalog.
--   • Migrasjons-0103 (guard_game_players_self_update) bruker SET search_path = ''
--     og fullt kvalifiserte referanser overalt. De fem under er `language sql`
--     som allerede bruker schema-prefiks i FROM-klausulene, så
--     SET search_path = public, pg_catalog er tilstrekkelig og konsistent
--     med 0009-mønsteret.
--
-- Alle fem er CREATE OR REPLACE av siste gyldige versjon (se migrasjoner):
--   is_admin        → 0002
--   same_flight     → 0002  (denne overskrives aldri, alle nyere versjoner
--                             bruker can_score_for + same_flight_or_solo)
--   is_in_game      → 0003
--   can_score_for   → siste = 0095
--   same_flight_or_solo → siste = 0095
-- ─────────────────────────────────────────────────────────────────────────────

-- ── is_admin() ────────────────────────────────────────────────────────────────
create or replace function public.is_admin() returns boolean
  language sql security definer stable
  set search_path = public, pg_catalog
  as $$
    select exists(select 1 from public.users where id = auth.uid() and is_admin = true);
  $$;

-- ── same_flight(game_id, other_user) ─────────────────────────────────────────
-- NB: can_score_for (0088/0095) og same_flight_or_solo (0088/0095) erstatter
-- denne funksjonen i nyere RLS-policyer. Denne er beholdt fordi 0002-policyer
-- fremdeles er gyldige og ikke er erstattet (de refererer ikke same_flight
-- lenger etter 0088 reskreiv dem — men funksjonen eksisterer i prod og bør
-- hardnes for sikkerhets skyld).
create or replace function public.same_flight(p_game_id uuid, p_other_user uuid) returns boolean
  language sql security definer stable
  set search_path = public, pg_catalog
  as $$
    select exists(
      select 1
      from public.game_players me
      join public.game_players them
        on me.game_id = them.game_id
        and me.flight_number = them.flight_number
      where me.game_id = p_game_id
        and me.user_id = auth.uid()
        and them.user_id = p_other_user
    );
  $$;

-- ── is_in_game(game_id) ───────────────────────────────────────────────────────
create or replace function public.is_in_game(p_game_id uuid) returns boolean
  language sql security definer stable
  set search_path = public, pg_catalog
  as $$
    select exists(
      select 1 from public.game_players
      where game_id = p_game_id and user_id = auth.uid()
    );
  $$;

-- ── can_score_for(game_id, other_user) ───────────────────────────────────────
-- Siste versjon fra 0095 (#543). Identisk kropp — kun search_path lagt til.
create or replace function public.can_score_for(p_game_id uuid, p_other_user uuid)
  returns boolean
  language sql security definer stable
  set search_path = public, pg_catalog
  as $$
    select exists(
      select 1
      from public.game_players me
      join public.game_players them
        on me.game_id = them.game_id
      join public.games g
        on g.id = me.game_id
      where me.game_id = p_game_id
        and me.user_id = auth.uid()
        and them.user_id = p_other_user
        and me.withdrawn_at is null
        and them.withdrawn_at is null
        and (
          -- (a) same assigned flight (best-ball / team formats with >4 players)
          (me.flight_number is not null and me.flight_number = them.flight_number)
          -- (b) single-flight game: ≤4 active players OR wolf — all can co-score
          or (
            g.game_mode = 'wolf'
            or (
              select count(*) from public.game_players gp
              where gp.game_id = p_game_id and gp.withdrawn_at is null
            ) <= 4
          )
        )
    );
  $$;

-- ── same_flight_or_solo(game_id, other_user) ──────────────────────────────────
-- Siste versjon fra 0095 (#543). Identisk kropp — kun search_path lagt til.
create or replace function public.same_flight_or_solo(p_game_id uuid, p_other_user uuid)
  returns boolean
  language sql security definer stable
  set search_path = public, pg_catalog
  as $$
    select exists(
      select 1
      from public.games g
      join public.game_players me on me.game_id = g.id
      join public.game_players them on them.game_id = g.id
      where g.id = p_game_id
        and me.user_id = auth.uid()
        and them.user_id = p_other_user
        and (
          -- (a) Classic: same assigned flight (both flight_number set + equal)
          (me.flight_number is not null and me.flight_number = them.flight_number)
          -- (b) Solo/single-flight: either both flight-less, or it's a
          --     single-flight game (≤4 active or wolf) → all see each other
          or (me.flight_number is null and them.flight_number is null)
          or (
            g.game_mode = 'wolf'
            or (
              select count(*) from public.game_players gp
              where gp.game_id = g.id and gp.withdrawn_at is null
            ) <= 4
          )
        )
    );
  $$;
