-- 0236 (#2315 PR A): varselvalgene — hvilke grupper som plinger, og stille tid.
--
-- Én rad per spiller. Ingen rad betyr standardverdiene (alt på, ingen stille
-- tid), så eksisterende brukere trenger ingen utfylling. notify() leser raden
-- med service-rollen og lar være å sende push for en dempet gruppe, eller om
-- natta (22–07 norsk tid) når stille tid er på. «Rundene dine» er alltid på og
-- kan derfor ikke stå i lista. Regelen bor i lib/notifications/pushPreferences.ts,
-- gruppene i lib/notifications/pushGroups.ts (MUTABLE_PUSH_GROUPS speiler
-- CHECK-en her). Innboksen og e-posten er uendret.
--
-- Hvorfor en egen tabell: users har kolonnevise SELECT-rettigheter, og
-- medspillere kan lese users-raden. Her slipper RLS bare eieren av raden til,
-- og serveren leser med service-rollen (mønster: ai_consents, 0210).
--
-- updated_at settes av databasen (triggeren), aldri av klienten.
--
-- Rettigheter: Supabase gir anon og authenticated alle tabellrettigheter på
-- nye tabeller i public (pg_default_acl). anon får ingenting; authenticated
-- beholder select, insert og update (upsert fra appen), men ikke delete,
-- truncate, references eller trigger (mønster: 0195, 0210).
--
-- anonymize_user-kroppen er 0232-kroppen (verifisert byte-lik den levende
-- funksjonen i staging 2026-11-14, md5(prosrc) 73f94d74) + én linje:
-- `delete from public.notification_preferences`. create or replace beholder
-- grantene (postgres og service_role).
--
-- Rekkefølge mot prod: additiv og trygg å påføre før koden. Gammel kode leser
-- ikke tabellen, og ny kode tåler at den mangler (en lesefeil gir push som i
-- dag).

create table public.notification_preferences (
  user_id uuid primary key references public.users (id) on delete cascade,
  muted_groups text[] not null default '{}'
    check (muted_groups <@ array['scorecards', 'friends', 'signups']::text[]),
  quiet_hours boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.notification_preferences is
  'Varselvalgene (#2315): gruppene som ikke skal plinge (muted_groups) og stille '
  'tid om natta (quiet_hours, 22–07 norsk tid). Ingen rad betyr alt på. Bare '
  'eieren leser og skriver raden; serveren leser med service-rollen. Push stoppes, '
  'innboksen og e-posten er uendret.';

alter table public.notification_preferences enable row level security;

create policy "notification_preferences select own"
  on public.notification_preferences
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "notification_preferences insert own"
  on public.notification_preferences
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "notification_preferences update own"
  on public.notification_preferences
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.notification_preferences from anon;
revoke delete, truncate, references, trigger on public.notification_preferences from authenticated;

create or replace function public.notification_preferences_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.notification_preferences_set_updated_at() from public, anon, authenticated;

create trigger notification_preferences_set_updated_at
  before insert or update on public.notification_preferences
  for each row
  execute function public.notification_preferences_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- anonymize_user — varselvalgene følger kontoen
-- ─────────────────────────────────────────────────────────────────────────────
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
  'AI-samtykket (ai_consents, 0210) og varselvalgene (notification_preferences, 0236). '
  'Spillerklassen nullstilles til normal (0210). '
  'Kaster sole_club_owner (#1910) uten å skrive noe når kontoen er eneste eier '
  'av en klubb med andre medlemmer (is_sole_club_owner). '
  'Idempotent. Kun service_role har EXECUTE; kalles fra deleteOrAnonymizeUser.';
