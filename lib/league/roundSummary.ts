/**
 * The numbers of a league round that has closed (#2979): who was best in the
 * round, and the table after it. The summary goes out with «the next round is
 * open», the same for everyone in the league.
 *
 * Nothing is computed again here. The values come from the league snapshot
 * (`getLigaSnapshot`), the table the league page shows: its ranks, its season
 * values and its per-round cells. The only arithmetic is the places within
 * the round and the gaps, which the language model must never work out itself
 * (`roundNewsPrompt.ts`).
 *
 * The moves in the table (#2983) come from the table as it stood before the
 * round, which `getLigaSnapshot` works out with the same arithmetic when it is
 * asked for a `baseline`. The move is the difference of two ranks, nothing
 * more.
 *
 * Pure. No I/O.
 */
import { formatPublicName } from '@/lib/names/formatPublicName';
import { isPointsBasedFormat } from './flightFormat';
import type { LeagueSnapshot } from './getLigaSnapshot';
import type { LeagueFormat } from './types';

export type RoundSummaryRow = {
  userId: string;
  /** 1-based, shared by players level on the value. */
  place: number;
  /**
   * One name per player, the same wherever the summary shows it: first name
   * and the initial of the last name («Jørgen L.», the owner 23.11), a single
   * name as it is, the nickname without a name. Null when the player has none.
   */
  name: string | null;
  /** The round value (points, or strokes to par) in `round`; the season value in `table`. */
  value: number;
  /** How far behind the best in the list, never negative. 0 for the best. */
  behind: number;
  /**
   * `table` only (#2983): the place in the table before the round. Null when
   * the player was not ranked then, when this is the first round with
   * results, or when the snapshot has no table from before. Always null in
   * `round`.
   */
  previousPlace: number | null;
  /** `previousPlace − place`: positive is places climbed, negative places fallen. Null with `previousPlace`. */
  move: number | null;
};

export type RoundSummary = {
  leagueName: string;
  /** The round that closed, the one the summary is about. */
  roundId: string;
  roundLabel: string;
  courseName: string | null;
  /** The players play on their own, when it suits them (a simulator league). */
  simulator: boolean;
  /** The league's standings model, for formatting the season value. */
  model: string;
  /** Stableford points (highest is best); otherwise strokes to par (lowest is best). */
  pointsBased: boolean;
  /** Rounds with a result so far, this one included. */
  roundsPlayed: number;
  roundsTotal: number;
  /** How many rounds count under «best N»; null for the other models. */
  countingRounds: number | null;
  playersInLeague: number;
  playedThisRound: number;
  /** The round's results, the best first. */
  round: RoundSummaryRow[];
  /** The ranked rows of the season table, in the table's order. */
  table: RoundSummaryRow[];
};

type StandingRow = NonNullable<LeagueSnapshot['standings']['net']>['rows'][number];

/**
 * A player's value in the round, when a card is behind it. A penalty for a
 * missed round has a value too, but it is not a result.
 */
function playedValue(row: StandingRow, roundId: string): number | null {
  const cell = row.perRound.find((c) => c.roundId === roundId);
  return cell && cell.value !== null && !cell.penalised ? cell.value : null;
}

/**
 * The results in one round, the best first, with the place in the round
 * (1-based, shared by players level on the value). One home for the place in
 * a round (#2983): the summary of a closed round and the report after a
 * league flight both read it.
 */
export function roundResults(
  rows: readonly StandingRow[],
  roundId: string,
  higherIsBetter: boolean,
): Array<{ userId: string; value: number; place: number }> {
  const results = rows.flatMap((row) => {
    const value = playedValue(row, roundId);
    return value === null ? [] : [{ userId: row.userId, value }];
  });
  results.sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value));
  return results.map((r) => ({
    ...r,
    place: 1 + results.filter((o) => (higherIsBetter ? o.value > r.value : o.value < r.value)).length,
  }));
}

/**
 * The round a summary for `openingRoundId` is about: the one with the highest
 * sequence below it, once it has closed at `now`. Null when there is none (the
 * league's first round, or an unknown round) or when it has not closed. One
 * home for the choice (trap 4): the summary and the snapshot's baseline both
 * read it.
 */
export function closedRoundBefore<R extends { id: string; sequence: number; closesAt: string }>(
  rounds: readonly R[],
  openingRoundId: string,
  now: number,
): R | null {
  const opening = rounds.find((r) => r.id === openingRoundId);
  if (!opening) return null;
  const closed = rounds
    .filter((r) => r.sequence < opening.sequence)
    .sort((a, b) => b.sequence - a.sequence)[0];
  return closed && Date.parse(closed.closesAt) <= now ? closed : null;
}

/**
 * The summary of the round before `openingRoundId` (`closedRoundBefore`).
 * Null when there is no such round, or when nobody played it.
 */
export function buildRoundSummary(
  snapshot: LeagueSnapshot,
  openingRoundId: string,
  now: number,
): RoundSummary | null {
  const standings = snapshot.standings.net ?? snapshot.standings.gross;
  if (!standings) return null;
  const closed = closedRoundBefore(snapshot.rounds, openingRoundId, now);
  if (!closed) return null;

  const pointsBased = isPointsBasedFormat(snapshot.league.format as LeagueFormat);
  const model = snapshot.league.standings_model;
  const nameOf = new Map(snapshot.participants.map((p) => [p.userId, formatPublicName(p)]));

  const results = roundResults(standings.rows, closed.id, pointsBased);
  if (results.length === 0) return null;
  const best = results[0]!.value;
  const round: RoundSummaryRow[] = results.map((r) => ({
    userId: r.userId,
    place: r.place,
    name: nameOf.get(r.userId) ?? null,
    value: r.value,
    behind: Math.abs(best - r.value),
    previousPlace: null,
    move: null,
  }));

  const roundsPlayed = snapshot.rounds.filter(
    (r) => r.sequence <= closed.sequence && standings.rows.some((row) => playedValue(row, r.id) !== null),
  ).length;

  // The table before the round, on the same scoring as the table now. After
  // the first round with results there was no table to move from.
  const baseline = snapshot.standings.net ? snapshot.baseline?.net : snapshot.baseline?.gross;
  const placeBefore = new Map(
    roundsPlayed > 1 && baseline
      ? baseline.rows.flatMap((row) => (row.ranked && row.rank !== null ? [[row.userId, row.rank] as const] : []))
      : [],
  );

  const ranked = standings.rows
    .filter((row) => row.ranked && row.rank !== null)
    .sort((a, b) => a.rank! - b.rank!);
  const leader = ranked[0]?.value ?? 0;
  const table: RoundSummaryRow[] = ranked.map((row) => {
    const previousPlace = placeBefore.get(row.userId) ?? null;
    return {
      userId: row.userId,
      place: row.rank!,
      name: nameOf.get(row.userId) ?? null,
      value: row.value,
      behind: Math.abs(leader - row.value),
      previousPlace,
      move: previousPlace === null ? null : previousPlace - row.rank!,
    };
  });

  return {
    leagueName: snapshot.league.name,
    roundId: closed.id,
    roundLabel: closed.label,
    courseName: closed.courseName,
    simulator: snapshot.league.is_simulator,
    model,
    pointsBased,
    roundsPlayed,
    roundsTotal: snapshot.rounds.length,
    countingRounds: model === 'best_n' ? snapshot.league.best_n_count : null,
    playersInLeague: snapshot.participants.length,
    playedThisRound: round.length,
    round,
    table,
  };
}
