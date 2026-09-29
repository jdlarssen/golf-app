// #2255: utvalget avatarraden på Hjem og startbilletten deler.
import { companionsOf, type FlightMember } from './flightRoster';

const at = '2026-09-17T08:00:00.000Z';

function member(userId: string, flightNumber: number | null, withdrawnAt: string | null = null) {
  return { userId, flightNumber, withdrawnAt } satisfies FlightMember;
}

const PLAYERS = [
  member('me', 2),
  member('a', 1),
  member('b', 2),
  member('c', 2, at),
  member('d', 2),
  member('e', null),
];

describe('companionsOf', () => {
  it.each([
    ['flighten min, uten meg og uten den trukne', 2, ['b', 'd']],
    ['uten flight: alle andre i spillet som ikke er trukket', null, ['a', 'b', 'd', 'e']],
    ['en flight ingen andre står i', 3, []],
  ])('%s', (_case, flightNumber, expected) => {
    expect(companionsOf(PLAYERS, 'me', flightNumber).map((p) => p.userId)).toEqual(expected);
  });

  it('beholder rosterens rekkefølge og gir tom liste når jeg er alene', () => {
    expect(companionsOf([member('me', null)], 'me', null)).toEqual([]);
    expect(companionsOf([member('z', 1), member('me', 1), member('y', 1)], 'me', 1).map((p) => p.userId)).toEqual([
      'z',
      'y',
    ]);
  });
});
