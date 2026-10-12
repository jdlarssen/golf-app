// Heiagjengen (#2286): follow one player hole by hole on the live link. Pure
// code — no React, next-intl or server imports. Everything is read off the
// live board (`computeLiveBoard`) and the rows the leaderboard already
// fetched; nothing here reads the database.

import { firstName } from '@/lib/firstName';
import { nextUnfilledHole } from '@/lib/games/nextHole';
import type { HoleSegment } from '@/lib/scoring/holeSegment';
import type { ScoringGender } from '@/lib/scoring/modes/types';
import { parForGender, underParMoment, type UnderParMoment } from '@/lib/stats/achievements';
import type { CourseHoleRow } from '@/lib/supabase/queryFragments';
import {
  comparableGap,
  viewerStanding,
  type LiveBoard,
  type LiveBoardRow,
  type ViewerStanding,
} from './liveBoard';

/** The player rows `buildFollowView` reads (from `getGameWithPlayers`). */
export type FollowPlayerRow = {
  user_id: string;
  /** Typed as a number upstream, but the column can be null in the database. */
  flight_number?: number | null;
  submitted_at?: string | null;
  withdrawn_at: string | null;
  tee_gender: ScoringGender;
  users: { name: string | null; nickname: string | null } | null;
};

/** What comes next for the followed player. */
export type FollowNext =
  | { kind: 'hole'; holeNumber: number; par: number }
  | { kind: 'allPlayed' }
  | { kind: 'submitted' }
  | { kind: 'notStarted' };

export type FollowOther = {
  row: LiveBoardRow;
  /** Another button in the list has the same first name: show the full name. */
  fullName: boolean;
};

export type FollowViewData = {
  row: LiveBoardRow;
  standing: ViewerStanding;
  /**
   * The followed leader's lead over number two, or `null`: not the sole
   * leader, nobody behind, the numbers cannot be compared, or a lead of 0
   * (equal totals split on countback).
   */
  lead: number | null;
  /** `null` only when the next hole is missing from the course's holes. */
  next: FollowNext | null;
  /** The newest played hole's under-par word, if it is one. */
  moment: UnderParMoment | null;
  /** «Følg en annen»: the flight (everyone without one), the followed player first. */
  others: FollowOther[];
};

/**
 * The `?folg=` value as an id: the first one of a repeated parameter, `null`
 * when empty. Whether the player can be followed is decided in
 * `buildFollowView`, against the board.
 */
export function resolveFollowUserId(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ? value : null;
}

/**
 * Everything the follow page shows, or `null` when `userId` is not on the board
 * (unknown, withdrawn, or without a user). `scoresRows` are the game's scores in
 * its hole segment, the same rows the board was computed from.
 */
export function buildFollowView(opts: {
  board: LiveBoard;
  userId: string;
  players: ReadonlyArray<FollowPlayerRow>;
  holesRows: ReadonlyArray<CourseHoleRow>;
  scoresRows: ReadonlyArray<{ user_id: string; hole_number: number; strokes: number | null }>;
  segment: HoleSegment;
}): FollowViewData | null {
  const { board, userId, players, holesRows, scoresRows, segment } = opts;
  const row = board.rows.find((r) => r.userId === userId);
  const standing = row ? viewerStanding(board, userId) : null;
  if (!row || !standing) return null;

  const player = players.find((p) => p.user_id === userId);
  const newest = row.recentHoles.at(-1);

  return {
    row,
    standing,
    lead: leadOverSecond(board, row),
    next: nextFor(player, userId, holesRows, scoresRows, segment),
    moment: newest ? underParMoment(newest.gross, newest.par) : null,
    others: othersFor(board, row, players),
  };
}

function leadOverSecond(board: LiveBoard, row: LiveBoardRow): number | null {
  if (row.rank !== 1 || row.tied) return null;
  const behind = board.rows.filter((r) => r.rank > 1);
  if (behind.length === 0) return null;
  const secondRank = Math.min(...behind.map((r) => r.rank));
  const gaps = behind
    .filter((r) => r.rank === secondRank)
    .map((r) => comparableGap(board.unit, row, r));
  if (gaps.some((g) => g === null)) return null;
  const lead = Math.min(...(gaps as number[]));
  return lead > 0 ? lead : null;
}

function nextFor(
  player: FollowPlayerRow | undefined,
  userId: string,
  holesRows: ReadonlyArray<CourseHoleRow>,
  scoresRows: ReadonlyArray<{ user_id: string; hole_number: number; strokes: number | null }>,
  segment: HoleSegment,
): FollowNext | null {
  if (player?.submitted_at) return { kind: 'submitted' };
  // Same rule as the strip (`liveBoardStripAction`): only rows with strokes are
  // filled, so a skipped hole is still the next one.
  const filled = new Set(
    scoresRows.filter((s) => s.user_id === userId && s.strokes != null).map((s) => s.hole_number),
  );
  if (filled.size === 0) return { kind: 'notStarted' };
  const holeNumber = nextUnfilledHole(segment, filled);
  if (holeNumber === null) return { kind: 'allPlayed' };
  const hole = holesRows.find((h) => h.hole_number === holeNumber);
  if (!hole) return null;
  return { kind: 'hole', holeNumber, par: parForGender(hole, player?.tee_gender ?? null) };
}

function othersFor(
  board: LiveBoard,
  row: LiveBoardRow,
  players: ReadonlyArray<FollowPlayerRow>,
): FollowOther[] {
  // Built from the board, never from `players`: the board holds only players
  // who can be followed, in the board's order.
  const flightOf = new Map(players.map((p) => [p.user_id, p.flight_number ?? null]));
  const flight = flightOf.get(row.userId) ?? null;
  const pool =
    flight === null ? board.rows : board.rows.filter((r) => flightOf.get(r.userId) === flight);
  const ordered = [row, ...pool.filter((r) => r.userId !== row.userId)];

  const firstNames = ordered.map((r) => firstName(r.name));
  return ordered.map((r, i) => ({
    row: r,
    fullName: firstNames[i] !== null && firstNames.some((n, j) => j !== i && n === firstNames[i]),
  }));
}

/** «{spillnavn} · {bane}» — just the game name when it already starts with the course. */
export function followSubtitle(gameName: string, courseName: string | null): string {
  if (!courseName || gameName.startsWith(courseName)) return gameName;
  return `${gameName} · ${courseName}`;
}

/** Where the phone remembers who is followed on one live link. */
export function followStorageKey(token: string): string {
  return `torny:folg:${token}`;
}

/** Forgets the followed player for one live link; a storage that throws changes nothing. */
export function forgetFollow(
  token: string,
  getStorage: () => Storage = () => window.localStorage,
): void {
  try {
    getStorage().removeItem(followStorageKey(token));
  } catch {
    // Private mode or blocked storage: there is nothing stored to forget.
  }
}
