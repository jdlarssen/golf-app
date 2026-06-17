-- 0106_peer_approval_rls.sql
-- #704: peer-godkjenning av scorekort er stille knekt av et RLS-hull.
--
-- Problem: approveScorecard/rejectScorecard (app/[locale]/games/[id]/approve/
-- actions.ts) lar en samme-flight-spiller godkjenne et annet flight-medlems
-- scorekort (#543/#360 — en ekte, golf-korrekt feature). Skrivingen går via
-- BRUKER-klienten (authenticated-rolla, RLS-sjekket). Men de eksisterende
-- game_players UPDATE-policyene (0002 → ytelse-omskrevet i 0092) gir bare:
--   • "game_players self submit"     → is_admin() OR user_id = auth.uid()
--   • "game_players creator update"  → spillets created_by = auth.uid()
--   • "game_players self mark accepted"
-- En samme-flight-PEER som verken er admin, skaper eller eier av raden treffer
-- INGEN policy → UPDATE-en rammer 0 rader. PostgREST/Supabase returnerer
-- `error == null` på en 0-rads-UPDATE, så approveScorecard rapporterer FALSKT
-- suksess, redirecter `?status=approved` og sender godkjennings-varselet — mens
-- approved_at aldri skrives. Spillet kan så aldri avsluttes (not_all_approved).
-- Samme felle i rejectScorecard.
--
-- Løsning (eier-ratifisert): BEHOLD peer-godkjenning, utvid RLS TRYGT.
--   (1) Ny permissive UPDATE-policy for `authenticated` som lar en spiller
--       skrive et flight-medlems rad, gated på can_score_for(game_id, user_id)
--       (0095, SECURITY DEFINER STABLE — SQL-tvillingen til peersForApproval:
--       begge aktive + samme tildelte flight ELLER ≤4 aktive ELLER wolf).
--       can_score_for gjenbrukes — flight-logikken dupliseres IKKE.
--   (2) Utvid guard-triggeren guard_game_players_self_update (0103, #670) så
--       en ikke-admin-aktør som skriver en ANNENS rad (new.user_id <> auth.uid())
--       KUN kan endre godkjennings-kolonnene. Alt annet avvises.
--
-- Hvorfor en trigger over den nye policyen, ikke kolonne-GRANT:
--   can_score_for-policyen åpner hele raden for skriving (PostgREST-PATCH kan
--   ikke kolonne-begrenses i RLS WITH CHECK, og WITH CHECK ser ikke OLD vs NEW).
--   Uten kolonne-vakt kunne en peer PATCH-e et flight-medlems course_handicap,
--   team_number, flight_number, tee_gender, withdrawn_at osv. — nøyaktig den
--   angreps-flaten 0103 lukket for EGEN rad, nå åpnet for andres. Triggeren ser
--   OLD, NEW og auth.uid() og avviser enhver ikke-godkjennings-mutasjon på en
--   annens rad. Samme defense-in-depth-mønster som 0073/0102/0103.
--
-- ALLOWLIST, ikke denylist: vi lister hva en peer SMÅR endre (approved_at,
-- approved_by_user_id, rejection_reason, submitted_at) og avviser alt annet.
-- En framtidig kolonne på game_players er da beskyttet by default — ingen
-- ny migrasjon trengs for å holde den utenfor peer-rekkevidde.
--
-- Hva som forblir lovlig (verifisert mot koden):
--   • approveScorecard (peer)  → ANNENS approved_at/approved_by_user_id/
--                                 rejection_reason (authenticated, can_score_for)
--   • rejectScorecard (peer)   → ANNENS submitted_at(=null)/approved_at(=null)/
--                                 approved_by_user_id(=null)/rejection_reason
--   • submitScorecard          → EGEN submitted_at/rejection_reason (self submit)
--   • admin alt                → uendret (trigger no-op-er på is_admin())
--   • startGame / signup       → service_role (auth.uid() NULL → trigger no-op)
--   • skaper-roster-stier      → uendret: skaperen (created_by, også ikke-admin
--                                 trusted/klubb) redigerer handicap/lag/flight på
--                                 spillernes rader via bruker-klienten. Triggeren
--                                 no-op-er eksplisitt for skaperen i ANNENS-rad-
--                                 grenen, så creator-update-policyen virker uendret.
--
-- Bakoverkompatibel: den nye policyen UTVIDER tilgang (permissive OR), den
-- innskrenker ingenting. Trigger-utvidelsen rammer kun en ikke-admin-peer som
-- forsøker å skrive en ikke-godkjennings-kolonne på en annens rad — ingen
-- lovlig app-sti gjør det. Trygt å applikere før eller etter kode-deploy.

-- ── 1. Ny permissive UPDATE-policy: peer kan skrive flight-medlems rad ────────
-- USING gater hvilke rader som er synlige for UPDATE; WITH CHECK gater den nye
-- rad-tilstanden. Begge på can_score_for(game_id, user_id) der `user_id` er
-- MÅL-radens eier (flight-medlemmet hvis scorekort godkjennes). can_score_for
-- leser auth.uid() internt (SECURITY DEFINER) og svarer «kan auth.uid() føre/
-- attestere for user_id i dette spillet». auth.uid()-wrappingen ((select …))
-- er ikke nødvendig her — vi kaller ikke auth.uid() direkte i kvalifikatoren.
drop policy if exists "game_players peer approve flightmate" on public.game_players;
create policy "game_players peer approve flightmate" on public.game_players
  for update to authenticated
  using (public.can_score_for(game_id, user_id))
  with check (public.can_score_for(game_id, user_id));

comment on policy "game_players peer approve flightmate" on public.game_players is
  '#704: lar en samme-flight-spiller (can_score_for) UPDATE-e et flight-medlems '
  'rad slik at peer-godkjenning (approveScorecard/rejectScorecard) faktisk '
  'treffer rader i stedet for å no-op-e. Kolonne-overflaten begrenses av '
  'guard_game_players_self_update-triggeren (0103/0106) til kun godkjennings-'
  'kolonner når aktøren ikke er admin og raden ikke er deres egen.';

-- ── 2. Utvid guard-triggeren med peer-kolonne-allowlist ───────────────────────
-- Beholder 0103-grenene (self-approval + self-handicap) uendret og legger til
-- en ny gren for når en ikke-admin-aktør skriver en ANNENS rad: kun
-- godkjennings-kolonnene får endres. Triggeren er fortsatt SECURITY DEFINER
-- (is_admin() leser public.users) med tom search_path, og no-op-er for admin og
-- service-rolla (auth.uid() NULL) akkurat som før.
create or replace function public.guard_game_players_self_update()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''  -- hardened: every reference below is schema-qualified
  as $$
  declare
    v_uid uuid := auth.uid();
    v_status public.game_status;
    v_is_creator boolean;
  begin
    -- Service-rolla (admin-klienten: startGame, signup, flight-join) har ingen
    -- JWT-sub → auth.uid() er NULL. Slipp den gjennom uendret. Admin (is_admin)
    -- har full tilgang per RLS, så også her: no-op. Begge escapes først.
    if v_uid is null or public.is_admin() then
      return new;
    end if;

    if new.user_id = v_uid then
      -- ── EGEN rad (0103, #670) ──────────────────────────────────────────────
      -- (a) Selv-godkjenning: en ikke-admin spiller kan ikke SETTE/ENDRE
      -- approved_at eller approved_by_user_id på SIN EGEN rad.
      if new.approved_at is distinct from old.approved_at
         or new.approved_by_user_id is distinct from old.approved_by_user_id then
        raise exception
          'A player cannot approve their own scorecard (game_players.approved_at/approved_by_user_id)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;

      -- (b) Selv-handicap etter start: en ikke-admin spiller kan ikke ENDRE
      -- course_handicap på sin egen rad når spillet er startet (active/finished).
      if new.course_handicap is distinct from old.course_handicap then
        select g.status into v_status
          from public.games g
         where g.id = new.game_id;

        if v_status in ('active', 'finished') then
          raise exception
            'A player cannot change their own course_handicap after the game has started (game_players.course_handicap)'
            using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
        end if;
      end if;
    else
      -- ── ANNENS rad ──────────────────────────────────────────────────────────
      -- Admin er allerede sluppet gjennom (is_admin() over). Spillets SKAPER har
      -- også bred tilgang til sin egen roster — det speiler den eksisterende
      -- "game_players creator update"-policyen (created_by = auth.uid()).
      -- Skaperen (også en ikke-admin trusted/klubb-skaper) styrer handicap, lag
      -- og flight via admin-cockpiten med BRUKER-klienten (requireAdminOrCreator
      -- + getServerClient), f.eks. `freezeCourseHandicaps`/`assignFlight`. Uten
      -- dette unntaket ville #704-kolonne-vakta knekke skaperens roster-redigering.
      select (g.created_by = v_uid) into v_is_creator
        from public.games g where g.id = new.game_id;
      if coalesce(v_is_creator, false) then
        return new;
      end if;

      -- EKTE peer (verken admin eller skaper) skriver et annet flight-medlems rad
      -- (peer-godkjenning, via den nye can_score_for-policyen). Den policyen åpner
      -- hele raden, så vi gater kolonne-overflaten her: KUN godkjennings-kolonnene
      -- får endres.
      --
      -- ALLOWLIST (ikke denylist): vi bygger to jsonb-bilder av raden, fjerner de
      -- fire lovlige godkjennings-kolonnene fra begge, og krever at RESTEN er
      -- byte-identisk. Da er enhver FRAMTIDIG kolonne beskyttet by default — en
      -- ny migrasjon som legger til en kolonne trenger ikke å oppdatere denne
      -- triggeren for å holde peers ute. (to_jsonb på en game_players-rad er
      -- billig — én rad, ~15 felt.)
      --
      -- Lovlige peer-mutasjoner:
      --   • approveScorecard: approved_at, approved_by_user_id, rejection_reason(=null)
      --   • rejectScorecard:  submitted_at(=null), approved_at(=null),
      --                       approved_by_user_id(=null), rejection_reason
      if (to_jsonb(new) - 'approved_at' - 'approved_by_user_id'
                        - 'rejection_reason' - 'submitted_at')
         is distinct from
         (to_jsonb(old) - 'approved_at' - 'approved_by_user_id'
                        - 'rejection_reason' - 'submitted_at') then
        raise exception
          'A peer may only change approval columns (approved_at, approved_by_user_id, rejection_reason, submitted_at) on another player''s row'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;
    end if;

    return new;
  end;
  $$;

comment on function public.guard_game_players_self_update() is
  '#670 + #704: blocks a non-admin player from self-approving or editing their '
  'own course_handicap post-start (own row); and restricts a non-admin peer to '
  'ONLY the approval columns (approved_at, approved_by_user_id, rejection_reason, '
  'submitted_at) when updating ANOTHER player''s row (peer-approval). No-ops for '
  'admin (is_admin()) and the service role (auth.uid() IS NULL).';

-- Triggeren selv er uendret (BEFORE UPDATE, for each row) — vi har bare
-- erstattet funksjonskroppen via create or replace. Re-bind for sikkerhets skyld
-- slik at en frisk DB uten 0103 også får triggeren.
drop trigger if exists guard_game_players_self_update on public.game_players;
create trigger guard_game_players_self_update
  before update on public.game_players
  for each row
  execute function public.guard_game_players_self_update();
