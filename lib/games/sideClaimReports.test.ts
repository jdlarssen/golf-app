import { describe, expect, it, vi } from 'vitest';
import { claimFlightKeys } from './sideContest';
import {
  reportsForSlot,
  toSideClaimReports,
  type SideClaimReport,
  type SideClaimReportRow,
} from './sideClaimReports';

// Type A: the rule the web's finish pages and the app's finish screen share.

const claim = (over: Partial<SideClaimReport>): SideClaimReport => ({
  category: 'closest_to_pin',
  holeNumber: 7,
  flightNumber: 1,
  winnerUserId: 'marte',
  winner: { name: 'Marte Lie', nickname: null },
  distanceM: null,
  ...over,
});

const roster = [
  { userId: 'marte', name: 'Marte Lie' },
  { userId: 'kristian', name: 'Kristian Holm' },
];

const ctp = { category: 'closest_to_pin', hole: 7 } as const;

describe('reportsForSlot', () => {
  it('shortest distance first, answers without one last, ties by flight', () => {
    const claims = [
      claim({ flightNumber: 4, winnerUserId: null, winner: null }),
      claim({ flightNumber: 3, distanceM: 2.4 }),
      claim({ flightNumber: 1 }),
      claim({ flightNumber: 2, winnerUserId: 'kristian', winner: { name: 'Kristian Holm', nickname: null }, distanceM: 1.8 }),
      claim({ flightNumber: 5, distanceM: 1.8 }),
    ];
    const reports = reportsForSlot(ctp, claims, [1, 2, 3, 4, 5], roster);
    expect(reports?.lines.map((l) => l.flightNumber)).toEqual([2, 5, 3, 1, 4]);
    expect(reports?.lines[0]).toEqual({ flightNumber: 2, name: 'Kristian', distanceM: 1.8 });
  });

  it('names the flights that have not reported, in flight order', () => {
    const claims = [
      claim({ flightNumber: 2 }),
      claim({ category: 'longest_drive', flightNumber: 3 }), // another category on the same hole
      claim({ holeNumber: 8, flightNumber: 4 }), // another hole
    ];
    expect(reportsForSlot(ctp, claims, [1, 2, 3, 4], roster)).toEqual({
      hole: 7,
      lines: [{ flightNumber: 2, name: 'Marte', distanceM: null }],
      missingFlights: [1, 3, 4],
    });
    expect(reportsForSlot({ category: 'longest_drive', hole: 7 }, claims, [1, 2, 3, 4], roster)?.lines).toEqual([
      { flightNumber: 3, name: 'Marte', distanceM: null },
    ]);
  });

  it('with no reports at all the lines are empty and every flight is missing', () => {
    expect(reportsForSlot(ctp, [], [1, 2], roster)).toEqual({ hole: 7, lines: [], missingFlights: [1, 2] });
  });

  it('a single-flight game reports under key 0, so the missing flight is 0', () => {
    const four = ['a', 'b', 'c', 'd'].map((id, i) => ({
      user_id: id,
      flight_number: (i % 2) + 1,
      withdrawn_at: null,
    }));
    const flights = claimFlightKeys('stableford', four);
    expect(flights).toEqual([0]);
    expect(reportsForSlot(ctp, [], flights, roster)?.missingFlights).toEqual([0]);
    expect(reportsForSlot(ctp, [claim({ flightNumber: 0 })], flights, roster)).toMatchObject({
      lines: [{ flightNumber: 0 }],
      missingFlights: [],
    });
  });

  it('a first name someone else in the game shares shows as the full name (#2286)', () => {
    const twoMartes = [...roster, { userId: 'marte-b', name: 'Marte Berg' }];
    const claims = [
      claim({ flightNumber: 1, distanceM: 2.4 }),
      claim({ flightNumber: 2, winnerUserId: 'marte-b', winner: { name: 'Marte Berg', nickname: null }, distanceM: 1.8 }),
    ];
    expect(reportsForSlot(ctp, claims, [1, 2], twoMartes)?.lines.map((l) => l.name)).toEqual([
      'Marte Berg',
      'Marte Lie',
    ]);
    // With only one Marte in the game the first name is enough.
    const oneMarte = [{ userId: 'marte', name: 'Marte Lie' }, { userId: 'kristian', name: 'Kristian Holm' }];
    expect(reportsForSlot(ctp, [claims[0]], [1], oneMarte)?.lines.map((l) => l.name)).toEqual(['Marte']);
  });

  it('a winner without a name shows the nickname', () => {
    const claims = [claim({ winnerUserId: 'n', winner: { name: null, nickname: 'Kalle' } })];
    expect(reportsForSlot(ctp, claims, [1], roster)?.lines[0].name).toBe('Kalle');
  });

  it('«Ingen på green» is a line with a null name, whoever else is in the roster', () => {
    const claims = [claim({ winnerUserId: null, winner: { name: 'Stale Name', nickname: null } })];
    expect(reportsForSlot(ctp, claims, [1], roster)?.lines).toEqual([
      { flightNumber: 1, name: null, distanceM: null },
    ]);
  });

  it('a slot without a hole has no reports', () => {
    expect(reportsForSlot({ ...ctp, hole: null }, [claim({})], [1], roster)).toBeNull();
  });
});

describe('toSideClaimReports', () => {
  const row = (over: Partial<SideClaimReportRow>): SideClaimReportRow => ({
    category: 'closest_to_pin',
    hole_number: 7,
    flight_number: 1,
    winner_user_id: 'marte',
    distance_m: 2.4,
    ...over,
  });
  const marte = () => ({ name: 'Marte Lie', nickname: null });

  it('maps a row, reads a string distance as a number and leaves out an unknown category', () => {
    expect(
      toSideClaimReports(
        [row({ distance_m: '1.8' }), row({ category: 'gir', flight_number: 2 }), row({ distance_m: 'x', flight_number: 3 })],
        marte,
      ),
    ).toEqual([
      {
        category: 'closest_to_pin',
        holeNumber: 7,
        flightNumber: 1,
        winnerUserId: 'marte',
        winner: { name: 'Marte Lie', nickname: null },
        distanceM: 1.8,
      },
      {
        category: 'closest_to_pin',
        holeNumber: 7,
        flightNumber: 3,
        winnerUserId: 'marte',
        winner: { name: 'Marte Lie', nickname: null },
        distanceM: null,
      },
    ]);
  });

  it('no winner gives no name, and a missing distance stays null', () => {
    const winnerName = vi.fn(marte);
    expect(toSideClaimReports([row({ winner_user_id: null, distance_m: null })], winnerName)).toMatchObject([
      { winnerUserId: null, winner: null, distanceM: null },
    ]);
    expect(winnerName).not.toHaveBeenCalled();
  });

  it('asks the caller for the winner\'s name with the id and the row, so the web can look it up and the app read it off the row', () => {
    const rows = [row({ winner_user_id: 'kristian', flight_number: 2 })];
    const winnerName = vi.fn(() => ({ name: 'Kristian Holm', nickname: null }));
    expect(toSideClaimReports(rows, winnerName)).toMatchObject([
      { winnerUserId: 'kristian', winner: { name: 'Kristian Holm', nickname: null } },
    ]);
    expect(winnerName).toHaveBeenCalledWith('kristian', rows[0]);
  });
});
