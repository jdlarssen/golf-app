-- 0258: game_players.raw_course_handicap — the unrounded course handicap the
-- start freezes next to course_handicap and full_course_handicap — and four-ball
-- cups start on 90 %.
--
-- Owner-ordered rule-book review (#2927 rounds 2 and 3, fixed in #2997):
--   F16/F25: the formats with their own percentage in mode_config (four-ball,
--     Round Robin, the foursomes family, the scramble family, patsome) take the
--     percentage of the UNROUNDED course handicap and round once (NGF 6.2a,
--     interpretation 6.2a/1, s. 55). The start rounded the number before the
--     engines saw it, so they rounded twice. The engines read this column and
--     fall back to course_handicap when it is null.
--   F18: four-ball match play starts on 90 % (NGF appendix C, s. 75). The
--     owner, 24.11: «Ja, også cupen».
--
-- Invariant (column comment, locked by startScheduledGame.test.ts and
-- recomputeCourseHandicap.test.ts): full_course_handicap =
-- round(raw_course_handicap) when both are set.
--
-- double precision, not numeric: the start computes a JavaScript number, and
-- float8 comes back through PostgREST as the same number (numeric would come
-- back as a string).
--
-- Who writes it: the same two places that freeze course_handicap —
-- startScheduledGameCore (the start; service role, or a league flight's own
-- client while the round is scheduled) and recomputeCourseHandicapForUser (a
-- late profile completion, service role). The guard below gives the column the
-- same two checks as full_course_handicap (0254): never on a new row from a
-- signed-in non-admin, and changed only while the round is scheduled.
--
-- Additive: a nullable column, no default, no backfill. Null = not frozen:
-- rows from before 0258, and rows started by app builds from before #2215. The
-- engines read null as «use the integer», so a round started before keeps its
-- numbers (owner, 24.11: «Ja, ingen omregning»).
--
-- tournaments.fourball_allowance_pct gets default 90. Every cup row has a value
-- (the column is not null), so existing cups keep theirs.
--
-- Order against prod: BEFORE the app code. The new start writes the column
-- with expectOne and the game pages select it, so code running without the
-- column fails every start. The column is harmless to the old code.
--
-- guard_game_players_system_columns is 0254's body (the live body in staging
-- has the same statements, comments stripped, read 26.11) plus the two
-- raw_course_handicap checks. create or replace keeps the trigger and the
-- revoked execute grant.

alter table public.game_players
  add column if not exists raw_course_handicap double precision;

comment on column public.game_players.raw_course_handicap is
  'Rule-book review F16/F25 (#2997): the unrounded course handicap (100 %, '
  'before the game share and cap), frozen at start next to course_handicap '
  'and full_course_handicap = round(raw_course_handicap). The formats with '
  'their own percentage in mode_config take the percentage of this number and '
  'round once (WHS 6.2a/1). Null = not frozen (rows from before 0258); the '
  'engines then use course_handicap.';

alter table public.tournaments
  alter column fourball_allowance_pct set default 90;

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
    -- reminders, the start); admins have full access per RLS.
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
         or new.rejection_reason is not null
         or new.full_course_handicap is not null
         or new.raw_course_handicap is not null then
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
    -- 0254: frozen by the start. A league flight starts with the player's own
    -- client while the round is scheduled; after that only the system writes.
    if new.full_course_handicap is distinct from old.full_course_handicap then
      select g.status into v_status
        from public.games g
       where g.id = old.game_id;
      if v_status is distinct from 'scheduled'::public.game_status then
        raise exception
          'full_course_handicap is frozen by the system when the round starts (game_players.full_course_handicap)'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
    -- 0258: frozen by the start next to full_course_handicap, same rule.
    if new.raw_course_handicap is distinct from old.raw_course_handicap then
      select g.status into v_status
        from public.games g
       where g.id = old.game_id;
      if v_status is distinct from 'scheduled'::public.game_status then
        raise exception
          'raw_course_handicap is frozen by the system when the round starts (game_players.raw_course_handicap)'
          using errcode = 'insufficient_privilege';
      end if;
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

      -- A confirmation is not taken back. Writing it again is fine: the
      -- app's publish retry upserts the organiser's own confirmed row with a
      -- fresh stamp (replacePlayers, #1954).
      if new.accepted_at is null
         and old.accepted_at is not null then
        raise exception
          'A player cannot take back their own accepted_at (game_players.accepted_at)'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    return new;
  end;
$$;

comment on function public.guard_game_players_system_columns() is
  'Audit 20.11: BEFORE INSERT OR UPDATE on game_players, for a signed-in '
  'non-admin. INSERT: the row is a plain seat (no result, delivery, withdrawal, '
  'payment, full_course_handicap or raw_course_handicap columns). UPDATE on '
  'any row: result_summary, signup_source and deliver_reminder_sent_at are '
  'system-written; full_course_handicap (0254) and raw_course_handicap (0258) '
  'change only while the round is scheduled. UPDATE on the own row: no '
  'tee_gender change after the start, no rejection reason written, '
  'accepted_at never cleared. Works next to guard_game_players_self_update '
  '(0191) and guard_game_players_score_differential (0117); it does not '
  'replace them.';

revoke execute on function public.guard_game_players_system_columns() from public, anon, authenticated;
