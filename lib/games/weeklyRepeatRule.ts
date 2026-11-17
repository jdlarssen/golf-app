import { isClubTournament } from '@/lib/games/registration';

/**
 * #2460 «Gjenta hver uke»: the rule and the wall-clock arithmetic, with nothing
 * else imported. The app reads this file and not `weeklyRepeat.ts`: that one
 * pulls in the Oslo `Intl` helpers and the game-name code (`lib/i18n/format`),
 * which Hermes cannot run (no ICU time zones, see `native/app/src/lib/display.ts`).
 * `weeklyRepeat.ts` re-exports everything here, so the web has one import.
 */

export type CanRepeatWeeklyInput = {
  tournamentId: string | null | undefined;
  leagueRoundId: string | null | undefined;
  sourceGameId: string | null | undefined;
  groupId: string | null | undefined;
  /** The organiser chose tee-off «Nå» (#2463): a one-off round. */
  teeOffNow: boolean;
};

/**
 * May this round repeat weekly? Only a standalone round: no cup match, no
 * league round, no derived game, no club tournament (`isClubTournament`) and
 * no tee-off «Nå». The one home of the rule (AGENTS.md trap #4): the wizard
 * shows the switch by it, the server forces `false` by it, and the finish tail
 * checks it again. The DB's `games_repeat_weekly_standalone` CHECK (0240)
 * covers the first three; `weeklyRepeat.test.ts` holds the two together.
 */
export function canRepeatWeekly({
  tournamentId,
  leagueRoundId,
  sourceGameId,
  groupId,
  teeOffNow,
}: CanRepeatWeeklyInput): boolean {
  if (tournamentId || leagueRoundId || sourceGameId) return false;
  if (isClubTournament({ groupId, tournamentId })) return false;
  return !teeOffNow;
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** A `datetime-local` wall-clock value `days` calendar days later. Null if malformed. */
export function addDaysLocal(value: string, days: number): string | null {
  const m = LOCAL_RE.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(hour)}:${pad(minute)}`;
}

/**
 * The «Neste: …» line: the tee-off plus seven calendar days, still as a
 * `datetime-local` value. Calendar arithmetic on the wall clock, so a change
 * to or from summer time in between never moves the time. Null for an empty
 * or malformed value.
 */
export function nextWeeklyLocal(value: string): string | null {
  return addDaysLocal(value, 7);
}
