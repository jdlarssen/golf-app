/**
 * The terminliste's pure rules (#2258): «Finn turneringer» as one list sorted
 * on tee-off and split into Oslo days, with filter chips and a capacity line.
 *
 * No server imports, so the native app can use it when it gets a discovery
 * screen (#1954). The data comes from `getDiscoverableGames` /
 * `getPublicDiscoverableGames` (which games) and `getRegistrationSeats` (how
 * many seats are taken) — this module only shapes it.
 */

import { osloParts } from '@/lib/format/teeOff';
import { osloDateKey, osloWeekendDateKeys } from '@/lib/format/osloCalendar';
import { holeCountForSegment } from './holeScope';
import type {
  DiscoverableClubGame,
  DiscoverableFriendGame,
  DiscoverableOpenGame,
} from './getDiscoverableGames';

/**
 * Seats on a game, from `getRegistrationSeats`. `capped`: a format with a
 * player cap, and the seats the active roster holds (the same count the seat
 * claim checks). `matchplay`: whether both sides are full. A game without a cap
 * that is not matchplay has no entry.
 */
export type GameSeats =
  | { kind: 'capped'; cap: number; held: number }
  | { kind: 'matchplay'; full: boolean };

export type TerminSource = 'club' | 'friend' | 'open';

/** «Meld på» (`direct`) or «Be om plass» (`request`). */
export type TerminCta = 'direct' | 'request';

type TerminGame = Pick<
  DiscoverableOpenGame,
  | 'id'
  | 'name'
  | 'short_id'
  | 'scheduled_tee_off_at'
  | 'course_name'
  | 'game_mode'
  | 'mode_config'
  | 'hole_segment'
>;

export type TerminEntry = TerminGame & {
  source: TerminSource;
  cta: TerminCta;
  /** Present only on a round with a cap. */
  capacity: { cap: number; held: number } | null;
  /** No seat left: a capped round at its cap, or matchplay with both sides full. */
  full: boolean;
};

function pickGame(game: TerminGame): TerminGame {
  return {
    id: game.id,
    name: game.name,
    short_id: game.short_id,
    scheduled_tee_off_at: game.scheduled_tee_off_at,
    course_name: game.course_name,
    game_mode: game.game_mode,
    mode_config: game.mode_config,
    hole_segment: game.hole_segment,
  };
}

/**
 * One row per game, with its source, its button and its seats.
 *
 * The button rule had three homes (one per card in `HomeDiscoverySection`); it
 * has one here. A club round is always direct — membership is the invitation
 * (#442). A friend's round follows `joinMode` (#369). An open round asks for a
 * seat under `manual_approval` (#357). A game listed under more than one
 * source gets one row: club beats friend beats open, as in the feed's dedup.
 *
 * The anonymous list passes only `openGames`.
 */
export function buildTerminEntries(
  data: {
    clubGames?: readonly DiscoverableClubGame[];
    friendGames?: readonly DiscoverableFriendGame[];
    openGames?: readonly DiscoverableOpenGame[];
  },
  seats: ReadonlyMap<string, GameSeats>,
): TerminEntry[] {
  const seen = new Set<string>();
  const entries: TerminEntry[] = [];

  const push = (game: TerminGame, source: TerminSource, cta: TerminCta) => {
    if (seen.has(game.id)) return;
    seen.add(game.id);
    const s = seats.get(game.id);
    const capacity = s?.kind === 'capped' ? { cap: s.cap, held: s.held } : null;
    const full =
      s?.kind === 'capped'
        ? capacityState(s).free === 0
        : s?.kind === 'matchplay'
          ? s.full
          : false;
    entries.push({ ...pickGame(game), source, cta, capacity, full });
  };

  for (const g of data.clubGames ?? []) push(g, 'club', 'direct');
  for (const g of data.friendGames ?? []) push(g, 'friend', g.joinMode);
  for (const g of data.openGames ?? []) {
    push(g, 'open', g.registration_mode === 'manual_approval' ? 'request' : 'direct');
  }
  return entries;
}

/** «i dag», «i morgen», «om N dager» — or none on a day that has passed. */
export type TerminDayLabel =
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'days'; days: number }
  | null;

export type TerminGroup =
  | {
      kind: 'day';
      /** Oslo date, «YYYY-MM-DD». */
      key: string;
      /** A tee-off on that day, to format the heading from. */
      teeOff: string;
      label: TerminDayLabel;
      entries: TerminEntry[];
    }
  | { kind: 'undated'; key: 'undated'; entries: TerminEntry[] };

