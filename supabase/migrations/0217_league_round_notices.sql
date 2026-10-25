-- 0217_league_round_notices.sql
-- =============================================================================
-- #2638 Del 3 - the league round tells its players when it opens, and again
-- 48 hours before it closes if they have not played it yet (the owner's
-- answer 2026-10-25: «48 t før + når runden åpner»).
--
-- Additive: the old code never reads the new columns or writes the new
-- kinds, so this migration goes on BEFORE the code deploys. Without it the
-- sweep's claim fails on the unknown column and the CHECK refuses the
-- inserts (notify only logs it), so nobody hears anything. The cron job that
-- calls the sweep is 0218, which goes on AFTER the deploy.
--
-- 1. Two claim stamps on league_rounds, one per message, the same «win the
--    row» pattern as games.organizer_stale_reminder_sent_at (0204): the sweep
--    sets the stamp with `... where <stamp> is null` and sends only when that
--    update won the row, so each message goes once per round, also when two
--    runs meet. Nullable, no default.
--      opening_notice_sent_at     «Runde 3 i Vinterligaen er åpen»
--      closing_reminder_sent_at   «Runde 3 i Vinterligaen stenger …»
--    The sweep lives in lib/notifications/leagueRoundNotices.ts, the rules in
--    lib/league/roundNotices.ts.
--
-- 2. One trigger, two jobs (league_rounds_notice_stamps):
--    - Only the server writes the stamps (auth.uid() is null: the sweep's
--      service role, a migration). An organiser who can update the round
--      cannot clear a stamp to send the message again, or set one to keep it
--      from going. Same rule as sim_frozen_default (0214).
--    - A changed closes_at clears closing_reminder_sent_at, so a window the
--      organiser extends (overrideRoundWindow, updateLeagueRound, or any other
--      write) gets a new reminder before its new deadline. The reminder names
--      the deadline, so a shortened window gets one too. The opening stamp is
--      never cleared (the contract: the round opened once).
--    The check runs before the reset, so the trigger's own write is allowed.
--
-- 3. Two new kinds in the kind CHECK, same drop/re-add as 0203 and 0204.
--    Payload shape (league_id, league_name, round_id, round_label, closes_at)
--    is validated in lib/notifications/types.ts, and
--    lib/notifications/kindCheckParity.test.ts holds the list equal to the TS
--    union.
--
-- 4. Backfill: a round that is already open (or closed) when this goes on and
--    has under 48 hours left does not get the opening message after the fact.
--    Only the reminder before the deadline comes then (the contract's
--    addendum). Draft leagues are left alone: their first round's message
--    goes when the organiser starts the league.
-- =============================================================================

alter table public.league_rounds
  add column opening_notice_sent_at timestamptz,
  add column closing_reminder_sent_at timestamptz;

comment on column public.league_rounds.opening_notice_sent_at is
  '#2638: when the sweep sent «the round is open» (league_round_open) to the players. Set once by the server, never cleared.';
comment on column public.league_rounds.closing_reminder_sent_at is
  '#2638: when the sweep sent the reminder 48 hours before closes_at (league_round_closing). Set by the server; cleared when closes_at changes (league_rounds_notice_stamps).';

create or replace function public.league_rounds_notice_stamps()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
  begin
    if auth.uid() is not null then
      if tg_op = 'INSERT' then
        if new.opening_notice_sent_at is not null or new.closing_reminder_sent_at is not null then
          raise exception
            'league_rounds notice stamps are set by the server only'
            using errcode = 'insufficient_privilege';
        end if;
      elsif new.opening_notice_sent_at is distinct from old.opening_notice_sent_at
         or new.closing_reminder_sent_at is distinct from old.closing_reminder_sent_at then
        raise exception
          'league_rounds notice stamps are set by the server only'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    if tg_op = 'UPDATE' and new.closes_at is distinct from old.closes_at then
      new.closing_reminder_sent_at := null;
    end if;

    return new;
  end;
  $$;

comment on function public.league_rounds_notice_stamps() is
  '#2638: BEFORE INSERT/UPDATE on league_rounds. Only the server (auth.uid() IS NULL) writes opening_notice_sent_at and closing_reminder_sent_at; a changed closes_at clears closing_reminder_sent_at so the new deadline gets its own reminder.';

revoke execute on function public.league_rounds_notice_stamps() from public, anon, authenticated;

create trigger league_rounds_notice_stamps
  before insert or update on public.league_rounds
  for each row execute function public.league_rounds_notice_stamps();

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'scorecard_rejected',
    'scorecard_reopened',
    'game_finished',
    'game_reopened',
    'product_update',
    'team_invite',
    'registration_request',
    'registration_approved',
    'registration_rejected',
    'registration_expired',
    'team_member_withdrew',
    'deliver_reminder',
    'cup_finished',
    'cup_started',
    'club_join_request',
    'club_role_changed',
    'friend_request',
    'friend_accepted',
    'player_added',
    'game_started',
    'auto_start_blocked',
    'achievement_unlocked',
    'idea_built',
    'payment_reminder',
    'cup_signup',
    'cup_lineup_revealed',
    'missing_score_reminder',
    'all_scorecards_delivered',
    'game_stale_reminder',
    'league_round_open',
    'league_round_closing'
  ));

update public.league_rounds r
   set opening_notice_sent_at = now()
  from public.leagues l
 where l.id = r.league_id
   and l.status <> 'draft'
   and r.opening_notice_sent_at is null
   and r.opens_at <= now()
   and r.closes_at < now() + interval '48 hours';
