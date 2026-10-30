import { describe, it, expect } from 'vitest';
import { assembleMyLeagues } from './getMyLeagues';
import type { RoundFlight } from './roundLocks';

const leagues = [
  { id: 'l1', name: 'Vinterliga', status: 'active' },
  { id: 'l2', name: 'Vårliga', status: 'draft' },
  { id: 'l3', name: 'Høstliga', status: 'finished' },
];

describe('assembleMyLeagues («Ligaene dine», #2638)', () => {
  it('lists draft and active leagues with the earliest open round and the caller’s state', () => {
    const rounds = [
      { id: 'r4', league_id: 'l1', label: 'Runde 4', sequence: 4, closes_at: '2026-12-27T22:59:00Z' },
      { id: 'r3', league_id: 'l1', label: 'Runde 3', sequence: 3, closes_at: '2026-12-13T22:59:00Z' },
    ];
    const flights = new Map<string, RoundFlight[]>([
      ['r3', [{ status: 'finished', players: [{ userId: 'me', withdrawnAt: null }] }]],
    ]);
    expect(assembleMyLeagues(leagues, rounds, flights, 'me')).toEqual([
      {
        id: 'l1',
        name: 'Vinterliga',
        status: 'active',
        openRound: { id: 'r3', label: 'Runde 3', closesAt: '2026-12-13T22:59:00Z' },
        delivered: true,
        inProgress: false,
        markerCards: [],
      },
      {
        id: 'l2',
        name: 'Vårliga',
        status: 'draft',
        openRound: null,
        delivered: false,
        inProgress: false,
        markerCards: [],
      },
    ]);
  });

  it('a flight in play is in progress; a withdrawn one counts as neither', () => {
    const rounds = [{ id: 'r1', league_id: 'l1', label: 'Runde 1', sequence: 1, closes_at: 'x' }];
    const inPlay = new Map<string, RoundFlight[]>([
      ['r1', [{ status: 'active', players: [{ userId: 'me', withdrawnAt: null }] }]],
    ]);
    const withdrawn = new Map<string, RoundFlight[]>([
      ['r1', [{ status: 'finished', players: [{ userId: 'me', withdrawnAt: '2026-11-03T10:00:00Z' }] }]],
    ]);
    const pick = (f: Map<string, RoundFlight[]>) => {
      const [l1] = assembleMyLeagues(leagues.slice(0, 1), rounds, f, 'me');
      return { delivered: l1.delivered, inProgress: l1.inProgress };
    };
    expect({ inPlay: pick(inPlay), withdrawn: pick(withdrawn) }).toEqual({
      inPlay: { delivered: false, inProgress: true },
      withdrawn: { delivered: false, inProgress: false },
    });
  });

  it('hands each league the cards that wait for the caller as marker (#2688)', () => {
    const card = { gameId: 'g1', userId: 'mia', playerName: 'Mia', roundLabel: 'Runde 1' };
    const [l1, l2] = assembleMyLeagues(leagues.slice(0, 2), [], new Map(), 'me', new Map([['l1', [card]]]));
    expect({ l1: l1.markerCards, l2: l2.markerCards }).toEqual({ l1: [card], l2: [] });
  });

  it('no leagues gives an empty list', () => {
    expect(assembleMyLeagues([], [], new Map(), 'me')).toEqual([]);
  });
});
