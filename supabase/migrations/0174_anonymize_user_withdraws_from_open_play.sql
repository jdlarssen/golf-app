-- 0174 (#1909): anonymize_user trekker brukeren ut av alt som ikke er avsluttet.
--
-- Bakgrunn: slette-sperren i lib/users/deleteAccount.ts snevres i samme PR inn
-- til «eneste arrangør av noe aktivt». Deltakere slipper dermed gjennom — og en
-- deltaker som slettes midt i en runde MÅ trekkes, ellers står raden igjen som
-- «Slettet bruker» uten levering og blokkerer arrangørens avslutning for alltid.
--
-- Hvorfor frafallet bor HER og ikke i helper-laget:
--   * Tre kallere (selv-slett på web, admin-slett på web, app-ruta) går alle
--     gjennom deleteOrAnonymizeUser → denne RPC-en. Ett hjem for regelen
--     (AGENTS trap 4).
--   * Atomisk: frafall + scrub + deleted_at committer sammen. Feiler noe, er
--     ingenting endret — vi får aldri «trukket, men ikke slettet» (det ville
--     vært uopprettelig for pre-start-DELETE-en).
--   * SECURITY DEFINER kalt med service-role ⇒ auth.uid() er NULL, og alle tre
--     vaktene på game_players (invite_eligibility BEFORE INSERT,
--     score_differential + self_update BEFORE UPDATE) returnerer da med én
--     gang. Ingen policy- eller vakt-endring trengs. Verifisert live 2026-09-02.
--
-- Kroppen under er den LEVENDE 0142-formen (pg_get_functiondef i staging OG
-- prod, md5 16917e3af679d8382421ad0ee3f9808e i begge) + frafallsstegene. Den er
-- IKKE kopiert fra 0142-fila.
--
-- Rekkefølge mot prod: denne migrasjonen er ufarlig FØR kode-deploy (den
-- trekker bare folk dagens sperre uansett ikke slipper gjennom), men koden er
-- feil UTEN den. Derfor: staging → verifiser → prod → merge/deploy.

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
  'Idempotent. Kun service_role har EXECUTE; kalles fra deleteOrAnonymizeUser.';
