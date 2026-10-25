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
 */
import { roundPlayerLocks, type RoundFlight } from './roundLocks';

export type LeagueRoundNoticeKind = 'league_round_open' | 'league_round_closing';

/** «Under 48 timer igjen»: the reminder goes once less than this is left. */
export const CLOSING_REMINDER_LEAD_MS = 48 * 60 * 60 * 1000;

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
 */
export function dueNotices(round: NoticeRound, now: number): LeagueRoundNoticeKind[] {
  const opensAt = Date.parse(round.opens_at);
  const closesAt = Date.parse(round.closes_at);
  if (!(opensAt <= now && now < closesAt)) return [];
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
