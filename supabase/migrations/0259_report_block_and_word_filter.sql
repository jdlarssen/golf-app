-- 0259_report_block_and_word_filter.sql
-- #3019: Apple guideline 1.2 and Google Play's UGC policy. A player can report
-- a person or a round, block another player, and text that other players see
-- is checked against a word list. Players also accept short terms once.
--
--   1. user_blocks + is_blocked_between(a, b)
--   2. A block ends the friendship and stops every friend path
--   3. A block stops adding the other person to a game or a cup
--   4. content_reports (players insert, admins read and handle)
--   5. terms_acceptances (one row per user and terms version)
--   6. The word filter: contains_blocked_word(text) + guard triggers, which
--      also hold the length caps that were missing (60 for a player's name
--      and nickname, 120 for round, course and tee names; prod's longest on
--      28.11.2026: 26, 12, 35, 32 and 21 characters)
--   7. anonymize_user removes the new personal rows
--
-- The block is symmetric where it matters: neither of the two can add the
-- other, and no friendship can exist between them. Who blocked whom is only
-- visible to the blocker (RLS on user_blocks), and every refusal looks like a
-- refusal that exists today, so the blocked person cannot tell.
--
-- Apply before the web and app code that reads the new tables. The reads fail
-- closed if a table is missing.

-- ── 1. user_blocks ─────────────────────────────────────────────────────────

