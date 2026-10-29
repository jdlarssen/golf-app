/**
 * Spillerregisteret (#2346): hvem spiller, og når spilte de sist?
 *
 * Ren og I/O-fri (Type A). Tidssone-regnestykket bor her og ikke i klienten:
 * Vercel kjører UTC, så alle datoer leses på Oslo-kalender via `osloParts` og
 * Oslo-formatterne, aldri med lokale `Date`-gettere (#648).
 *
 * En runde er et ferdig spill der spilleren ikke er trukket, som `finished_players`
 * i `admin_key_metrics`. Datoen er `effectiveDate` (utslag, ellers avslutning).
 */
import { effectiveDate } from '@/lib/stats/effectiveDate';
import { osloDateKey, osloYearWindow } from '@/lib/format/osloCalendar';
import {
  formatShortOsloDateWithYearLocale,
  formatShortOsloDayMonthLocale,
} from '@/lib/i18n/format';
import { osloParts } from '@/lib/format/teeOff';
import type { AppLocale } from '@/i18n/routing';

export const REGISTER_PAGE_SIZE = 20;

export type RegisterFilter = 'alle' | 'spilt-i-aar' | 'gjester';

/** One `game_players` row joined to its finished game. */
export type RoundRow = {
  user_id: string;
  games: { scheduled_tee_off_at: string | null; ended_at: string | null };
};

export type RegisterUser = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
  hcp_index: number;
  is_admin: boolean;
  is_guest: boolean;
  created_at: string;
};

export type RoundTally = { rounds: number; lastPlayedAt: string | null };

export type RegisterRow = RegisterUser & {
  rounds: number;
  lastPlayedAt: string | null;
  playedThisYear: boolean;
  lastPlayedLabel: string | null;
};

/**
 * Rounds and latest round date per player. An undated round (a finished game
 * with neither tee-off nor end time) counts in `rounds` but never moves the date.
 */
export function tallyRounds(rows: RoundRow[]): Map<string, RoundTally> {
  const tally = new Map<string, RoundTally>();
  for (const { user_id, games } of rows) {
    const entry = tally.get(user_id) ?? { rounds: 0, lastPlayedAt: null };
    entry.rounds += 1;
    const date = effectiveDate(games);
    if (date) {
      const iso = date.toISOString();
      if (entry.lastPlayedAt === null || iso > entry.lastPlayedAt) entry.lastPlayedAt = iso;
    }
    tally.set(user_id, entry);
  }
  return tally;
}

/** Joins users to their tally and writes the labels the list shows. */
export function buildRegisterRows(
  users: RegisterUser[],
  tally: Map<string, RoundTally>,
  now: Date,
  locale: AppLocale,
  todayLabel: string,
): RegisterRow[] {
  const yearStartIso = osloYearWindow(now).startIso;
  const todayKey = osloDateKey(now);
  const thisYear = osloParts(now).year;

  return users.map((u) => {
    const { rounds, lastPlayedAt } = tally.get(u.id) ?? { rounds: 0, lastPlayedAt: null };
    let lastPlayedLabel: string | null = null;
    if (lastPlayedAt) {
      const played = new Date(lastPlayedAt);
      if (osloDateKey(played) === todayKey) lastPlayedLabel = todayLabel;
      else if (osloParts(played).year !== thisYear) {
        lastPlayedLabel = formatShortOsloDateWithYearLocale(played, locale);
      } else lastPlayedLabel = formatShortOsloDayMonthLocale(played, locale);
    }
    return {
      ...u,
      rounds,
      lastPlayedAt,
      playedThisYear: lastPlayedAt !== null && lastPlayedAt >= yearStartIso,
      lastPlayedLabel,
    };
  });
}

/** Group rank: 0 dated, 1 rounds but none dated, 2 never played. */
function group(r: RegisterRow): number {
  if (r.lastPlayedAt) return 0;
  return r.rounds > 0 ? 1 : 2;
}

/**
 * Whoever played last first; then those with only undated rounds, then those
 * who never played — the last two by newest account. `id` is the final key so
 * the order never flickers between renders.
 */
export function sortRegister(rows: RegisterRow[]): RegisterRow[] {
  return [...rows].sort((a, b) => {
    const g = group(a) - group(b);
    if (g !== 0) return g;
    if (group(a) === 0) {
      if (a.lastPlayedAt! !== b.lastPlayedAt!) return a.lastPlayedAt! < b.lastPlayedAt! ? 1 : -1;
    } else if (a.created_at !== b.created_at) {
      return a.created_at < b.created_at ? 1 : -1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Name, nickname or email contains the trimmed, lower-cased query. */
export function registerMatchesSearch(
  row: Pick<RegisterUser, 'name' | 'nickname' | 'email'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (row.name?.toLowerCase() ?? '').includes(q) ||
    (row.nickname?.toLowerCase() ?? '').includes(q) ||
    row.email.toLowerCase().includes(q)
  );
}

export function filterRegister<T extends RegisterRow>(rows: T[], filter: RegisterFilter): T[] {
  if (filter === 'spilt-i-aar') return rows.filter((r) => r.playedThisYear);
  if (filter === 'gjester') return rows.filter((r) => r.is_guest);
  return rows;
}
