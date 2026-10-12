// Storskjermen (#2275): the live board on the clubhouse TV. Pure code — no
// React, next-intl or server imports. The numbers come from computeLiveBoard;
// this module only pages the rows and picks «Siste nytt».

import type { LiveBoardRow } from './liveBoard';
import type { CourseHoleRow } from '@/lib/supabase/queryFragments';
import type { ScoringGender } from '@/lib/scoring/modes/types';
import { parForGender, underParMoment, type UnderParMoment } from '@/lib/stats/achievements';

/** Players per page on the TV (owner's answer 2026-10-12: «Fem, som tegningen»). */
export const TV_ROWS_PER_PAGE = 5;
/** How long each page stands before the board turns to the next. */
export const TV_PAGE_MS = 10_000;
/** The «Siste nytt» card holds this many events. */
export const TV_FEED_MAX = 4;

export function tvPageCount(rowCount: number): number {
  return Math.max(1, Math.ceil(rowCount / TV_ROWS_PER_PAGE));
}

/**
 * The rows on one page. The index wraps around, so a refresh that leaves
 * fewer pages never shows an empty one.
 */
export function tvPageRows<T>(rows: readonly T[], pageIndex: number): T[] {
  const page = pageIndex % tvPageCount(rows.length);
  return rows.slice(page * TV_ROWS_PER_PAGE, (page + 1) * TV_ROWS_PER_PAGE);
}

export type TvFeedPlayer = {
  user_id: string;
  tee_gender: ScoringGender | null;
  flight_number: number | null;
  submitted_at: string | null;
};

export type TvFeedScore = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
  updated_at: string;
};

export type TvUnderParKind = 'holeInOne' | 'albatross' | 'eagle' | 'birdie';

export type TvFeedEvent =
  | { kind: 'lead'; userId: string; hole: number; at: string }
  | { kind: TvUnderParKind; userId: string; hole: number; at: string }
  | { kind: 'flightDone'; flight: number; at: string };

const UNDER_PAR_KIND: Record<UnderParMoment, TvUnderParKind> = {
  hole_in_one: 'holeInOne',
  albatross: 'albatross',
  eagle: 'eagle',
  birdie: 'birdie',
};

/** On the same time: the lead first, then under par, then a flight. */
function kindOrder(e: TvFeedEvent): number {
  return e.kind === 'lead' ? 0 : e.kind === 'flightDone' ? 2 : 1;
}

/**
 * «Siste nytt»: up to four events, newest first, from what the app knows —
 * a new leader, holes under par and flights that have handed in. Only players
 * on the board count, so a withdrawn player's birdie never shows.
 *
 * It is worked out again on every refresh; it is not a log. A new leader
 * stands only while the leader's movement is up, so «Marte tok ledelsen på
 * hull 11» goes when Marte plays hole 12 and stays first.
 */
export function buildTvFeed(opts: {
  rows: readonly LiveBoardRow[];
  players: readonly TvFeedPlayer[];
  holesRows: readonly CourseHoleRow[];
  scoresRows: readonly TvFeedScore[];
}): TvFeedEvent[] {
  const { rows, players, holesRows, scoresRows } = opts;
  const onBoard = new Set(rows.map((r) => r.userId));
  const playerById = new Map(players.map((p) => [p.user_id, p]));
  const holeByNumber = new Map(holesRows.map((h) => [h.hole_number, h]));
  const played = scoresRows.filter(
    (s): s is TvFeedScore & { strokes: number } => s.strokes != null && onBoard.has(s.user_id),
  );

  const events: TvFeedEvent[] = [];

  // A new leader: alone on first place and up since the previous hole. The
  // hole is the one the leader played last, in the order the group plays
  // them (`recentHoles`, the same rule as the movement).
  const firsts = rows.filter((r) => r.rank === 1);
  const leader = firsts.length === 1 ? firsts[0] : null;
  const lastHole = leader?.recentHoles.at(-1);
  if (leader && leader.movement !== null && leader.movement > 0 && lastHole) {
    const latest = newest(played.filter((s) => s.user_id === leader.userId).map((s) => s.updated_at));
    if (latest) events.push({ kind: 'lead', userId: leader.userId, hole: lastHole.holeNumber, at: latest });
  }

  for (const s of played) {
    const hole = holeByNumber.get(s.hole_number);
    if (!hole) continue;
    const moment = underParMoment(
      s.strokes,
      parForGender(hole, playerById.get(s.user_id)?.tee_gender ?? null),
    );
    if (moment) {
      events.push({ kind: UNDER_PAR_KIND[moment], userId: s.user_id, hole: s.hole_number, at: s.updated_at });
    }
  }

  const flights = new Map<number, TvFeedPlayer[]>();
  for (const p of players) {
    if (!onBoard.has(p.user_id) || p.flight_number == null) continue;
    flights.set(p.flight_number, [...(flights.get(p.flight_number) ?? []), p]);
  }
  for (const [flight, members] of flights) {
    const handedIn = members.map((p) => p.submitted_at);
    if (handedIn.every((t): t is string => t != null)) {
      events.push({ kind: 'flightDone', flight, at: newest(handedIn)! });
    }
  }

  return events
    .sort(
      (a, b) =>
        Date.parse(b.at) - Date.parse(a.at) ||
        kindOrder(a) - kindOrder(b) ||
        ('hole' in b && 'hole' in a ? b.hole - a.hole : 0),
    )
    .slice(0, TV_FEED_MAX);
}

function newest(times: readonly string[]): string | null {
  let best: string | null = null;
  for (const t of times) if (best === null || Date.parse(t) > Date.parse(best)) best = t;
  return best;
}
