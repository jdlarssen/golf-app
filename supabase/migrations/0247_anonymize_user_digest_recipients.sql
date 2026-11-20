-- 0247: anonymize_user deletes the newsletter recipient log.
--
-- 0246 added product_update_digest_recipients, one row per user per month the
-- newsletter reached. It is a per-user delivery log like notifications, so it
-- follows the account: anonymize_user deletes the user's rows. The users row
-- is scrubbed, never deleted, so the FK's ON DELETE CASCADE never fires.
--
-- The function body is the 0236 body (verified byte-identical to the live
-- function on staging 2026-11-20, md5(prosrc) 7063fba5) plus one line:
-- `delete from public.product_update_digest_recipients`. create or replace
-- keeps the grants (postgres and service_role).
--
-- Order against prod: apply after 0246 (the table must exist). Additive, safe
-- before the code.

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

    -- ─── Scrub (0131/0142; level fra 0210) ───────────────────────────────

    update public.users set
      name = 'Slettet bruker',
      nickname = null,
      email = 'slettet+' || p_user_id || '@deleted.tornygolf.no',
      gender = null,
      locale = null,
      last_seen_at = null,
      hcp_index = 54.0,
      level = 'normal',
      friend_code = public.generate_friend_code(),
      product_updates_unsubscribed_at = coalesce(product_updates_unsubscribed_at, now()),
      deleted_at = coalesce(deleted_at, now())
    where id = p_user_id;

    -- Personlige/sosiale rader: CASCADE-reglene deres fyrer aldri når
    -- users-raden består, så de må slettes eksplisitt her.
    delete from public.friendships
      where requester_id = p_user_id or addressee_id = p_user_id;
    delete from public.push_subscriptions where user_id = p_user_id;
    delete from public.apns_tokens where user_id = p_user_id;
    delete from public.fcm_tokens where user_id = p_user_id;
    delete from public.kavalkades where user_id = p_user_id;
    delete from public.kavalkade_shares where user_id = p_user_id;
    -- Handicap-historikken (#2256, 0195). Står etter scrubben: hcp_index = 54.0
    -- der over fyrer ikke historikk-triggeren for en slettet konto, men raden
    -- ryddes uansett her.
    delete from public.handicap_history where user_id = p_user_id;
    -- AI-samtykket (#2561, 0210). Raden følger kontoen; uten den ville et
    -- «ja» eller «nei» blitt stående etter slettingen.
    delete from public.ai_consents where user_id = p_user_id;
    -- Varselvalgene (#2315, 0236). Raden følger kontoen.
    delete from public.notification_preferences where user_id = p_user_id;
    delete from public.notifications where user_id = p_user_id;
    -- Månedsbrevets mottakerlogg (0246, 0247). Raden sier hvilke måneder
    -- kontoen fikk brevet, og følger kontoen som varslene.
    delete from public.product_update_digest_recipients where user_id = p_user_id;
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
  'Personlige rader slettes, også enhetstoken (apns_tokens, fcm_tokens 0232), Kavalkaden '
  '(kavalkades, kavalkade_shares) — #1899 (0184) — handicap-historikken (0195), '
  'AI-samtykket (ai_consents, 0210), varselvalgene (notification_preferences, 0236) og '
  'månedsbrevets mottakerlogg (product_update_digest_recipients, 0247). '
  'Spillerklassen nullstilles til normal (0210). '
  'Kaster sole_club_owner (#1910) uten å skrive noe når kontoen er eneste eier '
  'av en klubb med andre medlemmer (is_sole_club_owner). '
  'Idempotent. Kun service_role har EXECUTE; kalles fra deleteOrAnonymizeUser.';
