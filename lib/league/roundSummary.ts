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

/**
 * The summary of the round before `openingRoundId`: the one with the highest
 * sequence below it that has closed at `now`. Null when there is none (the
 * league's first round), when it has not closed, or when nobody played it.
 */
export function buildRoundSummary(
  snapshot: LeagueSnapshot,
  openingRoundId: string,
  now: number,
): RoundSummary | null {
  const standings = snapshot.standings.net ?? snapshot.standings.gross;
  const opening = snapshot.rounds.find((r) => r.id === openingRoundId);
  if (!standings || !opening) return null;

  const before = snapshot.rounds
    .filter((r) => r.sequence < opening.sequence)
    .sort((a, b) => b.sequence - a.sequence);
  const closed = before[0];
  if (!closed || Date.parse(closed.closesAt) > now) return null;

  const pointsBased = isPointsBasedFormat(snapshot.league.format as LeagueFormat);
  const model = snapshot.league.standings_model;
  const nameOf = new Map(snapshot.participants.map((p) => [p.userId, formatPublicName(p)]));

  // A played round has a card behind it. A penalty for a missed round has a
  // value too, but it is not a result.
  const playedValue = (row: (typeof standings.rows)[number], roundId: string): number | null => {
    const cell = row.perRound.find((c) => c.roundId === roundId);
    return cell && cell.value !== null && !cell.penalised ? cell.value : null;
  };

  const roundHigherIsBetter = pointsBased;
  const results = standings.rows.flatMap((row) => {
    const value = playedValue(row, closed.id);
    return value === null ? [] : [{ userId: row.userId, value }];
  });
  if (results.length === 0) return null;
  results.sort((a, b) => (roundHigherIsBetter ? b.value - a.value : a.value - b.value));
  const best = results[0]!.value;
  const round: RoundSummaryRow[] = results.map((r) => ({
    userId: r.userId,
    place: 1 + results.filter((o) => (roundHigherIsBetter ? o.value > r.value : o.value < r.value)).length,
    name: nameOf.get(r.userId) ?? null,
    value: r.value,
    behind: Math.abs(best - r.value),
  }));

  const ranked = standings.rows
    .filter((row) => row.ranked && row.rank !== null)
    .sort((a, b) => a.rank! - b.rank!);
  const leader = ranked[0]?.value ?? 0;
  const table: RoundSummaryRow[] = ranked.map((row) => ({
    userId: row.userId,
    place: row.rank!,
    name: nameOf.get(row.userId) ?? null,
    value: row.value,
    behind: Math.abs(leader - row.value),
  }));

  const roundsPlayed = snapshot.rounds.filter(
    (r) => r.sequence <= closed.sequence && standings.rows.some((row) => playedValue(row, r.id) !== null),
  ).length;

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
