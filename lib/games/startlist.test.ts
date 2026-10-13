import { describe, it, expect } from 'vitest';
import {
  averageHcpIndex,
  buildStartlist,
  flightSlots,
  moveTargets,
  offeredFlightNumbers,
  type StartlistPlayer,
} from './startlist';

/** Active player; `hcp` is the stored, signed index (plus is negative). */
function p(user_id: string, flight_number: number | null, hcp = 10): StartlistPlayer {
  return { user_id, flight_number, withdrawn_at: null, hcpIndex: hcp };
}

function withdrawn(user_id: string, flight_number: number | null): StartlistPlayer {
  return { ...p(user_id, flight_number), withdrawn_at: '2026-01-01T00:00:00Z' };
}

/** `n` players in `flight`, ids `${prefix}1…`. */
function many(prefix: string, n: number, flight: number | null): StartlistPlayer[] {
  return Array.from({ length: n }, (_, i) => p(`${prefix}${i + 1}`, flight));
}

describe('buildStartlist', () => {
  it.each([
    {
      name: 'tomt spill',
      players: [],
      flights: [],
      unassigned: [],
      activeCount: 0,
    },
    {
      name: 'bøtter i nummerrekkefølge og uten flight',
      players: [p('a', 2), p('b', null), p('c', 1), p('d', 2)],
      flights: [
        { number: 1, ids: ['c'], full: false },
        { number: 2, ids: ['a', 'd'], full: false },
      ],
      unassigned: ['b'],
      activeCount: 4,
    },
    {
      name: 'trukne står utenfor bøttene og tellingen',
      players: [p('a', 1), withdrawn('b', 1), withdrawn('c', null)],
      flights: [{ number: 1, ids: ['a'], full: false }],
      unassigned: [],
      activeCount: 1,
    },
    {
      name: 'fire i en flight er full, tre er det ikke',
      players: [...many('x', 4, 1), ...many('y', 3, 2)],
      flights: [
        { number: 1, ids: ['x1', 'x2', 'x3', 'x4'], full: true },
        { number: 2, ids: ['y1', 'y2', 'y3'], full: false },
      ],
      unassigned: [],
      activeCount: 7,
    },
  ])('$name', ({ players, flights, unassigned, activeCount }) => {
    const list = buildStartlist(players);
    expect(
      list.flights.map((f) => ({ number: f.number, ids: f.members.map((m) => m.user_id), full: f.full })),
    ).toEqual(flights);
    expect(list.unassigned.map((m) => m.user_id)).toEqual(unassigned);
    expect(list.activeCount).toBe(activeCount);
  });

  it('snittet regnes med fortegn: plusshandicap +2 (lagret −2) og 4 gir 1', () => {
    const list = buildStartlist([p('a', 1, -2), p('b', 1, 4)]);
    expect(list.flights[0].avgHcpIndex).toBe(1);
  });
});

describe('averageHcpIndex', () => {
  it.each([
    { name: 'tom flight', hcps: [], expected: null },
    { name: 'én spiller', hcps: [18.4], expected: 18.4 },
    { name: 'urundet snitt', hcps: [9.4, 14.2, 21, 3.8], expected: (9.4 + 14.2 + 21 + 3.8) / 4 },
    { name: 'negativt snitt (plusshandicap)', hcps: [-3, -1], expected: -2 },
  ])('$name', ({ hcps, expected }) => {
    const avg = averageHcpIndex(hcps.map((h, i) => p(`u${i}`, 1, h)));
    if (expected === null) expect(avg).toBeNull();
    else expect(avg).toBeCloseTo(expected, 10);
  });
});

describe('offeredFlightNumbers', () => {
  it.each([
    { name: 'ingen aktive', active: 0, used: [], expected: [1] },
    { name: 'fem aktive gir 1–3', active: 5, used: [], expected: [1, 2, 3] },
    { name: 'tolv aktive gir 1–4', active: 12, used: [1, 2, 3], expected: [1, 2, 3, 4] },
    { name: 'brukt flight 7 kommer med', active: 12, used: [1, 7], expected: [1, 2, 3, 4, 7] },
    { name: 'dubletter og rekkefølge', active: 5, used: [3, 2, 3], expected: [1, 2, 3] },
  ])('$name', ({ active, used, expected }) => {
    expect(offeredFlightNumbers(active, used)).toEqual(expected);
  });
});

describe('moveTargets', () => {
  // 12 active: flight 1 and 2 full, flight 3 has two, two without a flight.
  const twelve = [...many('a', 4, 1), ...many('b', 4, 2), ...many('c', 2, 3), ...many('n', 2, null)];

  it.each([
    {
      name: 'uten flight: fulle er ikke mål, ekstra tom flight 4 er det',
      players: twelve,
      userId: 'n1',
      expected: [3, 4],
    },
    {
      name: 'egen flight er ikke mål',
      players: twelve,
      userId: 'c1',
      expected: [4],
    },
    {
      name: 'fra full flight: plass i 3 og den tomme ekstra',
      players: twelve,
      userId: 'a1',
      expected: [3, 4],
    },
    {
      name: 'hull i nummerrekka: 1 og 3 brukt gir 2 som mål, i rekkefølge',
      players: [...many('a', 3, 1), ...many('c', 2, 3)],
      userId: 'a1',
      expected: [2, 3],
    },
    {
      name: 'flightnummer over dagens tall er mål når det er brukt',
      players: [...many('a', 4, 1), p('z', 7), p('n', null)],
      userId: 'n',
      expected: [2, 3, 7],
    },
    {
      name: 'ukjent spiller gir ingen mål',
      players: twelve,
      userId: 'finnes-ikke',
      expected: [],
    },
    {
      name: 'trukket spiller gir ingen mål',
      players: [...many('a', 4, 1), withdrawn('w', 1), p('n', null)],
      userId: 'w',
      expected: [],
    },
  ])('$name', ({ players, userId, expected }) => {
    expect(moveTargets(buildStartlist(players), userId)).toEqual(expected);
  });
});

describe('flightSlots', () => {
  it.each([
    {
      name: 'uten valg: bare flightene med spillere',
      players: [...many('a', 4, 1), ...many('c', 2, 3)],
      targets: [],
      expected: [
        { number: 1, empty: false },
        { number: 3, empty: false },
      ],
    },
    {
      name: 'tomt hull står mellom 1 og 3',
      players: [...many('a', 3, 1), ...many('c', 2, 3)],
      targets: [2, 3],
      expected: [
        { number: 1, empty: false },
        { number: 2, empty: true },
        { number: 3, empty: false },
      ],
    },
    {
      name: 'den tomme ekstra flighten står sist',
      players: [...many('a', 4, 1), ...many('b', 4, 2), ...many('c', 2, 3), ...many('n', 2, null)],
      targets: [3, 4],
      expected: [
        { number: 1, empty: false },
        { number: 2, empty: false },
        { number: 3, empty: false },
        { number: 4, empty: true },
      ],
    },
    {
      name: 'ekstra flight 4 står foran brukt flight 7',
      players: [...many('a', 4, 1), p('z', 7), ...many('n', 6, null)],
      targets: [2, 3, 4, 7],
      expected: [
        { number: 1, empty: false },
        { number: 2, empty: true },
        { number: 3, empty: true },
        { number: 4, empty: true },
        { number: 7, empty: false },
      ],
    },
  ])('$name', ({ players, targets, expected }) => {
    const slots = flightSlots(buildStartlist(players), targets);
    expect(slots.map((s) => ({ number: s.number, empty: s.flight === null }))).toEqual(expected);
  });
});
