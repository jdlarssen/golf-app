/**
 * The league round's two messages (#2638 Del 3, the owner's answer
 * 2026-10-25: «48 t før + når runden åpner»): when each is due, and who gets
 * it. Pure; the hourly sweep (`lib/notifications/leagueRoundNotices.ts`)
 * reads the rows and sends.
 *
 * ONE RULE, THREE PLACES (AGENTS.md trap 4). `dueNotices` is the rule. The
 * sweep route's candidate query (app/api/cron/league-round-reminder) and the
 * cron gate in 0218 select the rounds it can say yes to, with the same
 * predicates:
 *   leagues.status = 'active'                       a draft has not started,
 *                                                   a finished league is done
 *   opens_at <= now < closes_at                     the round is open
 *   opening_notice_sent_at is null                  → league_round_open
 *   closing_reminder_sent_at is null
 *     and closes_at < now + CLOSING_REMINDER_LEAD_MS → league_round_closing
 * Change one, change all three in the same commit.
 *
 * The night hold (#2974) lives here only. The query and the gate do not know
 * the clock: they keep selecting a round that waits for the morning, the sweep
 * finds nothing due and stamps nothing, and the round is still a candidate on
 * the first run after 07:00. They are supersets on purpose.
 */
import { osloParts } from '../format/teeOff';
import { QUIET_HOURS, isQuietHour } from '../notifications/pushPreferences';
import { roundPlayerLocks, type RoundFlight } from './roundLocks';

export type LeagueRoundNoticeKind = 'league_round_open' | 'league_round_closing';

/** «Under 48 timer igjen»: the reminder goes once less than this is left. */
export const CLOSING_REMINDER_LEAD_MS = 48 * 60 * 60 * 1000;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * How long after the night the first run can be: the sweep is hourly (0218).
 * A round that closes inside this margin is not held, or the morning run
 * would find it closed and the message would never go.
 */
const SWEEP_INTERVAL_MS = HOUR_MS;

/**
 * When the quiet hours that `now` is in are over: the next 07:00 on the Oslo
 * clock. Only meaningful when `now` is a quiet hour. The clocks change at
 * night (the last Sunday of March and of October), so the plain sum is checked
 * against the wall clock and moved the hour it is off.
 */
function quietHoursEndAt(now: number): number {
  const { hour, minute } = osloParts(new Date(now));
  const hoursLeft = hour >= QUIET_HOURS.start ? 24 - hour + QUIET_HOURS.end : QUIET_HOURS.end - hour;
  const end = now - (now % MINUTE_MS) - minute * MINUTE_MS + hoursLeft * HOUR_MS;
  return end + (QUIET_HOURS.end - osloParts(new Date(end)).hour) * HOUR_MS;
}

export type NoticeRound = {
  opens_at: string;
  closes_at: string;
  opening_notice_sent_at: string | null;
  closing_reminder_sent_at: string | null;
};

/**
 * The messages a round of an active league is due for at `now`, the opening
 * message first. Both can be due in the same run: a round shorter than two
 * days, or one that was already open when the sweep first saw it. A round
 * that has not opened gets nothing, also when it closes within 48 hours.
 * Compared as instants: PostgREST writes offsets and fractional seconds.
 *
 * Nothing is due in quiet hours (#2974, 22:00–07:00 in Oslo, the hours of the
 * push choices): rounds open at 00:00 and close at 23:59, so both messages
 * used to arrive at 00:41. What falls due at night goes on the first run
 * after 07:00. A round that closes before that run can reach it is not held:
 * a late message is better than none.
 */
export function dueNotices(round: NoticeRound, now: number): LeagueRoundNoticeKind[] {
  const opensAt = Date.parse(round.opens_at);
  const closesAt = Date.parse(round.closes_at);
  if (!(opensAt <= now && now < closesAt)) return [];
  if (isQuietHour(new Date(now)) && closesAt > quietHoursEndAt(now) + SWEEP_INTERVAL_MS) return [];
  const due: LeagueRoundNoticeKind[] = [];
  if (round.opening_notice_sent_at == null) due.push('league_round_open');
  if (round.closing_reminder_sent_at == null && closesAt - now < CLOSING_REMINDER_LEAD_MS) {
    due.push('league_round_closing');
  }
  return due;
}

/**
 * The league's players who have not played the round: neither delivered nor
 * in a flight still in play, by the same locks as the start gate
 * (`roundPlayerLocks`). A player who withdrew from a flight is not locked, so
 * they are told. Once each, in the league's order.
 */
export function noticeRecipients(participantIds: string[], flights: RoundFlight[]): string[] {
  const { delivered, inProgress } = roundPlayerLocks(flights);
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const id of participantIds) {
    if (seen.has(id) || delivered.has(id) || inProgress.has(id)) continue;
    seen.add(id);
    recipients.push(id);
  }
  return recipients;
}
