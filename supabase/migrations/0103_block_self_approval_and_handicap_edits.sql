-- 0103_block_self_approval_and_handicap_edits.sql
-- #670: en spiller kan selv-godkjenne eget scorekort ELLER endre eget
-- course_handicap via en direkte PostgREST PATCH.
--
-- Problem: `game_players self submit`-UPDATE-policyen (0092, uendret form siden
-- 0002) gater bare på `is_admin() OR user_id = auth.uid()` — ingen kolonne-
-- restriksjon. En autentisert ikke-admin-spiller kan derfor PATCH-e EGEN
-- game_players-rad og skrive hvilken som helst kolonne, inkludert:
--   • approved_at + approved_by_user_id → selv-godkjenne eget scorekort, forbi
--     peer/admin-godkjennings-flyten, og
--   • course_handicap → senke eget handicap for å vinne (leses av
--     getGameWithPlayers og mater netto-leaderboarden).
-- App-laget gjør det rette, men RLS er eneste backstop, og den er vidåpen.
--
-- Hvorfor en trigger og ikke kolonne-GRANT / WITH CHECK:
--   Både approveScorecard og rejectScorecard (peer-godkjenning) skriver
--   approved_at/approved_by_user_id via BRUKER-klienten (authenticated-rolla,
--   RLS-sjekket) — ikke admin-klient eller RPC. Autorisasjonen (samme-flight)
--   gjøres i app-laget. En kolonne-GRANT kan ikke skille «skriv approved_at på
--   en ANNENS rad» (lovlig peer-godkjenning) fra «skriv approved_at på EGEN
--   rad» (selv-godkjenning), og RLS WITH CHECK kan ikke se OLD vs NEW (kreves
--   for handicap-endring). En BEFORE UPDATE-trigger ser OLD, NEW og auth.uid()
--   og kan derfor avvise nøyaktig de to forbudte selv-mutasjonene mens peer-
--   og admin-stier står urørt. Samme defense-in-depth-mønster som 0073/0102
--   etablerer for scores.
--
-- Hva som forblir lovlig (verifisert mot koden):
--   • submitScorecard         → egen submitted_at/rejection_reason (authenticated)
--   • approveScorecard (peer) → ANNENS approved_at/approved_by_user_id (authenticated)
--   • rejectScorecard (peer)  → ANNENS submitted_at/approved_at/… (authenticated)
--   • admin handicap-just.    → course_handicap (authenticated, men is_admin()=true)
--   • startGame / signup      → course_handicap m.m. (service_role, RLS+trigger-bypass)
--
-- Triggeren no-op-er for admin (is_admin()) og for service-rolla (auth.uid() er
-- NULL der — service-klienten har ingen JWT-sub), så alle privilegerte app-stier
-- er upåvirket. RLS-policyene endres IKKE her — triggeren er additiv.
--
-- Bakoverkompatibel: bare en ikke-admin spiller som forsøker å skrive
-- approved_*/course_handicap på sin EGEN rad rammes — ingen lovlig app-sti gjør
-- det. Trygt å applikere før eller etter kode-deploy (ingen kode-endring følger).

-- ── Guard-trigger-funksjon ────────────────────────────────────────────────────
-- SECURITY DEFINER så is_admin()-oppslaget (som leser public.users) kjører med
-- definer-rettigheter, konsistent med is_admin/same_flight (0002). STABLE er ikke
-- lov på en trigger-funksjon, så vi lar volatiliteten være default (volatile).
create or replace function public.guard_game_players_self_update()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''  -- hardened: every reference below is schema-qualified
  as $$
  declare
    v_uid uuid := auth.uid();
    v_status public.game_status;
  begin
    -- Service-rolla (admin-klienten: startGame, signup, flight-join) har ingen
    -- JWT-sub → auth.uid() er NULL. Slipp den gjennom uendret. Admin (is_admin)
    -- har full tilgang per RLS, så også her: no-op. Begge escapes først, så
    -- selv-mutasjons-sjekkene bare gjelder en innlogget ikke-admin spiller.
    if v_uid is null or public.is_admin() then
      return new;
    end if;

    -- (a) Selv-godkjenning: en ikke-admin spiller kan ikke SETTE/ENDRE
    -- approved_at eller approved_by_user_id på SIN EGEN rad. Peer-godkjenning
    -- (NEW.user_id <> auth.uid()) er upåvirket — det er en annens rad.
    if new.user_id = v_uid then
      if new.approved_at is distinct from old.approved_at
         or new.approved_by_user_id is distinct from old.approved_by_user_id then
        raise exception
          'A player cannot approve their own scorecard (game_players.approved_at/approved_by_user_id)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;

      -- (b) Selv-handicap etter start: en ikke-admin spiller kan ikke ENDRE
      -- course_handicap på sin egen rad når spillet er startet (active/finished).
      -- Før start (draft/scheduled) er self-register-stien lovlig (handicap kan
      -- justeres), så vi gater kun post-start.
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
    end if;

    return new;
  end;
  $$;

comment on function public.guard_game_players_self_update() is
  '#670: blocks a non-admin player from self-approving (approved_at/approved_by_user_id on their own row) or editing their own course_handicap after game start. No-ops for admin (is_admin()) and the service role (auth.uid() IS NULL). Peer-approval and admin/service writes are unaffected.';

-- ── Trigger ───────────────────────────────────────────────────────────────────
-- BEFORE UPDATE uten OF-kolonneliste: funksjonen sjekker selv hvilke felt som
-- endret (is distinct from), som er enklere å resonere om enn å stole på
-- trigger-kolonne-filteret og dekker alle skrive-stier likt.
drop trigger if exists guard_game_players_self_update on public.game_players;
create trigger guard_game_players_self_update
  before update on public.game_players
  for each row
  execute function public.guard_game_players_self_update();
