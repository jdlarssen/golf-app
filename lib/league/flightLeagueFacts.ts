/**
 * What the round report for a league flight gets to know about the league
 * (#2983): how the flight's players stand in the round so far and in the
 * table, right after the flight finished. The owner 23.11: «så da får man jo
 * et snapshot, selv om det faktiske er hva som kommer i oppsummeringen». The
 * places are provisional: others can still play the round before it closes.
 *
 * Nothing is computed again here. The table «now» is the league snapshot with
 * the flight in it; the table «before» is the snapshot's baseline without the
 * flight's cards (`getLigaSnapshot` with `withoutGameId`), worked out with the
 * same arithmetic. The place in the round is `roundResults`, the one the
 * summary of a closed round uses. The only arithmetic is the move and who was
 * passed, which the language model must never work out itself.
 *
 * Only the players who said yes to texts from the language model are named,
 * as players and as passed. The counts stand as plain numbers.
 *
 * Pure. No I/O.
 */
import { formatPublicName } from '@/lib/names/formatPublicName';
import { isPointsBasedFormat } from './flightFormat';
import type { LeagueSnapshot } from './getLigaSnapshot';
import { roundResults } from './roundSummary';
import type { LeagueFormat } from './types';

export type FlightLeaguePlayer = {
  /** «Jørgen L.» (`formatPublicName`), the same form as the league's news story. */
  name: string;
  /** The place in the round among those who have played it so far; shared when level. */
  roundPlace: number;
  /** The place in the table now, with the flight in it. Null when not ranked. */
  tablePlace: number | null;
  /** The place in the table without the flight. Null when not ranked then. */
  tablePlaceBefore: number | null;
  /** `tablePlaceBefore − tablePlace`: positive is places climbed. Null when either place is. */
  move: number | null;
  /** Players ahead before the flight and behind now, who said yes. In the table's order. */
  passed: string[];
};

export type FlightLeagueFacts = {
  leagueName: string;
  roundLabel: string;
  /** Always true: the round is open, and the places can still change. */
  provisional: true;
  playedThisRound: number;
  playersInLeague: number;
  /** Ranked players in the table now. */
  tableSize: number;
  players: FlightLeaguePlayer[];
};

/**
 * The league block for the report, or null when there is nothing the facts
 * may say: no player in the flight said yes, or none of them has a result in
 * the round (a card the table does not count).
 */
export function buildFlightLeagueFacts(opts: {
  snapshot: LeagueSnapshot;
  roundId: string;
  /** The flight's players who did not withdraw. */
  flightUserIds: readonly string[];
  aiAllowedUserIds: ReadonlySet<string>;
}): FlightLeagueFacts | null {
  const { snapshot, roundId, aiAllowedUserIds } = opts;
  const standings = snapshot.standings.net ?? snapshot.standings.gross;
  const round = snapshot.rounds.find((r) => r.id === roundId);
  if (!standings || !round) return null;
  // The same scoring as the table now.
  const baseline = snapshot.standings.net ? snapshot.baseline?.net : snapshot.baseline?.gross;

  const nameOf = new Map(snapshot.participants.map((p) => [p.userId, formatPublicName(p)]));
  const shownName = (userId: string): string | null =>
    aiAllowedUserIds.has(userId) ? (nameOf.get(userId) ?? null) : null;

  const ranks = (rows: readonly { userId: string; ranked: boolean; rank: number | null }[] | undefined) =>
    new Map(
      (rows ?? []).flatMap((row) => (row.ranked && row.rank !== null ? [[row.userId, row.rank] as const] : [])),
    );
  const now = ranks(standings.rows);
  const before = ranks(baseline?.rows);

  const results = roundResults(
    standings.rows,
    roundId,
    isPointsBasedFormat(snapshot.league.format as LeagueFormat),
  );
  const roundPlace = new Map(results.map((r) => [r.userId, r.place]));

  // Everyone in the table now, in its order: the candidates for «passed».
  const tableOrder = [...now.entries()].sort((a, b) => a[1] - b[1]);

  const players = opts.flightUserIds.flatMap((userId): FlightLeaguePlayer[] => {
    const name = shownName(userId);
    const place = roundPlace.get(userId);
    if (name === null || place === undefined) return [];
    const tablePlace = now.get(userId) ?? null;
    const tablePlaceBefore = before.get(userId) ?? null;
    const passed =
      tablePlace === null || tablePlaceBefore === null
        ? []
        : tableOrder.flatMap(([otherId, otherNow]) => {
            const otherBefore = before.get(otherId);
            const other = otherId === userId ? null : shownName(otherId);
            return other !== null && otherBefore !== undefined && otherBefore < tablePlaceBefore && otherNow > tablePlace
              ? [other]
              : [];
          });
    return [
      {
        name,
        roundPlace: place,
        tablePlace,
        tablePlaceBefore,
        move: tablePlace === null || tablePlaceBefore === null ? null : tablePlaceBefore - tablePlace,
        passed,
      },
    ];
  });
  if (players.length === 0) return null;

  return {
    leagueName: snapshot.league.name,
    roundLabel: round.label,
    provisional: true,
    playedThisRound: results.length,
    playersInLeague: snapshot.participants.length,
    tableSize: now.size,
    players,
  };
}
