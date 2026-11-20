-- 0251: rules for rounds, a player's own rows and guest players move into the
-- database, and the rate-limit table is cleaned.
--
-- Owner-ordered audit 20.11. The rules below are the ones the web's server
-- actions and the app already follow; this file makes Postgres hold them too
-- (AGENTS.md trap 3). Nothing here changes what a screen offers.
--
--   games
--     - a creator deletes their own round only before it starts (draft or
--       scheduled); a round in progress or finished is deleted by an admin
--       (the rule of app/[locale]/admin/games/[id]/slett/actions.ts, #428)
--     - for a signed-in non-admin the status only moves forward (draft,
--       scheduled, active, finished). Reopening a finished round is an admin
--       action (reopenGame), and without this a started round could be set
--       back to scheduled and then deleted
--
--   game_players
--     - a creator removes a roster row only before the round starts; after
--       that a player is withdrawn, not deleted (the rule of
--       games/[id]/spillere/actions.ts and the app's removePlayerFromGame,
--       #386: a deleted row takes the player's scores with it)
--     - the columns the system writes are not written by a signed-in
--       non-admin, on any row: result_summary, signup_source and
--       deliver_reminder_sent_at (score_differential has had this rule since
--       0117, for updates)
--     - a row a signed-in non-admin inserts is a plain roster row: no result,
--       no handicap result, not delivered, not withdrawn, not paid
--     - on their own row a player does not change tee_gender after the start
--       (the twin of course_handicap, 0103), does not write a rejection
--       reason (clearing it on re-delivery stays), and does not take back or
--       re-stamp accepted_at
--
--   scores
--     - a new row never carries a client_updated_at more than 5 minutes ahead
--       of the server clock; such a stamp is stored as the server's now().
--       The update guard (0109) refuses the same thing; an insert has no
--       earlier value to protect, so the stroke is kept and only the stamp is
--       corrected. A phone that was offline sends stamps in the past, which
--       pass untouched
--
--   green_pins
--     - a pin comes from a player in a round in progress on that course
--     - one pin per player, hole and window (the 30 days of the gate)
--
--   idea_submissions
--     - a new idea is not built yet: status and built_at are set by an admin
--
--   guests (users.is_guest)
--     - users.guest_created_by records who made a guest
--     - a signed-in non-admin puts a guest on a roster only when they made the
--       guest, or the guest is already on the roster of a round they created
--       (so «Gjenta hver uke» and reuse in one's own rounds keep working)
--
--   admin_action_rate_limit
--     - rows whose window ended more than 2 days ago are deleted nightly

-- ── 1. games: delete and status ──────────────────────────────────────────────

drop policy if exists "games creator delete" on public.games;
create policy "games creator delete" on public.games for delete to authenticated
  using (
    created_by = (select auth.uid())
    and status in ('draft'::public.game_status, 'scheduled'::public.game_status)
  );

comment on policy "games creator delete" on public.games is
  '#428 + audit 20.11: a creator deletes their own round only before it starts. '
  'A round in progress or finished is deleted by an admin ("games admin delete").';

create or replace function public.guard_games_status_transition()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  begin
    -- The service role (cron start, finish pipeline, derived cup games) and
    -- admins (reopenGame) move the status freely.
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;

    -- Forward only. A step may be skipped: finishing a cup host takes its
    -- derived games along with the player's own session, also one whose own
    -- start did not land (finishDerivedGames).
    if array_position(array['draft', 'scheduled', 'active', 'finished'], new.status::text)
       < array_position(array['draft', 'scheduled', 'active', 'finished'], old.status::text) then
      raise exception
        'A round does not move back for a player (games.status % → %)',
        old.status, new.status
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    end if;

    return new;
  end;
$$;

comment on function public.guard_games_status_transition() is
  'Audit 20.11: BEFORE UPDATE OF status on games. A signed-in non-admin never '
  'moves a round back (publish, start and finish stay). Reopening belongs to '
  'admins and the service role.';

revoke execute on function public.guard_games_status_transition() from public, anon, authenticated;

drop trigger if exists guard_games_status_transition on public.games;
create trigger guard_games_status_transition
  before update of status on public.games
  for each row execute function public.guard_games_status_transition();

-- ── 2. game_players: roster delete, system columns, own row ──────────────────

-- 0178's policy plus the status. Cup matches stay excluded as before.
drop policy if exists "game_players creator delete" on public.game_players;
create policy "game_players creator delete" on public.game_players for delete to authenticated
  using (
    exists (
      select 1
        from public.games g
       where g.id = game_players.game_id
         and g.created_by = (select auth.uid())
         and g.tournament_id is null
         and g.status in ('draft'::public.game_status, 'scheduled'::public.game_status)
    )
  );

comment on policy "game_players creator delete" on public.game_players is
  '#1937 + audit 20.11: the creator removes a roster row only before the round '
  'starts, and never on a cup match. After the start a player is withdrawn.';

create or replace function public.guard_game_players_system_columns()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  declare
    v_uid uuid := auth.uid();
    v_status public.game_status;
  begin
    -- The service role writes every column below (finish pipeline, sign-up,
    -- reminders); admins have full access per RLS.
    if v_uid is null or public.is_admin() then
      return new;
    end if;

    if tg_op = 'INSERT' then
      -- A new roster row from a signed-in client is a plain seat. Every path
      -- that inserts one (create, edit, add player, cup and league rows)
      -- leaves these columns empty.
      if new.score_differential is not null
         or new.result_summary is not null
         or new.submitted_at is not null
         or new.withdrawn_at is not null
         or new.withdrawn_by_user_id is not null
         or new.paid_at is not null
         or new.deliver_reminder_sent_at is not null
         or new.signup_source is not null
         or new.rejection_reason is not null then
        raise exception
          'A new roster row carries no result, delivery, withdrawal or payment (game_players insert)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;
      return new;
    end if;

    -- ── UPDATE, any row ────────────────────────────────────────────────────
    if new.result_summary is distinct from old.result_summary then
      raise exception
        'result_summary is written by the system when the round is finished (game_players.result_summary)'
        using errcode = 'insufficient_privilege';
    end if;
    if new.signup_source is distinct from old.signup_source then
      raise exception
        'signup_source is written by the system at sign-up (game_players.signup_source)'
        using errcode = 'insufficient_privilege';
    end if;
    if new.deliver_reminder_sent_at is distinct from old.deliver_reminder_sent_at then
      raise exception
        'deliver_reminder_sent_at is written by the system when a reminder is sent (game_players.deliver_reminder_sent_at)'
        using errcode = 'insufficient_privilege';
    end if;

    -- ── UPDATE, the caller's own row ───────────────────────────────────────
    if new.user_id = v_uid then
      -- The tee class decides par and rating: fixed once the round has
      -- started, like course_handicap (0103).
      if new.tee_gender is distinct from old.tee_gender then
        select g.status into v_status
          from public.games g
         where g.id = old.game_id;
        if v_status in ('active', 'finished') then
          raise exception
            'A player cannot change their own tee_gender after the game has started (game_players.tee_gender)'
            using errcode = 'insufficient_privilege';
        end if;
      end if;

      -- The reason is written by whoever sends the card back. The player's
      -- own re-delivery clears it.
      if new.rejection_reason is distinct from old.rejection_reason
         and new.rejection_reason is not null then
        raise exception
          'A player cannot write a rejection reason on their own scorecard (game_players.rejection_reason)'
          using errcode = 'insufficient_privilege';
      end if;

      -- Confirmed once. Taking it back or re-stamping it is not a player move.
      if new.accepted_at is distinct from old.accepted_at
         and old.accepted_at is not null then
        raise exception
          'A player cannot take back or change their own accepted_at (game_players.accepted_at)'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    return new;
  end;
$$;

comment on function public.guard_game_players_system_columns() is
  'Audit 20.11: BEFORE INSERT OR UPDATE on game_players, for a signed-in '
  'non-admin. INSERT: the row is a plain seat (no result, delivery, withdrawal '
  'or payment columns). UPDATE on any row: result_summary, signup_source and '
  'deliver_reminder_sent_at are system-written. UPDATE on the own row: no '
  'tee_gender change after the start, no rejection reason written, accepted_at '
  'set once. Works next to guard_game_players_self_update (0191) and '
  'guard_game_players_score_differential (0117); it does not replace them.';

revoke execute on function public.guard_game_players_system_columns() from public, anon, authenticated;

drop trigger if exists guard_game_players_system_columns on public.game_players;
create trigger guard_game_players_system_columns
  before insert or update on public.game_players
  for each row execute function public.guard_game_players_system_columns();

-- ── 3. scores: a new row is not stamped in the future ────────────────────────

create or replace function public.guard_scores_insert_timestamp()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  declare
    -- The same tolerance as guard_scores_self_update (0109).
    v_clock_skew_tolerance interval := interval '5 minutes';
  begin
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;

    -- client_updated_at is the last-write-wins key (upsert_score_if_newer). A
    -- stamp far ahead would win over every later real entry for the hole. The
    -- stroke itself is kept: a phone whose clock runs fast still gets its
    -- first entry saved, with the server's time as the key.
    if new.client_updated_at > now() + v_clock_skew_tolerance then
      new.client_updated_at := now();
    end if;

    return new;
  end;
$$;

comment on function public.guard_scores_insert_timestamp() is
  'Audit 20.11: BEFORE INSERT on scores. For a signed-in non-admin a '
  'client_updated_at more than 5 minutes ahead of the server clock is stored '
  'as now(). The insert twin of guard_scores_self_update (0109), which refuses '
  'the same stamp on an update.';

revoke execute on function public.guard_scores_insert_timestamp() from public, anon, authenticated;

drop trigger if exists guard_scores_insert_timestamp on public.scores;
create trigger guard_scores_insert_timestamp
  before insert on public.scores
  for each row execute function public.guard_scores_insert_timestamp();

-- ── 4. green_pins: who may pin, and how often ────────────────────────────────
-- The body of 0142 with two checks in front of the existing gate. The trigger
-- itself is unchanged.

create or replace function public.green_pins_gate()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  declare
    -- Mirrors lib/geo/pinRules.ts (parity test: lib/geo/pinRules.test.ts).
    pin_gate_max_pins constant int := 3;
    pin_gate_window_days constant int := 30;
    fresh_count int;
    v_uid uuid := auth.uid();
  begin
    -- A signed-in client (the service role has no auth.uid()):
    if v_uid is not null then
      -- (a) one pin per player and hole inside the window. unique_violation,
      -- so saveGreenPin can tell «you already gave this one» from a failure.
      if exists (
        select 1 from public.green_pins p
         where p.course_id = new.course_id
           and p.hole_number = new.hole_number
           and p.user_id = v_uid
           and p.created_at > now() - make_interval(days => pin_gate_window_days)
      ) then
        raise exception
          'green_pins_gate: already_pinned (course % hole %)',
          new.course_id, new.hole_number
          using errcode = 'unique_violation';
      end if;

      -- (b) the pin comes from the course: the player is in a round in
      -- progress there. The chip is only shown in such a round.
      if not exists (
        select 1
          from public.game_players gp
          join public.games g on g.id = gp.game_id
         where gp.user_id = v_uid
           and gp.withdrawn_at is null
           and g.course_id = new.course_id
           and g.status = 'active'
      ) then
        raise exception
          'green_pins_gate: not playing a round in progress on course %',
          new.course_id
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    select count(*) into fresh_count
      from public.green_pins
      where course_id = new.course_id
        and hole_number = new.hole_number
        and created_at > now() - make_interval(days => pin_gate_window_days);
    if fresh_count >= pin_gate_max_pins then
      raise exception
        'green_pins_gate: course % hole % already has % pins in the last % days',
        new.course_id, new.hole_number, fresh_count, pin_gate_window_days
        using errcode = 'check_violation';
    end if;
    return new;
  end;
$$;

revoke all on function public.green_pins_gate() from public;
revoke execute on function public.green_pins_gate() from anon, authenticated;

-- ── 5. idea_submissions: a new idea is not built ─────────────────────────────

drop policy if exists idea_submissions_insert_own on public.idea_submissions;
create policy idea_submissions_insert_own on public.idea_submissions for insert
  with check (
    user_id = (select auth.uid())
    and status is null
    and built_at is null
  );

-- ── 6. guests: who may put a guest on a roster ───────────────────────────────

alter table public.users
  add column if not exists guest_created_by uuid references public.users(id) on delete set null;

comment on column public.users.guest_created_by is
  'Audit 20.11: the user who made this guest (createGuestUser). Read and '
  'written by the service role only; no client has SELECT on it (0186).';

create index if not exists users_guest_created_by_idx
  on public.users (guest_created_by)
  where guest_created_by is not null;

-- Guests made before this column: the player who brought them (0230), else
-- the creator of the first round they were in. A guest in no round stays
-- without one and is usable by admins only.
update public.users u
   set guest_created_by = coalesce(
         (select r.brought_by_user_id
            from public.game_registration_requests r
           where r.user_id = u.id and r.brought_by_user_id is not null
           order by r.created_at
           limit 1),
         (select g.created_by
            from public.game_players gp
            join public.games g on g.id = gp.game_id
           where gp.user_id = u.id and g.created_by is not null
           order by g.created_at
           limit 1)
       )
 where u.is_guest
   and u.guest_created_by is null;

-- May p_actor put the guest p_guest on a roster? The one home of the rule: the
-- insert guard below and the server (usable_guest_ids) both ask here.
create or replace function public.guest_usable_by(p_actor uuid, p_guest uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
      select 1 from public.users u
       where u.id = p_guest
         and u.is_guest
         and u.guest_created_by = p_actor
    )
    or exists (
      select 1
        from public.game_players gp
        join public.games g on g.id = gp.game_id
       where gp.user_id = p_guest
         and g.created_by = p_actor
    );
$$;

revoke all on function public.guest_usable_by(uuid, uuid) from public, anon, authenticated;
grant execute on function public.guest_usable_by(uuid, uuid) to service_role;

-- The guests among p_ids that p_actor may NOT put on a roster. For the server
-- paths that write guest rows with the service role (create, edit, invite).
create or replace function public.foreign_guest_ids(p_actor uuid, p_ids uuid[])
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select u.id
    from public.users u
   where u.id = any(p_ids)
     and u.is_guest
     and not public.guest_usable_by(p_actor, u.id);
$$;

revoke all on function public.foreign_guest_ids(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.foreign_guest_ids(uuid, uuid[]) to service_role;

create or replace function public.guard_game_players_guest_owner()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  declare
    v_uid uuid := auth.uid();
  begin
    if v_uid is null or public.is_admin() then
      return new;
    end if;

    if exists (select 1 from public.users u where u.id = new.user_id and u.is_guest)
       and not public.guest_usable_by(v_uid, new.user_id) then
      raise exception
        'Guest % was added by another organiser and cannot be put on this roster',
        new.user_id
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    end if;

    return new;
  end;
$$;

comment on function public.guard_game_players_guest_owner() is
  'Audit 20.11: BEFORE INSERT on game_players. A signed-in non-admin puts a '
  'guest on a roster only when guest_usable_by() says so. Runs next to '
  'guard_game_players_invite_eligibility (0208), where sharing a round with a '
  'guest is enough.';

revoke execute on function public.guard_game_players_guest_owner() from public, anon, authenticated;

drop trigger if exists guard_game_players_guest_owner on public.game_players;
create trigger guard_game_players_guest_owner
  before insert on public.game_players
  for each row execute function public.guard_game_players_guest_owner();

-- ── 7. admin_action_rate_limit: old rows go ──────────────────────────────────
-- A bucket is a key like an e-mail address or an IP address with a counter.
-- Once its window has ended the row means the same as no row
-- (consume_admin_rate_limit starts the count over), so it is deleted. The
-- longest window in use is 24 hours (lib/auth/registrationRateLimit.ts).

create or replace function public.purge_admin_action_rate_limit()
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
  declare
    v_deleted integer;
  begin
    delete from public.admin_action_rate_limit
     where window_start < now() - interval '2 days';
    get diagnostics v_deleted = row_count;
    return v_deleted;
  end;
$$;

comment on function public.purge_admin_action_rate_limit() is
  'Audit 20.11: deletes rate-limit buckets whose window started more than 2 '
  'days ago (the longest window is 24 hours). Run nightly by pg_cron.';

revoke all on function public.purge_admin_action_rate_limit() from public, anon, authenticated;
grant execute on function public.purge_admin_action_rate_limit() to service_role;

-- Plain SQL, no HTTP call and no secret, so it runs wherever pg_cron is
-- installed (the local test stack has none).
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-rate-limit-buckets',
      '23 3 * * *',
      $job$select public.purge_admin_action_rate_limit()$job$
    );
  end if;
end
$do$;
