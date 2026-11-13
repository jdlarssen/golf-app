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
import {
  osloDateKey,
  osloWeekendDateKeys,
  type DatePartsReader,
} from '@/lib/format/osloCalendar';
import { holeCountForSegment } from './holeScope';
import { capacityState, type GameSeats } from './seatCapacity';
import type {
  DiscoverableClubGame,
  DiscoverableFriendGame,
  DiscoverableOpenGame,
  PendingRequest,
} from './discoverableGameTypes';

// The seat count's types and its «Fullt» live in `seatCapacity.ts`, which has
// no imports, so the app and the signup route read them without this module's.
export { capacityState, type CapacityTone, type GameSeats } from './seatCapacity';

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
  | 'start_type'
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
    start_type: game.start_type,
  };
}

/** A row's capacity line and «Fullt», from the seats the caller read. */
function seatFields(
  id: string,
  seats: ReadonlyMap<string, GameSeats>,
): Pick<TerminEntry, 'capacity' | 'full'> {
  const s = seats.get(id);
  const capacity = s?.kind === 'capped' ? { cap: s.cap, held: s.held } : null;
  const full =
    s?.kind === 'capped'
      ? capacityState(s).free === 0
      : s?.kind === 'matchplay'
        ? s.full
        : false;
  return { capacity, full };
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
    entries.push({ ...pickGame(game), source, cta, ...seatFields(game.id, seats) });
  };

  for (const g of data.clubGames ?? []) push(g, 'club', 'direct');
  for (const g of data.friendGames ?? []) push(g, 'friend', g.joinMode);
  for (const g of data.openGames ?? []) {
    push(g, 'open', g.registration_mode === 'manual_approval' ? 'request' : 'direct');
  }
  return entries;
}

/** A round on the club page with what it has to do with you (#2326). */
export type ClubRoundEntry = TerminEntry & {
  /** «Du er med» / «Du arrangerer»; the row then has no button. */
  mine: 'joined' | 'organizer' | null;
};

export type ClubRoundGame = TerminGame & {
  created_by: string | null;
  signups_closed_at: string | null;
};

/**
 * The club page's «Neste runder i klubben» (#2326): the club's scheduled
 * rounds, earliest tee-off first and undated last (name breaks a tie, as in
 * `groupTerminByDate`).
 *
 * `mine` is `'joined'` when you are on the round, else `'organizer'` when you
 * set it up, else `null` — so a round you set up and play says «Du er med».
 * The button is always direct: membership is the invitation (#442).
 *
 * Dropped: a round dated before today's Oslo date (still `scheduled` after
 * its day, so it is stuck), and a round whose signups the organiser closed
 * when it is not yours — its button would lead to a closed signup.
 */