create table public.user_blocks (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

comment on table public.user_blocks is
  '#3019: one row per block. Only the blocker reads, writes or deletes it; '
  'the blocked person gets no signal. is_blocked_between() is the one place '
  'other rules ask.';

create index user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

create policy "user_blocks select own" on public.user_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "user_blocks insert own" on public.user_blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy "user_blocks delete own" on public.user_blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

revoke all on public.user_blocks from anon;
revoke update, truncate, references, trigger on public.user_blocks from authenticated;

create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks b
     where (b.blocker_id = p_a and b.blocked_id = p_b)
        or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

comment on function public.is_blocked_between(uuid, uuid) is
  '#3019: true when either of the two has blocked the other.';

revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated, service_role;

-- ── 2. A block ends the friendship ─────────────────────────────────────────

create or replace function public.user_blocks_end_friendship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
  begin
    delete from public.friendships
     where (requester_id = new.blocker_id and addressee_id = new.blocked_id)
        or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
    return new;
  end;
$$;

revoke all on function public.user_blocks_end_friendship() from public, anon, authenticated;

create trigger user_blocks_end_friendship
  after insert on public.user_blocks
  for each row
  execute function public.user_blocks_end_friendship();

-- Every friend path (send_friend_request, connect_via_friend_code,
-- befriend_inviter, respond_friend_request, friend_request_by_email) writes
-- public.friendships. One guard there covers all of them; the callers already
-- turn an exception into the same «Noe gikk galt» they show for any failure.
create or replace function public.guard_friendships_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
  begin
    if public.is_blocked_between(new.requester_id, new.addressee_id) then
      raise exception 'friendship not allowed'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end;
$$;

revoke all on function public.guard_friendships_block() from public, anon, authenticated;

create trigger guard_friendships_block
  before insert or update on public.friendships
  for each row
  execute function public.guard_friendships_block();

-- «Legg til venn på e-post» answers every address the same way (0252). A
-- blocked address must get that answer too, without a friendship, a receipt
-- or a mail: the outcome 'blocked' is shown as 'requested' by the caller.
create or replace function public.friend_request_by_email(
  p_requester uuid,
  p_email text,
  p_token text,
  p_expires_at timestamptz
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
  declare
    v_email   text := lower(trim(coalesce(p_email, '')));
    v_target  uuid;
    v_outcome text;
    v_receipt uuid;
  begin
    if p_requester is null then raise exception 'requester_required'; end if;
    if length(v_email) = 0 then raise exception 'email_required'; end if;
    if p_token is null or p_expires_at is null then raise exception 'receipt_required'; end if;

    -- One call at a time for a sender and an address: two calls that arrive
    -- together write one receipt, not two.
    perform pg_advisory_xact_lock(hashtextextended(p_requester::text || ':' || v_email, 0));

    select id into v_target
      from public.users
     where lower(email) = v_email
       and deleted_at is null
     limit 1;
    if v_target = p_requester then
      return jsonb_build_object('outcome', 'self', 'target_id', v_target);
    end if;

    -- #3019: nothing is written for a blocked pair, and the id stays hidden.
    if v_target is not null and public.is_blocked_between(p_requester, v_target) then
      return jsonb_build_object('outcome', 'blocked', 'target_id', null);
    end if;

    -- Asked this address already, and the receipt is still open: nothing more
    -- is written and nothing is sent twice.
    if exists (
      select 1 from public.invitations
       where invited_by = p_requester
         and game_id is null
         and accepted_at is null
         and expires_at > now()
         and lower(email) = v_email
    ) then
      return jsonb_build_object('outcome', 'already_sent', 'target_id', null);
    end if;

    if v_target is null then
      v_outcome := 'unknown';
    elsif exists (
      select 1 from public.friendships
       where status = 'accepted'
         and ((requester_id = p_requester and addressee_id = v_target)
           or (requester_id = v_target and addressee_id = p_requester))
    ) then
      v_outcome := 'already_friends';
    else
      -- The other person already asked: this is the answer.
      update public.friendships
         set status = 'accepted', responded_at = now()
       where requester_id = v_target and addressee_id = p_requester and status = 'pending';
      if found then
        perform public.mark_email_receipt_accepted(v_target, p_requester);
        v_outcome := 'accepted';
      else
        insert into public.friendships (requester_id, addressee_id, status, by_email)
        values (p_requester, v_target, 'pending', true)
        on conflict (requester_id, addressee_id) do nothing;
        v_outcome := case when found then 'requested' else 'already_pending' end;
      end if;
    end if;

    -- The receipt: one row for every address, in the same transaction. For
    -- a person who already had an account it gets its mark (rule 6).
    insert into public.invitations (email, token, invited_by, game_id, expires_at)
    values (v_email, p_token, p_requester, null, p_expires_at)
    returning id into v_receipt;
    if v_target is not null then
      insert into public.invitation_receipts (invitation_id) values (v_receipt);
    end if;

    return jsonb_build_object('outcome', v_outcome, 'target_id', v_target);
  end $$;

revoke all on function public.friend_request_by_email(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.friend_request_by_email(uuid, text, text, timestamptz) to service_role;

-- ── 3. A block stops adding the other person ───────────────────────────────

-- The invite rule (0252) gains one condition. roster_candidates (0181) and
-- the game_players guard both ask it, so the app's picker and the database
-- agree. Its TS twin is lib/games/inviteEligibility.ts.
create or replace function public.is_invite_eligible(p_creator uuid, p_recipient uuid, p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select
      not public.is_blocked_between(p_creator, p_recipient)
      and (
        exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.requester_id = p_creator and f.addressee_id = p_recipient)
              or (f.addressee_id = p_creator and f.requester_id = p_recipient))
        )
        or exists (
          select 1
          from public.game_players me
          join public.game_players them on me.game_id = them.game_id
          join public.games g on g.id = me.game_id
          where me.user_id = p_creator
            and them.user_id = p_recipient
            and (g.status <> 'draft'::public.game_status or g.created_by = p_creator)
        )
        or (
          p_group_id is not null
          and exists (
            select 1 from public.group_members gm
            where gm.group_id = p_group_id
              and gm.user_id = p_recipient
          )
        )
      );
$$;

-- The cup and league exceptions (#2567) skip is_invite_eligible, so the
-- block is checked first. The error is the one every refused add gets.
create or replace function public.guard_game_players_invite_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
  declare
    v_uid uuid := auth.uid();
    v_group_id uuid;
    v_tournament_id uuid;
    v_league_round_id uuid;
  begin
    if v_uid is null or public.is_admin() or new.user_id = v_uid then
      return new;
    end if;

    -- #3019: a blocked pair never adds each other, cup and league included.
    if public.is_blocked_between(v_uid, new.user_id) then
      raise exception
        'Recipient % is not invite-eligible for creator % (friends/co-players/club members only)',
        new.user_id, v_uid
        using errcode = 'insufficient_privilege';
    end if;

    select g.group_id, g.tournament_id, g.league_round_id
      into v_group_id, v_tournament_id, v_league_round_id
      from public.games g
     where g.id = new.game_id;

    -- #2567: whoever manages a cup may put the cup's own participants in the
    -- cup's games.
    if v_tournament_id is not null
       and public.can_manage_tournament(v_tournament_id)
       and exists (
         select 1 from public.tournament_participants tp
          where tp.tournament_id = v_tournament_id
            and tp.user_id = new.user_id
       ) then
      return new;
    end if;

    -- #2567: a member of an active league may put another member of the same
    -- league in a flight of that league.
    if v_league_round_id is not null
       and exists (
         select 1
           from public.league_rounds lr
           join public.leagues l on l.id = lr.league_id
          where lr.id = v_league_round_id
            and l.status = 'active'
            and exists (
              select 1 from public.league_players me
               where me.league_id = lr.league_id and me.user_id = v_uid
            )
            and exists (
              select 1 from public.league_players them
               where them.league_id = lr.league_id and them.user_id = new.user_id
            )
       ) then
      return new;
    end if;

    if not public.is_invite_eligible(v_uid, new.user_id, v_group_id) then
      raise exception
        'Recipient % is not invite-eligible for creator % (friends/co-players/club members only)',
        new.user_id, v_uid
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
  $function$;

-- Cup participants are written by the service role only (0208), so the
-- caller is unknown here: the cup's creator stands in for the organiser.
-- The TS paths filter the same pair first and answer with their usual
-- «not a candidate»; this is the backstop.
create or replace function public.guard_tournament_participants_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
  declare
    v_creator uuid;
  begin
    select t.created_by into v_creator
      from public.tournaments t
     where t.id = new.tournament_id;
    if v_creator is not null
       and v_creator <> new.user_id
       and public.is_blocked_between(v_creator, new.user_id) then
      raise exception 'participant not allowed'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end;
$$;

revoke all on function public.guard_tournament_participants_block() from public, anon, authenticated;

create trigger guard_tournament_participants_block
  before insert on public.tournament_participants
  for each row
  execute function public.guard_tournament_participants_block();

-- ── 4. content_reports ─────────────────────────────────────────────────────

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  target_user_id uuid references public.users(id) on delete cascade,
  target_game_id uuid references public.games(id) on delete cascade,
  reason text not null,
  note text,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references public.users(id) on delete set null,
  constraint content_reports_reason_check
    check (reason in ('offensive', 'harassment', 'other')),
  constraint content_reports_note_length
    check (note is null or char_length(note) <= 500),
  constraint content_reports_one_target
    check (num_nonnulls(target_user_id, target_game_id) = 1),
  constraint content_reports_not_self
    check (target_user_id is distinct from reporter_id)
);

comment on table public.content_reports is
  '#3019: what players report. A player inserts their own report and never '
  'reads it back; admins read and handle all of them.';

create index content_reports_open_idx on public.content_reports (created_at)
  where handled_at is null;

alter table public.content_reports enable row level security;

create policy "content_reports insert own" on public.content_reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and handled_at is null
    and handled_by is null
  );