function teeOffTime(entry: TerminEntry): number | null {
  if (!entry.scheduled_tee_off_at) return null;
  const t = new Date(entry.scheduled_tee_off_at).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Whole-day ordinal of a wall-clock date. TZ-free: two such numbers are only
 * ever subtracted (the same idiom as `teeOffProximity`).
 */
function dayNumber(date: Date): number {
  const { year, month, day } = osloParts(date);
  return Math.floor(Date.UTC(year, month, day) / 86_400_000);
}

/**
 * Sort on tee-off, then name, and split into Oslo days. Every coming day gets a
 * relative label — the design shows «om 7 dager» and «om 11 dager», so unlike
 * `teeOffProximity` there is no six-day stop. A day before today (a round still
 * `scheduled`/`draft` after its date) sorts first, without a label. Rounds
 * without a readable time come last in one «Dato ikke satt» group.
 */
export function groupTerminByDate(
  entries: readonly TerminEntry[],
  now: Date,
): TerminGroup[] {
  const byName = (a: TerminEntry, b: TerminEntry) => a.name.localeCompare(b.name, 'nb');

  const dated = entries
    .map((entry) => ({ entry, time: teeOffTime(entry) }))
    .filter((x): x is { entry: TerminEntry; time: number } => x.time !== null)
    .sort((a, b) => a.time - b.time || byName(a.entry, b.entry));
  const undated = entries.filter((e) => teeOffTime(e) === null).sort(byName);

  const today = dayNumber(now);
  const groups: TerminGroup[] = [];
  for (const { entry } of dated) {
    const teeOff = new Date(entry.scheduled_tee_off_at as string);
    const key = osloDateKey(teeOff);
    const last = groups[groups.length - 1];
    if (last?.kind === 'day' && last.key === key) {
      last.entries.push(entry);
      continue;
    }
    const diff = dayNumber(teeOff) - today;
    const label: TerminDayLabel =
      diff < 0
        ? null
        : diff === 0
          ? { kind: 'today' }
          : diff === 1
            ? { kind: 'tomorrow' }
            : { kind: 'days', days: diff };
    groups.push({
      kind: 'day',
      key,
      teeOff: entry.scheduled_tee_off_at as string,
      label,
      entries: [entry],
    });
  }
  if (undated.length > 0) groups.push({ kind: 'undated', key: 'undated', entries: undated });
  return groups;
}

/** The filter chips: «Alle», «Denne helga», «Klubben min» (`?vis=`). */
export type TerminFilter = 'alle' | 'helg' | 'klubb';

/** `?vis=` → filter. Anything unknown shows everything. */
export function parseTerminFilter(raw: string | null | undefined): TerminFilter {
  return raw === 'helg' || raw === 'klubb' ? raw : 'alle';
}

/**
 * «Denne helga» keeps rounds on the coming (or current) Oslo weekend;
 * «Klubben min» keeps the rounds from your clubs, dated or not.
 */
export function filterTermin(
  entries: readonly TerminEntry[],
  filter: TerminFilter,
  now: Date,
): TerminEntry[] {
  if (filter === 'klubb') return entries.filter((e) => e.source === 'club');
  if (filter === 'helg') {
    const weekend = new Set(osloWeekendDateKeys(now));
    return entries.filter((e) => {
      const t = teeOffTime(e);
      return t !== null && weekend.has(osloDateKey(new Date(t)));
    });
  }
  return [...entries];
}

export type CapacityTone = 'normal' | 'low' | 'full';

/**
 * The capacity line: free seats, how much of the bar is filled (the share
 * taken, clamped to 0–1) and its tone — `low` with one or two seats left,
 * `full` at none.
 */
export function capacityState({ cap, held }: { cap: number; held: number }): {
  free: number;
  fillRatio: number;
  tone: CapacityTone;
} {
  const free = Math.max(0, cap - held);
  const fillRatio = cap <= 0 ? 1 : Math.min(1, Math.max(0, held / cap));
  const tone: CapacityTone = free === 0 ? 'full' : free <= 2 ? 'low' : 'normal';
  return { free, fillRatio, tone };
}

/** The small line under the clock. PR 2 adds the start type. */
export type TerminTimeNote = 'nine_holes' | null;

export function terminTimeNote(entry: Pick<TerminEntry, 'hole_segment'>): TerminTimeNote {
  return holeCountForSegment(entry.hole_segment) === 9 ? 'nine_holes' : null;
}
