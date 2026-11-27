import { describe, expect, it } from 'vitest';
import type { LeagueSnapshot } from './getLigaSnapshot';
import { buildFlightLeagueFacts } from './flightLeagueFacts';

/**
 * Type A (#2983): what the round report for a league flight gets to know about
 * the league, right after the flight finished. The table «now» has the flight
 * in it; the baseline is the same table without it (`getLigaSnapshot` with
 * `withoutGameId`). Nothing is computed again: the places come from the
 * tables, and the only arithmetic is the move and who was passed.
 */

type PlayerSpec = {
  id: string;
  name: string | null;
  /** Rank now; null = not ranked. */
  now: number | null;
  /** Rank in the baseline; null = not ranked then. */
  before: number | null;
  /** The value in the flight's round; null = has not played it (yet). */
  round: number | null;
};

function snapshot(players: PlayerSpec[], opts: { format?: string } = {}): LeagueSnapshot {
  const rows = (rank: (p: PlayerSpec) => number | null, withRound: boolean) => ({
    rows: players.map((p) => ({
      userId: p.id,
      value: 0,
      roundsPlayed: rank(p) === null ? 0 : 1,
      ranked: rank(p) !== null,
      rank: rank(p),
      perRound: [
        {
          roundId: 'r2',
          value: withRound ? p.round : null,
          points: null,
          penalised: false,
          deliveredOutsideWindow: false,
          gameId: withRound && p.round !== null ? `g-${p.id}` : null,
        },
      ],
    })),
  });
  return {
    league: { name: 'Vinterligaen', format: opts.format ?? 'stableford', is_simulator: true },
    rounds: [
      { id: 'r1', sequence: 1, label: 'Runde 1' },
      { id: 'r2', sequence: 2, label: 'Runde 2' },
    ],
    participants: players.map((p) => ({ userId: p.id, name: p.name, nickname: null, acceptedAt: null, hasPlayed: true })),
    standings: { net: rows((p) => p.now, true), gross: null },
    baseline: { net: rows((p) => p.before, false), gross: null },
  } as unknown as LeagueSnapshot;
}

const yes = (...ids: string[]) => new Set(ids);

describe('buildFlightLeagueFacts', () => {
  it('a player who climbs from 5th to 2nd names only the passed players who said yes', () => {
    const facts = buildFlightLeagueFacts({
      snapshot: snapshot([
        { id: 'anne', name: 'Anne Aas', now: 1, before: 1, round: 36 },
        { id: 'kari', name: 'Kari Nilsen', now: 2, before: 5, round: 41 },
        { id: 'bo', name: 'Bo Berg', now: 3, before: 2, round: 30 },
        { id: 'nei', name: 'Nina Nei', now: 4, before: 3, round: null },
        { id: 'cato', name: 'Cato Dal', now: 5, before: 4, round: null },
      ]),
      roundId: 'r2',
      flightUserIds: ['kari'],
      aiAllowedUserIds: yes('anne', 'kari', 'bo', 'cato'),
    });
    expect(facts).toEqual({
      leagueName: 'Vinterligaen',
      roundLabel: 'Runde 2',
      provisional: true,
      playedThisRound: 3,
      playersInLeague: 5,
      tableSize: 5,
      players: [
        {
          name: 'Kari N.',
          roundPlace: 1,
          tablePlace: 2,
          tablePlaceBefore: 5,
          move: 3,
          passed: ['Bo B.', 'Cato D.'],
        },
      ],
    });
  });

  it('a flight of two: both players, each with their own places', () => {
    const facts = buildFlightLeagueFacts({
      snapshot: snapshot([
        { id: 'a', name: 'Anne Aas', now: 1, before: 2, round: 40 },
        { id: 'b', name: 'Bo Berg', now: 2, before: 1, round: 33 },
        { id: 'c', name: 'Cato Dal', now: 3, before: 3, round: 35 },
      ]),
      roundId: 'r2',
      flightUserIds: ['a', 'b'],
      aiAllowedUserIds: yes('a', 'b', 'c'),
    });
    expect(facts!.players.map((p) => [p.name, p.roundPlace, p.tablePlace, p.tablePlaceBefore, p.move, p.passed])).toEqual([
      ['Anne A.', 1, 1, 2, 1, ['Bo B.']],
      ['Bo B.', 3, 2, 1, -1, []],
    ]);
  });

  it('the first round: no place before, no move, nobody passed', () => {
    const facts = buildFlightLeagueFacts({
      snapshot: snapshot([
        { id: 'a', name: 'Anne Aas', now: 1, before: null, round: 40 },
        { id: 'b', name: 'Bo Berg', now: 2, before: 1, round: 33 },
      ]),
      roundId: 'r2',
      flightUserIds: ['a'],
      aiAllowedUserIds: yes('a', 'b'),
    });
    expect(facts!.players).toEqual([
      { name: 'Anne A.', roundPlace: 1, tablePlace: 1, tablePlaceBefore: null, move: null, passed: [] },
    ]);
  });

  it('no block when no player in the flight said yes, or none of them has a result in the round', () => {
    const players: PlayerSpec[] = [
      { id: 'a', name: 'Anne Aas', now: 1, before: 1, round: 40 },
      { id: 'b', name: 'Bo Berg', now: 2, before: 2, round: null },
    ];
    expect(
      buildFlightLeagueFacts({ snapshot: snapshot(players), roundId: 'r2', flightUserIds: ['a'], aiAllowedUserIds: yes('b') }),
    ).toBeNull();
    expect(
      buildFlightLeagueFacts({ snapshot: snapshot(players), roundId: 'r2', flightUserIds: ['b'], aiAllowedUserIds: yes('a', 'b') }),
    ).toBeNull();
  });

  it('a shared place in the round, and a stroke league where lowest is best', () => {
    const facts = buildFlightLeagueFacts({
      snapshot: snapshot(
        [
          { id: 'a', name: 'Anne Aas', now: 1, before: 1, round: -2 },
          { id: 'b', name: 'Bo Berg', now: 2, before: 2, round: 3 },
          { id: 'c', name: 'Cato Dal', now: 3, before: 3, round: 3 },
        ],
        { format: 'stroke' },
      ),
      roundId: 'r2',
      flightUserIds: ['b', 'c'],
      aiAllowedUserIds: yes('a', 'b', 'c'),
    });
    expect(facts!.players.map((p) => [p.name, p.roundPlace])).toEqual([
      ['Bo B.', 2],
      ['Cato D.', 2],
    ]);
  });

  it('a player who said no is never in the facts, also not as passed', () => {
    const facts = buildFlightLeagueFacts({
      snapshot: snapshot([
        { id: 'k', name: 'Kari Nilsen', now: 1, before: 2, round: 40 },
        { id: 'nei', name: 'Nina Nei', now: 2, before: 1, round: 30 },
      ]),
      roundId: 'r2',
      flightUserIds: ['k', 'nei'],
      aiAllowedUserIds: yes('k'),
    });
    expect(JSON.stringify(facts)).not.toMatch(/Nina/);
    expect(facts!.players.map((p) => [p.name, p.move, p.passed])).toEqual([['Kari N.', 1, []]]);
  });
});