create policy "content_reports admin select" on public.content_reports
  for select to authenticated
  using (public.is_admin());

create policy "content_reports admin update" on public.content_reports
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.content_reports from anon;
revoke delete, truncate, references, trigger on public.content_reports from authenticated;

-- ── 5. terms_acceptances ───────────────────────────────────────────────────

-- A table of its own, not a column on users: co-players read users rows
-- (same reason as ai_consents, 0210).
create table public.terms_acceptances (
  user_id uuid not null references public.users(id) on delete cascade,
  version integer not null check (version > 0),
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);

comment on table public.terms_acceptances is
  '#3019: one row when a user accepts a version of the terms (/legal/vilkar).';

alter table public.terms_acceptances enable row level security;

create policy "terms_acceptances select own" on public.terms_acceptances
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "terms_acceptances insert own" on public.terms_acceptances
  for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on public.terms_acceptances from anon;
revoke update, delete, truncate, references, trigger on public.terms_acceptances from authenticated;

create or replace function public.terms_acceptances_set_accepted_at()
returns trigger
language plpgsql
set search_path = ''
as $$
  begin
    new.accepted_at := now();
    return new;
  end;
$$;

revoke execute on function public.terms_acceptances_set_accepted_at() from public, anon, authenticated;

create trigger terms_acceptances_set_accepted_at
  before insert on public.terms_acceptances
  for each row
  execute function public.terms_acceptances_set_accepted_at();