export function buildClubRoundEntries(
  games: readonly ClubRoundGame[],
  opts: {
    joinedIds: ReadonlySet<string>;
    userId: string;
    seats: ReadonlyMap<string, GameSeats>;
    now: Date;
  },
): ClubRoundEntry[] {
  const today = osloDateKey(opts.now);
  const byName = (a: TerminEntry, b: TerminEntry) => a.name.localeCompare(b.name, 'nb');
  const mineOf = (game: ClubRoundGame): ClubRoundEntry['mine'] =>
    opts.joinedIds.has(game.id)
      ? 'joined'
      : game.created_by !== null && game.created_by === opts.userId
        ? 'organizer'
        : null;

  const rows: ClubRoundEntry[] = [];
  for (const game of games) {
    const mine = mineOf(game);
    if (mine === null && game.signups_closed_at !== null) continue;
    const entry: ClubRoundEntry = {
      ...pickGame(game),
      source: 'club',
      cta: 'direct',
      ...seatFields(game.id, opts.seats),
      mine,
    };
    const time = teeOffTime(entry);
    if (time !== null && osloDateKey(new Date(time)) < today) continue;
    rows.push(entry);
  }

  const dated = rows
    .filter((e) => teeOffTime(e) !== null)
    .sort((a, b) => (teeOffTime(a) as number) - (teeOffTime(b) as number) || byName(a, b));
  const undated = rows.filter((e) => teeOffTime(e) === null).sort(byName);
  return [...dated, ...undated];
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
function dayNumber(date: Date, parts: DatePartsReader): number {
  const { year, month, day } = parts(date);
  return Math.floor(Date.UTC(year, month, day) / 86_400_000);
}

/**
 * Sort on tee-off, then name, and split into Oslo days. Every coming day gets a
 * relative label — the design shows «om 7 dager» and «om 11 dager», so unlike
 * `teeOffProximity` there is no six-day stop. A day before today (a round still
 * `scheduled`/`draft` after its date) sorts first, without a label. Rounds
 * without a readable time come last in one «Dato ikke satt» group.
 *
 * `parts` is the calendar the days are read on: Oslo by default, the device's
 * own in the native app, where Hermes has no Europe/Oslo zone (#2838).
 */
export function groupTerminByDate(
  entries: readonly TerminEntry[],
  now: Date,
  parts: DatePartsReader = osloParts,
): TerminGroup[] {
  const byName = (a: TerminEntry, b: TerminEntry) => a.name.localeCompare(b.name, 'nb');

  const dated = entries
    .map((entry) => ({ entry, time: teeOffTime(entry) }))
    .filter((x): x is { entry: TerminEntry; time: number } => x.time !== null)
    .sort((a, b) => a.time - b.time || byName(a.entry, b.entry));
  const undated = entries.filter((e) => teeOffTime(e) === null).sort(byName);

  const today = dayNumber(now, parts);
  const groups: TerminGroup[] = [];
  for (const { entry } of dated) {
    const teeOff = new Date(entry.scheduled_tee_off_at as string);
    const key = osloDateKey(teeOff, parts);
    const last = groups[groups.length - 1];
    if (last?.kind === 'day' && last.key === key) {
      last.entries.push(entry);
      continue;
    }
    const diff = dayNumber(teeOff, parts) - today;
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
 * «Klubben min» keeps the rounds from your clubs, dated or not. `parts` as in
 * `groupTerminByDate`.
 */
export function filterTermin(
  entries: readonly TerminEntry[],
  filter: TerminFilter,
  now: Date,
  parts: DatePartsReader = osloParts,
): TerminEntry[] {
  if (filter === 'klubb') return entries.filter((e) => e.source === 'club');
  if (filter === 'helg') {
    const weekend = new Set(osloWeekendDateKeys(now, parts));
    return entries.filter((e) => {
      const t = teeOffTime(e);
      return t !== null && weekend.has(osloDateKey(new Date(t), parts));
    });
  }
  return [...entries];
}

/** The small line under the clock: «9 hull», «første start» or «shotgun». */
export type TerminTimeNote = 'nine_holes' | 'first_tee' | 'shotgun' | null;

/**
 * Nine holes wins — a nine-hole round says «9 hull» with or without a time.
 * Otherwise a round with a time says how it starts, and a round without a
 * time says nothing: a start type means little before there is a tee-off.
 */
export function terminTimeNote(
  entry: Pick<TerminEntry, 'hole_segment' | 'start_type' | 'scheduled_tee_off_at'>,
): TerminTimeNote {
  if (holeCountForSegment(entry.hole_segment) === 9) return 'nine_holes';
  if (!entry.scheduled_tee_off_at || Number.isNaN(new Date(entry.scheduled_tee_off_at).getTime())) {
    return null;
  }
  return entry.start_type === 'shotgun' ? 'shotgun' : 'first_tee';
}

/**
 * Whether the list has a round you can sign up for: the new player's
 * Terminlista row in the Klubbhus room shows only then (#2494, owner's answer
 * 05.10, O1 B). The list's own rows (`buildTerminEntries` with the same seats
 * /finn-turneringer reads) that are not full: a full round stands on the list
 * as «Fullt», without a button. A round dated before today still has its
 * button while the organiser keeps signups open, so it counts, as on the
 * list. A pending request is no open round, unlike the empty state of
 * `Terminliste.tsx`, which also waits for your requests.
 */
export function hasOpenRounds(data: {
  clubGames?: readonly DiscoverableClubGame[];
  friendGames?: readonly DiscoverableFriendGame[];
  openGames?: readonly DiscoverableOpenGame[];
  /** Taken and ignored on purpose: a request is no open round. */
  pendingRequests?: readonly PendingRequest[];
}, seats: ReadonlyMap<string, GameSeats>): boolean {
  return buildTerminEntries(data, seats).some((entry) => !entry.full);
}
