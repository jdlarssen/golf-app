-- 0115_game_players_invite_eligibility_rls.sql
-- #921 (defense-in-depth for #906): RLS-håndhev invite-eligibility på game_players.
--
-- Problem: #906 lukket venne-/klubb-scoping på ACTION-laget
-- (inviteToGameActions.addExistingPlayerToGame → getInviteEligibleIds). Men det er
-- en TS-guard. Et direkte PostgREST-INSERT mot game_players med en gyldig spiller-JWT
-- omgår den helt (AGENTS.md felle #3: «RLS is the real authz layer»).
--
-- Live INSERT-policyer på game_players (verifisert mot pg_policy):
--   • "game_players creator insert"      → with check: games.created_by = auth.uid()
--                                           — INGEN eligibility-sjekk (hullet).
--   • "game_players self register open"   → is_admin() OR (user_id = auth.uid()
--                                           AND åpent draft/scheduled-spill).
-- Den eneste ikke-self, ikke-admin INSERT-stien er creator-policyen, så en ikke-admin
-- oppretter kan INSERT-e en HVILKEN SOM HELST user_id i sitt eget spill via rå REST.
--
-- Hvorfor en BEFORE INSERT-trigger og ikke en RESTRICTIVE policy:
--   Betingelsen avhenger av HVEM som skriver (oppretter vs self vs admin vs service-
--   rolle) og av spillets group_id. En trigger leser group_id én gang og brancher
--   rent på is_admin()/auth.uid(), nøyaktig som call-siten (#906). Samme mønster som
--   guard_game_players_self_update (0103) / kolonne-immutabilitet (0107) etablerer for
--   denne tabellen. En restrictive policy ville gjelde ALLE INSERT-stier og kreve
--   inline-subqueries for created_by + group_id — mer skjør.
--
-- Hva som forblir lovlig (verifisert mot koden):
--   • service-rolle (admin-klient: startScheduledGame m.fl.) → auth.uid() er NULL → no-op.
--   • global admin (Sekretariatet, kurator-modellen #422)     → is_admin() → no-op.
--   • self-register / oppretter legger til seg selv            → new.user_id = auth.uid() → no-op.
--   • ny-spill-veiviser + cup-generering (bruker-klient)       → roster er picker-scopet
--     til venner/klubb ⊆ eligible-set → alle rader passerer.
--
-- Felle #4 (lag enige): is_invite_eligible() speiler getInviteEligibleIds
-- (lib/games/inviteEligibility.ts) gren for gren — venne-connections (accepted ∪
-- pending, begge retninger; jf. connectedIdsFromRows i friendGraph.ts) ∪ co-players
-- (delt minst ett spill; jf. getCoPlayerIds — INGEN withdrawn-filter) ∪ klubbmedlemmer
-- (når group_id satt; ALLE medlemmer, krever ikke at oppretter selv er medlem; jf.
-- getGroupMemberIds). Self/admin gates i triggeren, akkurat som call-siten splitter
-- resolver (set uten self) vs gate (!isAdmin && recipient !== inviter).
--
-- Additivt: ingen eksisterende policy/funksjon/kolonne endres. Triggeren avviser kun
-- det rå-REST-hullet — ingen lovlig app-sti rammes. Trygt å applye før eller etter
-- kode-deploy (ingen kode-endring følger). Påføres staging først, så prod (0107-mønster).

-- ── is_invite_eligible(creator, recipient, group_id) ──────────────────────────
-- SECURITY DEFINER fordi de tre kildetabellene er RLS-beskyttet: under request-
-- scoped RLS ville en oppretter ikke se friendships/group_members/medspilleres rader
-- og funksjonen ville falsk-returnere false. Speiler hvorfor TS-resolveren bruker
-- admin-klienten. set search_path = '' → alle referanser fullt schema-kvalifisert.
create or replace function public.is_invite_eligible(
  p_creator uuid,
  p_recipient uuid,
  p_group_id uuid
) returns boolean
  language sql
  security definer
  stable
  set search_path = ''
  as $$
    select
      -- (1) venne-connections: accepted ELLER pending, begge retninger. Ingen
      -- status-filter — speiler connectedIdsFromRows (lib/friends/friendGraph.ts).
      exists (
        select 1 from public.friendships f
        where (f.requester_id = p_creator and f.addressee_id = p_recipient)
           or (f.addressee_id = p_creator and f.requester_id = p_recipient)
      )
      -- (2) co-players: delt minst ett spill. Speiler getCoPlayerIds — INGEN
      -- withdrawn-filter (en avvik her ville bryte felle #4).
      or exists (
        select 1
        from public.game_players me
        join public.game_players them on me.game_id = them.game_id
        where me.user_id = p_creator
          and them.user_id = p_recipient
      )
      -- (3) klubbmedlemmer: kun når group_id satt; ALLE medlemmer av spillets group.
      -- getGroupMemberIds krever ikke at oppretter selv er medlem — speiles eksakt.
      or (
        p_group_id is not null
        and exists (
          select 1 from public.group_members gm
          where gm.group_id = p_group_id
            and gm.user_id = p_recipient
        )
      );
  $$;

-- Lås EXECUTE til innloggede brukere. Supabase default-grant gir EXECUTE til både
-- anon og authenticated på enhver ny public-funksjon; en SECURITY DEFINER relasjons-
-- probe skal ikke være anon-tilgjengelig. Revoke public + anon, behold authenticated.
revoke all on function public.is_invite_eligible(uuid, uuid, uuid) from public;
revoke execute on function public.is_invite_eligible(uuid, uuid, uuid) from anon;
grant execute on function public.is_invite_eligible(uuid, uuid, uuid) to authenticated;

comment on function public.is_invite_eligible(uuid, uuid, uuid) is
  '#921 (0115): SECURITY DEFINER. Speiler getInviteEligibleIds (lib/games/inviteEligibility.ts): '
  'true hvis recipient er venne-connection (accepted∪pending, begge retninger) ∪ co-player '
  '(delt spill) ∪ klubbmedlem (når group_id satt) av creator. Self/admin håndteres av '
  'guard_game_players_invite_eligibility-triggeren, ikke her. authenticated-only (anon revoked).';

-- ── guard_game_players_invite_eligibility() — BEFORE INSERT-trigger ────────────
-- SECURITY DEFINER så is_admin()-oppslaget (public.users) og is_invite_eligible
-- kjører med definer-rettigheter, konsistent med 0103. STABLE er ikke lov på en
-- trigger-funksjon, så volatiliteten er default (volatile).
create or replace function public.guard_game_players_invite_eligibility()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''  -- hardened: every reference below is schema-qualified
  as $$
  declare
    v_uid uuid := auth.uid();
    v_group_id uuid;
  begin
    -- Escapes i samme rekkefølge som call-siten (#906):
    --   (a) service-rolla (admin-klient: startGame, signup, cup/liga-service-writes)
    --       har ingen JWT-sub → auth.uid() er NULL. Slipp gjennom.
    --   (b) global admin (kurator-modellen #422) → full tilgang. Slipp gjennom.
    --   (c) self: en bruker legger til SEG SELV (self-register-open, eller oppretter
    --       legger seg selv på rosteren) → alltid lov. Slipp gjennom.
    if v_uid is null or public.is_admin() or new.user_id = v_uid then
      return new;
    end if;

    -- Her: en innlogget ikke-admin legger til en ANNEN bruker. RLS garanterer at den
    -- eneste ikke-self/ikke-admin INSERT-stien er "creator insert" (created_by = v_uid),
    -- så v_uid ER oppretteren. Hent spillets group_id for klubb-grenen.
    select g.group_id into v_group_id
      from public.games g
     where g.id = new.game_id;

    if not public.is_invite_eligible(v_uid, new.user_id, v_group_id) then
      raise exception
        'Recipient % is not invite-eligible for creator % (friends/co-players/club members only)',
        new.user_id, v_uid
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501, jf. 0103
    end if;

    return new;
  end;
  $$;

comment on function public.guard_game_players_invite_eligibility() is
  '#921: BEFORE INSERT på game_players. Avviser en ikke-admin oppretter som inserter en '
  'ikke-kvalifisert user_id (ikke venn/co-player/klubbmedlem) i sitt eget spill via rå '
  'PostgREST. No-op for service-rolle (auth.uid() IS NULL), admin (is_admin()) og self '
  '(new.user_id = auth.uid()). Speiler #906-action-guarden; ren defense-in-depth (felle #3).';

-- BEFORE INSERT uten OF-kolonneliste: funksjonen avgjør selv hva som skal gates.
drop trigger if exists guard_game_players_invite_eligibility on public.game_players;
create trigger guard_game_players_invite_eligibility
  before insert on public.game_players
  for each row
  execute function public.guard_game_players_invite_eligibility();
