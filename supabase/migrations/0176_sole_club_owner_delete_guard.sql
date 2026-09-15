-- 0176 (#1910): en konto som er eneste eier av en klubb med andre medlemmer
-- kan ikke slettes — klubben ville blitt eierløs.
--
-- Bakgrunn: anonymize_user sletter brukerens group_members-rader. 0110-vakta
-- (guard_group_members_last_owner_delete) skal hindre en eierløs klubb, men
-- slipper service-role gjennom (`auth.uid() is null → return old`) — og
-- anonymize_user kalles nettopp med service-role. Ingen kunne da endre roller
-- i klubben (set_club_member_role krever eier eller global admin).
--
-- Hvorfor vakta bor HER og ikke i 0110-triggeren: service-role-escapen er
-- bevisst (admin skal kunne oppløse en klubb) og assertet i
-- supabase/tests/group_members_last_owner_delete_guard_test.sql punkt 5.
-- RPC-en er den privilegerte inngangen, så det er den som må si nei.
--
-- Regelen har ett hjem (AGENTS trap 4): is_sole_club_owner leses både av
-- slette-sperren i lib/users/deleteAccount.ts og av anonymize_user under.
-- Merk at predikatet er et ANNET enn 0110s: det krever i tillegg at det finnes
-- noen å gi eierskapet til. En klubb der kontoen er eneste MEDLEM sperrer ikke —
-- en sperre der ville vært en blindvei ingen kom ut av.
--
-- Hard-delete-stien (auth.admin.deleteUser for kontoer uten game_players)
-- går utenom RPC-en; der er TS-sperren eneste port.
--
-- anonymize_user-kroppen under er 0174-kroppen (verifisert lik den levende
-- funksjonen i staging 2026-09-15) + ÉN ny blokk etter is_admin-sjekken.
--
-- Rekkefølge mot prod: migrasjon FØRST, så merge/deploy. Uten migrasjonen
-- feiler RPC-kallet i sperren → fail-closed → ingen kan slette kontoen.

-- ── Regelens hjem ────────────────────────────────────────────────────────────
create or replace function public.is_sole_club_owner(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.group_members gm
     where gm.user_id = p_user_id
       and gm.role = 'owner'
       -- eneste eier i klubben
       and (select count(*) from public.group_members o
             where o.group_id = gm.group_id and o.role = 'owner') = 1
       -- og det finnes minst ett ANNET medlem å overføre til
       and exists (select 1 from public.group_members m
                    where m.group_id = gm.group_id and m.user_id <> p_user_id)
  );
$$;

comment on function public.is_sole_club_owner(uuid) is
  '#1910 (0176): true når kontoen er eneste eier av minst én klubb som har '
  'andre medlemmer — da kan kontoen ikke slettes før eierskapet er gitt '
  'videre. Klubb der kontoen er eneste medlem gir false. Leses av '
  'getDeleteBlockReason og anonymize_user. Kun service_role.';

revoke all on function public.is_sole_club_owner(uuid) from public;
revoke execute on function public.is_sole_club_owner(uuid) from anon, authenticated;
grant execute on function public.is_sole_club_owner(uuid) to service_role;

-- ── anonymize_user med vakt ──────────────────────────────────────────────────
create or replace function public.anonymize_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
  declare
    v_email text;
    v_is_admin boolean;
  begin
    select email, is_admin into v_email, v_is_admin
      from public.users where id = p_user_id for update;

    if not found then
      raise exception 'user not found (public.users.id = %)', p_user_id
        using errcode = 'no_data_found';
    end if;

    if v_is_admin then
      raise exception 'admin accounts cannot be anonymized (public.users.is_admin)'
        using errcode = 'insufficient_privilege';
    end if;

    -- ─── Klubb-vakt (#1910) ───────────────────────────────────────────────
    -- Før noe skrives: eneste eier av en klubb med andre medlemmer ville
    -- etterlatt klubben eierløs, fordi 0110-vakta slipper service-role gjennom.
    if public.is_sole_club_owner(p_user_id) then
      raise exception 'sole_club_owner'
        using
          errcode = 'P0001',
          detail  = 'The account is the only owner of at least one club that has other members.',
          hint    = 'Transfer club ownership (set_club_member_role) before deleting the account.';
    end if;

    -- ─── Frafall (#1909) ──────────────────────────────────────────────────
    -- Før scrubben, så radene fortsatt kan finnes på user_id.

    -- (1) Spill som PÅGÅR: raden og scorene består — historikken til
    -- flightkameratene skal ikke endres — men merkes trukket.
    -- endGameCore hopper over withdrawn_at-rader uansett modus, så
    -- arrangøren kan avslutte uten å vente på en levering som aldri kommer.
    -- coalesce ⇒ idempotent: et frafall som alt fantes beholder sitt tidspunkt.
    update public.game_players gp set
      withdrawn_at = coalesce(gp.withdrawn_at, now()),
      withdrawn_by_user_id = coalesce(gp.withdrawn_by_user_id, p_user_id)
    from public.games g
    where gp.game_id = g.id
      and gp.user_id = p_user_id
      and g.status = 'active';

    -- (2) Spill som IKKE har startet: raden fjernes helt, slik webbens
    -- pre-start-frafall gjør. Ingen score finnes å bevare, og et tomt sete er
    -- ærligere enn en «Slettet bruker» i oppsettet.
    delete from public.game_players gp
    using public.games g
    where gp.game_id = g.id
      and gp.user_id = p_user_id
      and g.status in ('draft', 'scheduled');

    -- (3) Cuper som ikke er avsluttet: deltaker-raden fjernes. Uten dette
    -- trekker generate-wizarden (tournament_participants er dens ENESTE
    -- spillerkilde) den slettede brukeren inn i neste runde igjen — frafallet
    -- fra (1)/(2) ville vært midlertidig. Kaptein-/lagrolle følger med raden;
    -- arrangøren utpeker ny. Avsluttede cuper beholder raden (historikk).
    delete from public.tournament_participants tp
    using public.tournaments t
    where tp.tournament_id = t.id
      and tp.user_id = p_user_id
      and t.status <> 'finished';

    -- (4) Ligaer som ikke er avsluttet: medlemskapet fjernes, slik
    -- removeLeaguePlayer gjør. Hindrer re-rostering ved neste runde-
    -- opprettelse. Spilte runder (game_players/scores) består.
    delete from public.league_players lp
    using public.leagues l
    where lp.league_id = l.id
      and lp.user_id = p_user_id
      and l.status <> 'finished';

    -- (5) Kaptein-uttakets seter (0172) i uavsluttede cuper frigjøres.
    -- user_id er NOT NULL, så raden slettes; kapteinen fyller setet på nytt.
    delete from public.cup_lineup_slots s
    using public.cup_lineup_sessions ses, public.tournaments t
    where s.session_id = ses.id
      and ses.tournament_id = t.id
      and s.user_id = p_user_id
      and t.status <> 'finished';

    -- ─── Scrub (0131/0142, uendret) ───────────────────────────────────────

    update public.users set
      name = 'Slettet bruker',
      nickname = null,
      email = 'slettet+' || p_user_id || '@deleted.tornygolf.no',
      gender = null,
      locale = null,
      last_seen_at = null,
      hcp_index = 54.0,
      friend_code = public.generate_friend_code(),
      product_updates_unsubscribed_at = coalesce(product_updates_unsubscribed_at, now()),
      deleted_at = coalesce(deleted_at, now())
    where id = p_user_id;

    -- Personlige/sosiale rader: CASCADE-reglene deres fyrer aldri når
    -- users-raden består, så de må slettes eksplisitt her.
    delete from public.friendships
      where requester_id = p_user_id or addressee_id = p_user_id;
    delete from public.push_subscriptions where user_id = p_user_id;
    delete from public.notifications where user_id = p_user_id;
    delete from public.group_members where user_id = p_user_id;
    delete from public.group_join_requests where user_id = p_user_id;
    delete from public.game_registration_requests where user_id = p_user_id;
    delete from public.idea_submissions where user_id = p_user_id;
    delete from public.reactions where user_id = p_user_id;

    -- Green pins (#1210, 0142): dugnadsdataen beholdes, sporbarheten fjernes —
    -- samme SET NULL som FK-en ville gjort om users-raden faktisk ble slettet.
    update public.green_pins set user_id = null where user_id = p_user_id;

    -- Invitasjons-rader med den ekte e-posten er PII og slettes. Ved re-kjøring
    -- er v_email allerede randomisert og matcher ingenting.
    delete from public.invitations where lower(email) = lower(v_email);
    delete from public.club_invitations where lower(email) = lower(v_email);
  end;
$function$;

comment on function public.anonymize_user(uuid) is
  'Anonymiserer en konto i public-skjemaet (#1012) og trekker den ut av alt '
  'som ikke er avsluttet (#1909): pågående spill merkes withdrawn, ikke-startede '
  'spill mister raden, og deltakelsen i uavsluttede cuper/ligaer (inkl. '
  'kaptein-uttakets seter) fjernes så brukeren ikke re-rostres. Avsluttede spill, '
  'cuper og ligaer er urørt — historikken består med «Slettet bruker». '
  'Kaster sole_club_owner (#1910) uten å skrive noe når kontoen er eneste eier '
  'av en klubb med andre medlemmer (is_sole_club_owner). '
  'Idempotent. Kun service_role har EXECUTE; kalles fra deleteOrAnonymizeUser.';
