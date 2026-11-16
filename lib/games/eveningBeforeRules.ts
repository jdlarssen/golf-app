import { osloParts } from '@/lib/format/teeOff';
import { parseOsloDateTimeLocal } from './gamePayload';
import { organizerNoticesApply } from './organizerNoticeRules';

// The evening before a scheduled round (#2483): the organiser hears how many
// have confirmed and who has not answered, once per round. Pure rules; the
// sweep is `app/api/cron/evening-before/route.ts` and the sending
// `lib/notifications/eveningStatusNotice.ts`.
//
// Days are Oslo calendar days, compared as «YYYY-MM-DD» keys, never as
// midnights: the day the clocks change is 23 or 25 hours long, so «now + 24
// hours» is not «tomorrow».

/** The varsel is due from this hour, Oslo time (the owner's answer 2026-11-16: «Kl. 18»). */
export const EVENING_NOTICE_HOUR = 18;

/** Names the varsel carries; the rest is a count («og 2 til»). */
export const UNANSWERED_NAMES_MAX = 3;

/** The game fields the rule reads. */
export type EveningGame = {
  status: string;
  scheduled_tee_off_at: string | null;
  created_at: string;
  created_by: string | null;
  tournament_id: string | null;
  source_game_id: string | null;
  league_round_id: string | null;
  organizer_evening_notice_sent_at: string | null;
};

/** One row of the list, with `users.is_guest` beside it. */
export type EveningRosterRow = {
  user_id: string;
  withdrawn_at: string | null;
  accepted_at: string | null;
  is_guest: boolean;
};

const pad = (n: number) => String(n).padStart(2, '0');

function osloDateKey(ms: number): string {
  const { year, month, day } = osloParts(new Date(ms));
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function dayBefore(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
}

/** EVENING_NOTICE_HOUR:00 Oslo on the given Oslo day, as an instant. */
function noticeHourOn(key: string): number {
  // 18:00 is past the 02:00/03:00 clock change, so the day's noon offset that
  // `parseOsloDateTimeLocal` probes is the offset at 18:00 too.
  return Date.parse(parseOsloDateTimeLocal(`${key}T${pad(EVENING_NOTICE_HOUR)}:00`));
}

/**
 * Is the organiser's evening varsel due for this round now? All of:
 *  - the round is scheduled and has a tee-off;
 *  - the organiser messages apply (`organizerNoticesApply`: an organiser, not a
 *    cup match, not a derived game), and it is not a league flight;
 *  - it has not been sent (`organizer_evening_notice_sent_at` is null);
 *  - it is the Oslo day before the tee-off, at or after EVENING_NOTICE_HOUR;
 *  - the round was set up before that hour: one set up later that evening
 *    gets nothing;
 *  - someone else than the organiser is on the list, not withdrawn and not a
 *    guest: a solo round has nobody to wait for.
 *
 * ONE RULE, THREE PLACES: the route's candidate query and the cron gate in
 * 0242 select the rounds this can say yes to. Change all three together.
 */
export function isEveningNoticeDue(
  game: EveningGame,
  roster: readonly EveningRosterRow[],
  now: number,
): boolean {
  if (game.status !== 'scheduled' || !game.scheduled_tee_off_at) return false;
  if (!organizerNoticesApply(game) || game.league_round_id != null) return false;
  if (game.organizer_evening_notice_sent_at != null) return false;

  const eveningKey = dayBefore(osloDateKey(Date.parse(game.scheduled_tee_off_at)));
  if (osloDateKey(now) !== eveningKey) return false;
  const dueAt = noticeHourOn(eveningKey);
  if (now < dueAt) return false;
  if (Date.parse(game.created_at) >= dueAt) return false;

  return roster.some((r) => r.user_id !== game.created_by && r.withdrawn_at == null && !r.is_guest);
}

/**
 * What the sweep asks the database for at `now`. Closed before
 * EVENING_NOTICE_HOUR Oslo. The tee-off range is a superset (the next 48
 * hours) so a 23- or 25-hour day is never cut short; `isEveningNoticeDue`
 * decides per round.
 */
export function eveningSweepWindow(now: number): {
  open: boolean;
  teeOffAfter: string;
  teeOffBefore: string;
  createdBefore: string;
} {
  return {
    open: osloParts(new Date(now)).hour >= EVENING_NOTICE_HOUR,
    teeOffAfter: new Date(now).toISOString(),
    teeOffBefore: new Date(now + 48 * 60 * 60 * 1000).toISOString(),
    createdBefore: new Date(noticeHourOn(osloDateKey(now))).toISOString(),
  };
}

/**
 * Who has confirmed and who has not answered. Everyone not withdrawn counts
 * in `total`. A guest counts as confirmed: the organiser vouched for them, and
 * they cannot answer or be reminded (#1009). The organiser counts when on the
 * list. Email invitations without an account are not on the list, so not here.
 */
export function eveningCounts<T extends EveningRosterRow>(
  roster: readonly T[],
): { confirmed: T[]; unanswered: T[]; total: number } {
  const active = roster.filter((r) => r.withdrawn_at == null);
  return {
    confirmed: active.filter((r) => r.accepted_at != null || r.is_guest),
    unanswered: active.filter((r) => r.accepted_at == null && !r.is_guest),
    total: active.length,
  };
}

/**
 * The names the varsel carries for those who have not answered: up to
 * UNANSWERED_NAMES_MAX, the rest as a count. A missing name is counted, not
 * shown, so the payload never holds a placeholder in the sender's language.
 */
export function summarizeUnanswered(names: readonly (string | null)[]): {
  unanswered_names: string[];
  unanswered_more: number;
} {
  const shown = names
    .filter((n): n is string => n != null && n.trim() !== '')
    .slice(0, UNANSWERED_NAMES_MAX);
  return { unanswered_names: shown, unanswered_more: names.length - shown.length };
}