-- ── 6. The word filter ─────────────────────────────────────────────────────

-- The list's home is lib/moderation/blockedWords.ts; blockedWords.sync.test.ts
-- holds this copy equal to it. Same normalisation as normaliseWords(): lower
-- case, digit swaps undone, every other non-letter breaks words.
-- blocked-words:start
create or replace function public.contains_blocked_word(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    string_to_array(
      trim(regexp_replace(
        translate(lower(p_text), '013457@$', 'oieastas'),
        '[^a-zæøåäöüéèêáàóòôúùíìñç]+', ' ', 'g'
      )),
      ' '
    ) && array['drittsekk', 'drittsekken', 'fitte', 'fitta', 'fitter', 'fittehue', 'fittetryne', 'hestkuk', 'hore', 'hora', 'horer', 'horunge', 'kuk', 'kukhue', 'kukhode', 'kuksuger', 'neger', 'negeren', 'negre', 'negrer', 'pakkis', 'pakkiser', 'pikk', 'pikktryne', 'rasshøl', 'rasshull', 'svarting', 'svartinger', 'asshole', 'bitch', 'bitches', 'chink', 'cunt', 'cunts', 'faggot', 'faggots', 'fuck', 'fucker', 'fucking', 'kike', 'motherfucker', 'nigga', 'nigger', 'niggers', 'pussy', 'rapist', 'retard', 'retarded', 'slut', 'spic', 'tranny', 'twat', 'wanker', 'whore']::text[],
    false
  );
$$;
-- blocked-words:end

comment on function public.contains_blocked_word(text) is
  '#3019: true when the text holds a word from the list in '
  'lib/moderation/blockedWords.ts (whole words only).';

grant execute on function public.contains_blocked_word(text) to authenticated, service_role;

-- One error for every column. Clients look for the message 'blocked_word'
-- or 'text_too_long' (lib/moderation/textGuardError.ts); the detail names the
-- column. The caps' TS home is lib/moderation/textLimits.ts.
-- Each guard checks a column only when it changes, so an old row that holds
-- a word never stops a status change, a score or the end of a game.

create or replace function public.guard_users_blocked_words()
returns trigger
language plpgsql
set search_path = ''
as $$
  begin
    if (tg_op = 'INSERT' or new.name is distinct from old.name)
       and char_length(new.name) > 60 then
      raise exception 'text_too_long' using errcode = 'P0001', detail = 'users.name';
    end if;
    if (tg_op = 'INSERT' or new.nickname is distinct from old.nickname)
       and char_length(new.nickname) > 60 then
      raise exception 'text_too_long' using errcode = 'P0001', detail = 'users.nickname';
    end if;
    if (tg_op = 'INSERT' or new.name is distinct from old.name)
       and public.contains_blocked_word(new.name) then
      raise exception 'blocked_word' using errcode = 'P0001', detail = 'users.name';
    end if;
    if (tg_op = 'INSERT' or new.nickname is distinct from old.nickname)
       and public.contains_blocked_word(new.nickname) then
      raise exception 'blocked_word' using errcode = 'P0001', detail = 'users.nickname';
    end if;
    return new;
  end;
$$;

create trigger guard_users_blocked_words
  before insert or update of name, nickname on public.users
  for each row
  execute function public.guard_users_blocked_words();

create or replace function public.guard_games_blocked_words()
returns trigger
language plpgsql
set search_path = ''
as $$
  begin
    if (tg_op = 'INSERT' or new.name is distinct from old.name)
       and char_length(new.name) > 120 then
      raise exception 'text_too_long' using errcode = 'P0001', detail = 'games.name';
    end if;
    if (tg_op = 'INSERT' or new.name is distinct from old.name)
       and public.contains_blocked_word(new.name) then
      raise exception 'blocked_word' using errcode = 'P0001', detail = 'games.name';
    end if;
    if (tg_op = 'INSERT' or new.prizes is distinct from old.prizes)
       and exists (
         select 1
           from jsonb_array_elements(coalesce(new.prizes, '[]'::jsonb)) p
          where public.contains_blocked_word(p ->> 'description')
             or public.contains_blocked_word(p ->> 'sponsor')
       ) then
      raise exception 'blocked_word' using errcode = 'P0001', detail = 'games.prizes';
    end if;
    return new;
  end;
