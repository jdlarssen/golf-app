-- 0195 (#2256): handicap-historikk, så bag-taggen i appen kan tegne sesongens
-- kurve og «−x denne sesongen».
--
-- Hvorfor en egen tabell: users.hcp_index er bare siste verdi, og
-- handicap_updated_at sier når den sist ble satt eller bekreftet. Kurven
-- trenger verdiene over tid.
--
-- Skrives bare av databasen: triggeren under fyrer når hcp_index endres på en
-- ferdig profil (og når profilen blir ferdig), uansett hvilken vei endringen
-- kom (profilen, admin, fullfør-profil). Den er security definer, så ingen
-- klient trenger skriverett: tabellen har bare en lese-policy for egne rader,
-- og insert/update/delete er trukket fra anon og authenticated.
--
-- En rad skrives bare når verdien er en annen enn den siste. En spiller kan
-- sette sin egen profile_completed_at av og på (0185-vakta dekker den ikke),
-- og uten den regelen ville hver runde gitt en kopi av samme punkt.
--
-- En uferdig profil står på standardverdien 54, som ikke er et handicap, så
-- den gir ingen rad. En slettet konto (deleted_at) gir heller ingen, og
-- anonymize_user sletter historikken med de andre personlige radene.
--
-- Backfill: én rad per ferdig, ikke-slettet profil med dagens hcp_index og
-- handicap_updated_at som tidspunkt, så første endring etter dette gir to
-- punkter og kurven med en gang.
--
-- anonymize_user-kroppen er 0184-kroppen (verifisert lik den levende
-- funksjonen i staging 2026-09-30, md5 c1a066c8) + én delete-linje etter
-- kavalkade_shares. create or replace beholder grantene (kun service_role).
--
-- Rekkefølge mot prod: FØR appen som leser tabellen. Uten tabellen svarer
-- appens lesing med en feil, og bag-taggen viser «Oppdatert …» som før.

create table public.handicap_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  hcp_index numeric(4, 1) not null,
  recorded_at timestamptz not null default now()
);

create index handicap_history_user_recorded_idx
  on public.handicap_history (user_id, recorded_at);

alter table public.handicap_history enable row level security;

create policy "handicap_history read own"
  on public.handicap_history
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.handicap_history from anon, authenticated;

create or replace function public.record_handicap_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last numeric;
begin
  if new.deleted_at is not null or new.profile_completed_at is null then
    return null;
  end if;

  select h.hcp_index into v_last
    from public.handicap_history h
   where h.user_id = new.id
   order by h.recorded_at desc, h.id desc
   limit 1;

  if v_last is distinct from new.hcp_index then
    insert into public.handicap_history (user_id, hcp_index)
    values (new.id, new.hcp_index);
  end if;
  return null;
end;
$$;

revoke execute on function public.record_handicap_history() from public, anon, authenticated;

create trigger users_record_handicap_history
  after insert or update of hcp_index, profile_completed_at on public.users
  for each row
  execute function public.record_handicap_history();

insert into public.handicap_history (user_id, hcp_index, recorded_at)
select id, hcp_index, handicap_updated_at
  from public.users
 where profile_completed_at is not null
   and deleted_at is null;

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
    delete from public.apns_tokens where user_id = p_user_id;
    delete from public.kavalkades where user_id = p_user_id;
    delete from public.kavalkade_shares where user_id = p_user_id;
    -- Handicap-historikken (#2256, 0195). Står etter scrubben: hcp_index = 54.0
    -- der over fyrer ikke historikk-triggeren for en slettet konto, men raden
    -- ryddes uansett her.
    delete from public.handicap_history where user_id = p_user_id;
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
  'Personlige rader slettes, også enhetstoken (apns_tokens) og Kavalkaden '
  '(kavalkades, kavalkade_shares) — #1899 (0184) — og handicap-historikken (0195). '
  'Kaster sole_club_owner (#1910) uten å skrive noe når kontoen er eneste eier '
  'av en klubb med andre medlemmer (is_sole_club_owner). '
  'Idempotent. Kun service_role har EXECUTE; kalles fra deleteOrAnonymizeUser.';
