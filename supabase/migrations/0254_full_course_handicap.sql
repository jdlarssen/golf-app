-- 0254: game_players.full_course_handicap — the full course handicap (100 %)
-- the start freezes next to the playing handicap.
--
-- Owner-ordered audit 20.11 (finding F1 in docs/regelbok-gjennomgang.md).
-- course_handicap holds the playing handicap: the course handicap after the
-- game's share and a league flight's cap. The WHS score differential's net
-- double bogey needs the full number (NGF 3.1b, s. 31: «Spillerens fulle
-- spillehandicap (100 %) skal brukes for alle netto dobbel bogey
-- justeringer»; 7.2a, s. 65, for a capped competition). It was stored
-- nowhere, and users.hcp_index may have changed since the round, so it is
-- frozen here at the same two places that freeze course_handicap:
-- startScheduledGameCore (the start) and recomputeCourseHandicapForUser (a
-- late profile completion, service role).
--
-- Who writes it: the start runs with the service role, or, for a league
-- flight, with the signed-in player's own client while the round is still
-- scheduled (startLeagueRoundFlightCore). So the guard below lets a signed-in
-- non-admin change the column only while the round is scheduled, the moment
-- the start freezes it, and never on a new row. After the start it is fixed
-- like the other system columns. A value a player puts on a scheduled round is
-- overwritten by the start, which freezes every roster row.
--
-- Additive: a nullable column, no default, no backfill here. Old rows stay
-- null until scripts/backfillFullCourseHandicap.ts fills them; the code reads
-- null as «unknown» and freezes no differential from it.
--
-- App builds from before #2215 start rounds with their bundled code and leave
-- the column null: those rounds get no differential until the backfill script
-- runs again (it is safe to re-run at any time).
--
-- Order against prod: BEFORE the app code that reads and writes the column.
-- The new start writes it and the history pages select it, so code running
-- without the column would fail the start.
--
-- guard_game_players_system_columns is 0251's body (the live body in staging
-- has the same statements, comments stripped) plus the two
-- full_course_handicap checks. create or replace keeps the trigger and the
-- revoked execute grant.

alter table public.game_players
  add column if not exists full_course_handicap integer;

comment on column public.game_players.full_course_handicap is
  'Audit 20.11 (F1): the full course handicap (100 %, before the game share '
  'and cap), frozen at start next to course_handicap. Used for the score '
  'differential''s net double bogey (WHS 3.1b). Null = not frozen (rows from '
  'before 0254 until the backfill).';

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
         or new.full_course_handicap is not null then
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
  'payment or full_course_handicap columns). UPDATE on any row: result_summary, '
  'signup_source and deliver_reminder_sent_at are system-written; '
  'full_course_handicap changes only while the round is scheduled (0254). '
  'UPDATE on the own row: no tee_gender change after the start, no rejection '
  'reason written, accepted_at never cleared. Works next to '
  'guard_game_players_self_update (0191) and '
  'guard_game_players_score_differential (0117); it does not replace them.';

revoke execute on function public.guard_game_players_system_columns() from public, anon, authenticated;