$$;

create trigger guard_games_blocked_words
  before insert or update of name, prizes on public.games
  for each row
  execute function public.guard_games_blocked_words();

create or replace function public.guard_name_blocked_words()
returns trigger
language plpgsql
set search_path = ''
as $$
  begin
    -- courses and tee_boxes share the cap of 120.
    if (tg_op = 'INSERT' or new.name is distinct from old.name)
       and char_length(new.name) > 120 then
      raise exception 'text_too_long'
        using errcode = 'P0001', detail = tg_table_name || '.name';
    end if;
    if (tg_op = 'INSERT' or new.name is distinct from old.name)
       and public.contains_blocked_word(new.name) then
      raise exception 'blocked_word'
        using errcode = 'P0001', detail = tg_table_name || '.name';
    end if;
    return new;
  end;
$$;

create trigger guard_courses_blocked_words
  before insert or update of name on public.courses
  for each row
  execute function public.guard_name_blocked_words();

create trigger guard_tee_boxes_blocked_words
  before insert or update of name on public.tee_boxes
  for each row
  execute function public.guard_name_blocked_words();

create or replace function public.guard_tournaments_blocked_words()
returns trigger
language plpgsql
set search_path = ''
as $$
  begin
    if (tg_op = 'INSERT' or new.name is distinct from old.name)
       and public.contains_blocked_word(new.name) then
      raise exception 'blocked_word' using errcode = 'P0001', detail = 'tournaments.name';
    end if;
    if (tg_op = 'INSERT' or new.team_1_name is distinct from old.team_1_name)
       and public.contains_blocked_word(new.team_1_name) then
      raise exception 'blocked_word' using errcode = 'P0001', detail = 'tournaments.team_1_name';
    end if;
    if (tg_op = 'INSERT' or new.team_2_name is distinct from old.team_2_name)
       and public.contains_blocked_word(new.team_2_name) then
      raise exception 'blocked_word' using errcode = 'P0001', detail = 'tournaments.team_2_name';
    end if;
    return new;
  end;
$$;

create trigger guard_tournaments_blocked_words
  before insert or update of name, team_1_name, team_2_name on public.tournaments
  for each row
  execute function public.guard_tournaments_blocked_words();

create or replace function public.guard_registration_blocked_words()
returns trigger
language plpgsql
set search_path = ''
as $$
  begin
    if (tg_op = 'INSERT' or new.team_name is distinct from old.team_name)
       and public.contains_blocked_word(new.team_name) then
      raise exception 'blocked_word'
        using errcode = 'P0001', detail = 'game_registration_requests.team_name';
    end if;
    return new;
  end;
$$;

create trigger guard_registration_blocked_words
  before insert or update of team_name on public.game_registration_requests
  for each row
  execute function public.guard_registration_blocked_words();

revoke execute on function public.guard_users_blocked_words() from public, anon, authenticated;
revoke execute on function public.guard_games_blocked_words() from public, anon, authenticated;
revoke execute on function public.guard_name_blocked_words() from public, anon, authenticated;
revoke execute on function public.guard_tournaments_blocked_words() from public, anon, authenticated;
revoke execute on function public.guard_registration_blocked_words() from public, anon, authenticated;

-- ── 7. Account deletion ────────────────────────────────────────────────────

-- 0253's function, with the three new tables at the end of the personal rows.
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
    -- #3019 (0259): blocks both ways, the accepted terms, and the reports the
    -- account sent or that were about it. A report an admin handled keeps its
    -- row when the admin is deleted, without the pointer.
    delete from public.user_blocks where blocker_id = p_user_id;
    delete from public.user_blocks where blocked_id = p_user_id;
    delete from public.terms_acceptances where user_id = p_user_id;
    delete from public.content_reports where reporter_id = p_user_id;
    delete from public.content_reports where target_user_id = p_user_id;
    update public.content_reports set handled_by = null where handled_by = p_user_id;

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
