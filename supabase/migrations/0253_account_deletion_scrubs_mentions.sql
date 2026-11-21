-- 0253: account deletion also cleans up what OTHER people's rows say about the
-- person, and the invitations the person sent.
--
-- anonymize_user scrubs the users row and deletes the person's own rows. Rows
-- that belong to someone else kept the name as text:
--
--   * notifications.payload of other users: `player_name`, `invited_by_name`,
--     `requester_name` and the other person keys, the sign-up `message`, and
--     the first names in the organiser's evening status
--   * games.round_report (prose written from names and results) and its first
--     lines in `game_finished` notifications
--   * admin_audit_log.actor_name (an organiser acting on own rounds)
--   * other users' kavalkades rows that hold the person as rival or team-mate
--
-- New: scrub_user_mentions(user, name, nickname, email), called by
-- anonymize_user before it changes anything, and by a BEFORE DELETE trigger on
-- public.users, so the hard-delete path (an account that never played, a guest)
-- cleans the same rows inside the same transaction. On that path the text is
-- only searched for an account that has completed its profile and is not a
-- guest. A guest, and an account that is removed again right after it was
-- made (a creation that is rolled back), is matched on the id alone, so a
-- name a host typed can never rewrite a namesake's notice.
--
-- How a name is found. A payload key with an id next to it (`player_id`,
-- `submitter_id`, `actor_id`, the sign-up's `request_id`) is matched on the id,
-- so a renamed account is covered and a namesake is not touched. A key without
-- an id is matched on the text: the forms the writers store (name, nickname,
-- name + «nickname», first "nickname" last, the masked address of an account
-- without a name), compared without case and punctuation, plus any value that
-- holds the whole name when the name has two or more words. A namesake with the
-- exact same form in an old notice is replaced too; that costs a name in an
-- inbox card, never access.
--
-- The value written is the literal 'Slettet bruker', the same text the users
-- row gets: it satisfies every payload schema (some name keys are not
-- nullable), also in app builds that are already installed.
--
-- A round report cannot be edited word by word, so the report of a round the
-- person played is removed when it names them: first name, last name or
-- nickname as a whole word, with or without a genitive s («Ola», «Olas», never
-- «Olav»). The result list of the round is untouched.
--
-- The scan is narrowed before the JSON work: a notification is only opened
-- when its text holds the person's id, one of the sign-up ids, or the first
-- word of the name, the nickname or the masked address.
--
-- Rows written before this migration are not revisited: an account that was
-- deleted earlier has no name left to search for.
--
-- anonymize_user: the live body on staging 2026-11-21 (md5(prosrc) 98ae28c6,
-- byte-identical to 0247) plus three changes: it reads name, nickname and
-- deleted_at, calls scrub_user_mentions on the first run, and deletes the
-- invitations the account sent. Every existing step is kept. create or replace
-- keeps the grants (postgres and service_role).
--
-- Order against prod: additive, safe before the code. The code on main calls
-- anonymize_user(uuid) with the same signature and reads nothing new.

-- ─── Helpers ───────────────────────────────────────────────────────────────

-- Lower case, punctuation and quote marks to spaces, runs of spaces to one.
-- null for an empty text.
create or replace function public.mention_norm(p_text text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select nullif(
    btrim(regexp_replace(
      regexp_replace(lower(coalesce(p_text, '')), '[«»"“”''’.,;:!?()\[\]/–—-]+', ' ', 'g'),
      '\s+', ' ', 'g')),
    '');
$function$;

-- Is this stored name the person? `p_forms` are normalised forms, `p_full` the
-- normalised full name when it has two or more words (else null).
create or replace function public.mention_is_person(p_value text, p_forms text[], p_full text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select coalesce(
    n.v = any(p_forms)
      or (p_full is not null and position(' ' || p_full || ' ' in ' ' || n.v || ' ') > 0),
    false)
  from (select public.mention_norm(p_value) as v) n;
$function$;

-- Does this prose name the person? A token must be a whole word, with or
-- without a genitive s: «Per» finds «Per» and «Pers», not «personlig».
create or replace function public.mention_in_prose(p_text text, p_tokens text[])
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select coalesce(bool_or(
    position(' ' || t.token || ' ' in n.v) > 0
      or position(' ' || t.token || 's ' in n.v) > 0), false)
  from unnest(p_tokens) as t(token),
       (select ' ' || public.mention_norm(p_text) || ' ' as v) n;
$function$;

-- ─── The scrub ─────────────────────────────────────────────────────────────

create or replace function public.scrub_user_mentions(
  p_user_id uuid,
  p_name text,
  p_nickname text,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
  declare
    c_gone constant text := 'Slettet bruker';
    -- The payload keys that hold a person's name (lib/notifications/types.ts).
    -- game_name, team_name, course_name and the like are not people.
    c_person_keys constant text[] := array[
      'invited_by_name', 'submitter_name', 'player_name', 'approver_name',
      'rejecter_name', 'actor_name', 'requester_name', 'withdrawn_player_name',
      'marker_name', 'participant_name', 'added_by_name', 'moved_by_name',
      'organizer_name'
    ];
    v_uid text := p_user_id::text;
    v_name text := public.mention_norm(p_name);
    v_nick text := public.mention_norm(p_nickname);
    v_parts text[] := regexp_split_to_array(btrim(coalesce(p_name, '')), '\s+');
    v_first text;
    v_last text;
    v_full text;
    v_masked text;
    v_at int := position('@' in coalesce(p_email, ''));
    v_forms text[];
    v_short text[];
    v_tokens text[];
    v_needles text[];
    v_games text[];
    v_requests text[];
  begin
    -- A row that is already a tombstone has no name left to look for.
    if v_name = public.mention_norm(c_gone) then
      v_name := null;
      v_parts := array[]::text[];
    end if;

    v_first := public.mention_norm(v_parts[1]);
    if coalesce(array_length(v_parts, 1), 0) >= 2 then
      v_last := public.mention_norm(v_parts[array_length(v_parts, 1)]);
      v_full := v_name;
    end if;

    -- displayNameForOthers falls back to the masked address (maskEmail) when
    -- the account has no name.
    if v_at > 1 and p_email not like 'slettet+%@deleted.tornygolf.no' then
      v_masked := public.mention_norm(
        left(p_email, case when v_at - 1 <= 2 then 1 else 2 end) || '•••' || substr(p_email, v_at));
    end if;

    -- null || text is null, so a form that needs a missing part drops out.
    v_forms := array_remove(array[
      v_name,
      v_nick,
      v_name || ' ' || v_nick,
      v_first || ' ' || v_nick || ' ' || v_last,
      v_masked,
      v_masked || ' ' || v_nick
    ], null);
    v_short := array_remove(array[v_first, v_nick, v_name], null);
    v_tokens := array_remove(array[v_first, v_last, v_nick], null);
    -- Every form above holds the first word of the name, of the nickname or of
    -- the masked address. A payload whose text holds none of them (and neither
    -- the id nor a sign-up id) cannot match, and is never opened.
    v_needles := array_remove(array[
      split_part(v_name, ' ', 1),
      split_part(v_nick, ' ', 1),
      split_part(v_masked, ' ', 1)
    ], null);

    select coalesce(array_agg(gp.game_id::text), array[]::text[]) into v_games
      from public.game_players gp where gp.user_id = p_user_id;
    select coalesce(array_agg(r.id::text), array[]::text[]) into v_requests
      from public.game_registration_requests r where r.user_id = p_user_id;

    -- (1) The sign-up message is the person's own words; the request row it
    -- came from is deleted with the account. The same goes for what an
    -- organiser wrote when cancelling a round.
    update public.notifications n
       set payload = n.payload - 'message'
     where n.user_id <> p_user_id
       and n.kind = 'registration_request'
       and n.payload ? 'message'
       and (n.payload->>'request_id' = any(v_requests)
            or public.mention_is_person(n.payload->>'requester_name', v_forms, v_full));

    update public.notifications n
       set payload = n.payload - 'message'
     where n.user_id <> p_user_id
       and n.kind = 'game_cancelled'
       and n.payload ? 'message'
       and public.mention_is_person(n.payload->>'organizer_name', v_forms, v_full);

    -- (2) The name keys.
    update public.notifications n
       set payload = s.scrubbed
      from (
        select n2.id,
               (select jsonb_object_agg(
                         e.key,
                         case
                           when e.key = any(c_person_keys)
                            and jsonb_typeof(e.value) = 'string'
                            and case
                                  when e.key = 'submitter_name' and n2.payload ? 'submitter_id'
                                    then n2.payload->>'submitter_id' = v_uid
                                  when e.key = 'player_name' and n2.payload ? 'player_id'
                                    then n2.payload->>'player_id' = v_uid
                                  when e.key = 'actor_name' and n2.payload ? 'actor_id'
                                    then n2.payload->>'actor_id' = v_uid
                                  else
                                    (e.key = 'requester_name'
                                      and n2.kind = 'registration_request'
                                      and n2.payload->>'request_id' = any(v_requests))
                                    or public.mention_is_person(e.value #>> '{}', v_forms, v_full)
                                end
                             then to_jsonb(c_gone)
                           else e.value
                         end)
                  from jsonb_each(n2.payload) e) as scrubbed
          from public.notifications n2
         where n2.user_id <> p_user_id
           and n2.payload ?| c_person_keys
           and (strpos(n2.payload::text, v_uid) > 0
                or n2.payload->>'request_id' = any(v_requests)
                or exists (
                     select 1 from unnest(v_needles) as nd(needle)
                      where strpos(lower(n2.payload::text), nd.needle) > 0))
      ) s
     where n.id = s.id
       and s.scrubbed is distinct from n.payload;

    -- (3) The organiser's evening status lists first names of those who have
    -- not answered. First names are common, so only rounds the person is on.
    -- The name leaves the list and is counted with «og N til».
    update public.notifications n
       set payload = jsonb_set(
             jsonb_set(n.payload, '{unanswered_names}', s.kept),
             '{unanswered_more}',
             to_jsonb(coalesce((n.payload->>'unanswered_more')::int, 0) + s.removed))
      from (
        select n2.id,
               coalesce(jsonb_agg(el.value order by el.ord) filter (where not h.hit), '[]'::jsonb) as kept,
               (count(*) filter (where h.hit))::int as removed
          from public.notifications n2
          cross join lateral jsonb_array_elements(n2.payload->'unanswered_names')
                             with ordinality as el(value, ord)
          cross join lateral (
            select coalesce(public.mention_norm(el.value #>> '{}') = any(v_short), false) as hit
          ) h
         where n2.user_id <> p_user_id
           and n2.kind = 'organizer_evening_status'
           and jsonb_typeof(n2.payload->'unanswered_names') = 'array'
           and n2.payload->>'game_id' = any(v_games)
         group by n2.id
      ) s
     where n.id = s.id
       and s.removed > 0;

    -- (4) The round report, and its first lines in the «runden er ferdig»
    -- notice.
    update public.games g
       set round_report = null
     where g.round_report is not null
       and g.id::text = any(v_games)
       and public.mention_in_prose(g.round_report, v_tokens);

    update public.notifications n
       set payload = n.payload - 'report_start'
     where n.user_id <> p_user_id
       and n.kind = 'game_finished'
       and n.payload ? 'report_start'
       and n.payload->>'game_id' = any(v_games)
       and public.mention_in_prose(n.payload->>'report_start', v_tokens);

    -- (5) The audit log keeps who did what as an id and a name snapshot. The id
    -- stays (it points at the scrubbed row), the snapshot goes.
    update public.admin_audit_log
       set actor_name = c_gone
     where actor_user_id = p_user_id
       and actor_name is distinct from c_gone;

    -- (6) Other players' Kavalkade rows that hold the person as rival or
    -- team-mate (name and id in facts, the name in the narrative). The row is
    -- rebuilt from the rounds the next time its owner opens the Kavalkade.
    delete from public.kavalkades k
     where k.user_id <> p_user_id
       and position(v_uid in k.facts::text) > 0;
  end;
$function$;

comment on function public.scrub_user_mentions(uuid, text, text, text) is
  'Removes a person from other people''s rows when the account is deleted (0253): '
  'name keys and the sign-up message in notifications.payload, the first name in the '
  'organiser''s evening status, round reports that name the person, the name snapshot '
  'in admin_audit_log, and other users'' kavalkades that hold the person. Called by '
  'anonymize_user and by the BEFORE DELETE trigger on public.users. service_role only.';

revoke all on function public.mention_norm(text) from public, anon, authenticated;
revoke all on function public.mention_is_person(text, text[], text) from public, anon, authenticated;
revoke all on function public.mention_in_prose(text, text[]) from public, anon, authenticated;
revoke all on function public.scrub_user_mentions(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.mention_norm(text) to service_role;
grant execute on function public.mention_is_person(text, text[], text) to service_role;
grant execute on function public.mention_in_prose(text, text[]) to service_role;
grant execute on function public.scrub_user_mentions(uuid, text, text, text) to service_role;

-- ─── The hard-delete path ──────────────────────────────────────────────────
-- auth.admin.deleteUser(id) cascades into public.users. anonymize_user is not
-- on that path, so the same scrub runs from a trigger, in the transaction of
-- the delete: a delete that fails on a remaining FK rolls the scrub back too.
-- Fires after guard_users_admin_delete (triggers fire in name order).

create or replace function public.scrub_user_mentions_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
  declare
    -- A guest's name is typed by a host, and an account without a completed
    -- profile was made moments ago (a creation that is rolled back lands
    -- here). Neither has written anything under its own name, so the text is
    -- not searched: id matches only.
    v_text boolean := not old.is_guest and old.profile_completed_at is not null;
  begin
    if old.deleted_at is null then
      perform public.scrub_user_mentions(
        old.id,
        case when v_text then old.name end,
        case when v_text then old.nickname end,
        case when v_text then old.email end);
    end if;
    return old;
  end;
$function$;

revoke all on function public.scrub_user_mentions_on_delete() from public, anon, authenticated;

drop trigger if exists users_scrub_mentions_on_delete on public.users;
create trigger users_scrub_mentions_on_delete
  before delete on public.users
  for each row execute function public.scrub_user_mentions_on_delete();

-- ─── anonymize_user ────────────────────────────────────────────────────────

create or replace function public.anonymize_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
  declare
    v_email text;
    v_is_admin boolean;
    v_name text;
    v_nickname text;
    v_deleted_at timestamptz;
  begin
    select email, is_admin, name, nickname, deleted_at
      into v_email, v_is_admin, v_name, v_nickname, v_deleted_at
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

    -- ─── Other people's rows (0253) ───────────────────────────────────────
    -- Before the withdrawal and the scrub: the roster rows and the real name
    -- are still there to match on. A second run finds the tombstone and skips
    -- (the name is already «Slettet bruker»).
    if v_deleted_at is null then
      perform public.scrub_user_mentions(p_user_id, v_name, v_nickname, v_email);
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

    -- Invitations the account SENT (0253). Each row ties another person's
    -- e-mail address to this account, and an open one would make its receiver
    -- a friend of a deleted account at their next login. The receipts of
    -- «Legg til venn på e-post» (invitation_receipts, 0252) follow by cascade.
    -- Club invitations stay: they belong to the club, and the row holds only
    -- the pointer to the scrubbed account.
    delete from public.invitations where invited_by = p_user_id;
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
  'Navnet fjernes også fra andres rader (scrub_user_mentions, 0253): varsler, '
  'kampreferat, revisjonslogg og andres Kavalkade, og invitasjonene kontoen sendte slettes. '
  'Kaster sole_club_owner (#1910) uten å skrive noe når kontoen er eneste eier '
  'av en klubb med andre medlemmer (is_sole_club_owner). '
  'Idempotent. Kun service_role har EXECUTE; kalles fra deleteOrAnonymizeUser.';
