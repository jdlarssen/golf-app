-- 0232_fcm_tokens.sql
-- #2758: FCM device tokens for the Android app, one row per device. Sister table
-- to apns_tokens (0166) rather than a shared one: apns_tokens has `environment`,
-- and claim_apns_token cannot change signature without breaking app builds that
-- are already out. Nothing writes here until the app code ships and nothing reads
-- it until FCM_SERVICE_ACCOUNT is set, so it is safe to apply before the deploy.
--
-- Grants: Supabase gives anon and authenticated every table privilege on new
-- tables in public (pg_default_acl). anon gets nothing; authenticated keeps the
-- four the app uses (pattern: 0195, 0210).
--
-- The anonymize_user body is the 0210 body (verified byte-identical to the live
-- function in staging 2026-11-02, md5(prosrc) 897f1107) plus one line:
-- `delete from public.fcm_tokens`. create or replace keeps the grants.
--
-- GUARDRAIL (same as 0167): the table does not set FORCE ROW LEVEL SECURITY, and
-- claim_fcm_token relies on that to bypass RLS as the table owner.

create table public.fcm_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  token        text not null unique,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index fcm_tokens_user_idx on public.fcm_tokens (user_id);

comment on table public.fcm_tokens is
  'FCM device token per Android-app device (#2758). One user -> many rows. '
  'notify() fans out a native push to these when the user is off-app, next to '
  'the web-push and APNs fan-outs.';

alter table public.fcm_tokens enable row level security;

-- RLS: a user manages only their own device rows.
create policy "fcm_tokens own select"
  on public.fcm_tokens for select to authenticated
  using (user_id = (select auth.uid()));

create policy "fcm_tokens own insert"
  on public.fcm_tokens for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "fcm_tokens own update"
  on public.fcm_tokens for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "fcm_tokens own delete"
  on public.fcm_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.fcm_tokens from anon;
revoke truncate, references, trigger on public.fcm_tokens from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- claim_fcm_token — the account-switch fallback (mirror of claim_apns_token, 0167)
-- ─────────────────────────────────────────────────────────────────────────────
-- An FCM token is an unguessable value only the device knows, so presenting the
-- exact value is the device-possession proof. The row is always bound to
-- auth.uid(), never to a client-supplied user_id.
create or replace function public.claim_fcm_token(p_token text, p_user_agent text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'claim_fcm_token: not authenticated' using errcode = '42501';
  end if;
  if p_token is null or p_token = '' then
    raise exception 'claim_fcm_token: empty token';
  end if;

  -- Possession claim: touch ONLY the row matching the presented value.
  delete from public.fcm_tokens where token = p_token;
  insert into public.fcm_tokens (user_id, token, user_agent)
    values (v_uid, p_token, left(p_user_agent, 400));
end;
$$;

comment on function public.claim_fcm_token(text, text) is
  '#2758 (0232): possession-gated takeover of an FCM token row when a device '
  'switches accounts. Deletes whichever row holds the exact presented token and '
  'inserts it for auth.uid() — never a client-supplied user_id. Called only as a '
  'fallback after the ordinary upsert was refused by RLS (42501); knowing the '
  'unguessable token IS the device-possession proof.';

revoke execute on function public.claim_fcm_token(text, text) from public, anon;
grant execute on function public.claim_fcm_token(text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- anonymize_user — the device row follows the account
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
  'Personlige rader slettes, også enhetstoken (apns_tokens, fcm_tokens 0232) og Kavalkaden '
  '(kavalkades, kavalkade_shares) — #1899 (0184) — handicap-historikken (0195) '
  'og AI-samtykket (ai_consents, 0210). Spillerklassen nullstilles til normal (0210). '
  'Kaster sole_club_owner (#1910) uten å skrive noe når kontoen er eneste eier '
  'av en klubb med andre medlemmer (is_sole_club_owner). '
  'Idempotent. Kun service_role har EXECUTE; kalles fra deleteOrAnonymizeUser.';
