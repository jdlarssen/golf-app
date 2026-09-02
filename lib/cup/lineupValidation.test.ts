import { describe, it, expect } from 'vitest';
import {
  seatsPerSlot,
  validateLineupSubmission,
  planLineupPairs,
  type LineupSlotInput,
} from './lineupValidation';

/**
 * Type A for kaptein-uttaket (#1884). Rekkefølgen ER uttaket: slot i på lag 1
 * møter slot i på lag 2, så valideringen her er alt som står mellom en
 * kapteins skjema og en generert match.
 */

const SQUAD = ['a', 'b', 'c', 'd', 'e', 'f'];

function slots(pairs: string[][]): LineupSlotInput[] {
  return pairs.map((userIds, slotIndex) => ({ slotIndex, userIds }));
}

describe('seatsPerSlot', () => {
  it('gives one seat to singles', () => {
    expect(seatsPerSlot('singles_matchplay')).toBe(1);
  });

  it.each([
    'foursomes_matchplay',
    'fourball_matchplay',
    'greensome_matchplay',
    'chapman_matchplay',
    'gruesome_matchplay',
  ] as const)('gives two seats to %s', (format) => {
    expect(seatsPerSlot(format)).toBe(2);
  });
});

describe('validateLineupSubmission', () => {
  it('accepts a full foursomes lineup drawn from the squad', () => {
    const out = validateLineupSubmission({
      format: 'foursomes_matchplay',
      slotCount: 2,
      squadUserIds: SQUAD,
      slots: slots([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    });
    expect(out).toEqual({
      ok: true,
      slots: [
        { slotIndex: 0, seat: 1, userId: 'a' },
        { slotIndex: 0, seat: 2, userId: 'b' },
        { slotIndex: 1, seat: 1, userId: 'c' },
        { slotIndex: 1, seat: 2, userId: 'd' },
      ],
    });
  });

  it('accepts a full singles lineup', () => {
    const out = validateLineupSubmission({
      format: 'singles_matchplay',
      slotCount: 3,
      squadUserIds: SQUAD,
      slots: slots([['a'], ['b'], ['c']]),
    });
    expect(out.ok).toBe(true);
    expect(out.ok && out.slots).toEqual([
      { slotIndex: 0, seat: 1, userId: 'a' },
      { slotIndex: 1, seat: 1, userId: 'b' },
      { slotIndex: 2, seat: 1, userId: 'c' },
    ]);
  });

  it('rejects an unfilled slot', () => {
    expect(
      validateLineupSubmission({
        format: 'foursomes_matchplay',
        slotCount: 2,
        squadUserIds: SQUAD,
        slots: slots([['a', 'b'], ['c']]),
      }),
    ).toEqual({ ok: false, error: 'lineup_incomplete' });
  });

  it('rejects a missing slot entirely', () => {
    expect(
      validateLineupSubmission({
        format: 'singles_matchplay',
        slotCount: 3,
        squadUserIds: SQUAD,
        slots: slots([['a'], ['b']]),
      }),
    ).toEqual({ ok: false, error: 'lineup_incomplete' });
  });

  it('rejects an empty seat inside a slot', () => {
    expect(
      validateLineupSubmission({
        format: 'fourball_matchplay',
        slotCount: 1,
        squadUserIds: SQUAD,
        slots: [{ slotIndex: 0, userIds: ['a', ''] }],
      }),
    ).toEqual({ ok: false, error: 'lineup_incomplete' });
  });

  it('rejects the same player twice in one slot', () => {
    expect(
      validateLineupSubmission({
        format: 'foursomes_matchplay',
        slotCount: 1,
        squadUserIds: SQUAD,
        slots: slots([['a', 'a']]),
      }),
    ).toEqual({ ok: false, error: 'lineup_duplicate_player' });
  });

  it('rejects the same player in two slots', () => {
    expect(
      validateLineupSubmission({
        format: 'singles_matchplay',
        slotCount: 2,
        squadUserIds: SQUAD,
        slots: slots([['a'], ['a']]),
      }),
    ).toEqual({ ok: false, error: 'lineup_duplicate_player' });
  });

  it('rejects a player who is not in the squad', () => {
    expect(
      validateLineupSubmission({
        format: 'singles_matchplay',
        slotCount: 1,
        squadUserIds: SQUAD,
        slots: slots([['motstander']]),
      }),
    ).toEqual({ ok: false, error: 'lineup_not_in_squad' });
  });

  it('rejects too many seats in a slot', () => {
    expect(
      validateLineupSubmission({
        format: 'foursomes_matchplay',
        slotCount: 1,
        squadUserIds: SQUAD,
        slots: [{ slotIndex: 0, userIds: ['a', 'b', 'c'] }],
      }),
    ).toEqual({ ok: false, error: 'lineup_slot_shape' });
  });

  it('rejects a slot index outside the session', () => {
    expect(
      validateLineupSubmission({
        format: 'singles_matchplay',
        slotCount: 2,
        squadUserIds: SQUAD,
        slots: [
          { slotIndex: 0, userIds: ['a'] },
          { slotIndex: 5, userIds: ['b'] },
        ],
      }),
    ).toEqual({ ok: false, error: 'lineup_slot_shape' });
  });

  it('rejects duplicate slot indexes', () => {
    expect(
      validateLineupSubmission({
        format: 'singles_matchplay',
        slotCount: 2,
        squadUserIds: SQUAD,
        slots: [
          { slotIndex: 0, userIds: ['a'] },
          { slotIndex: 0, userIds: ['b'] },
        ],
      }),
    ).toEqual({ ok: false, error: 'lineup_slot_shape' });
  });

  it('rejects a squad too small to fill the session', () => {
    expect(
      validateLineupSubmission({
        format: 'foursomes_matchplay',
        slotCount: 2,
        squadUserIds: ['a', 'b', 'c'],
        slots: slots([
          ['a', 'b'],
          ['c', 'a'],
        ]),
      }),
    ).toEqual({ ok: false, error: 'lineup_squad_too_small' });
  });
});

describe('planLineupPairs', () => {
  it('pairs slot i on team 1 against slot i on team 2', () => {
    const out = planLineupPairs({
      slotCount: 2,
      team1: [
        { slotIndex: 0, seat: 1, userId: 'a' },
        { slotIndex: 0, seat: 2, userId: 'b' },
        { slotIndex: 1, seat: 1, userId: 'c' },
        { slotIndex: 1, seat: 2, userId: 'd' },
      ],
      team2: [
        { slotIndex: 1, seat: 2, userId: 'z' },
        { slotIndex: 0, seat: 2, userId: 'x' },
        { slotIndex: 1, seat: 1, userId: 'y' },
        { slotIndex: 0, seat: 1, userId: 'w' },
      ],
    });
    expect(out).toEqual([
      { slotIndex: 0, side1: ['a', 'b'], side2: ['w', 'x'] },
      { slotIndex: 1, side1: ['c', 'd'], side2: ['y', 'z'] },
    ]);
  });

  it('orders seats within a slot even when rows arrive shuffled', () => {
    const out = planLineupPairs({
      slotCount: 1,
      team1: [
        { slotIndex: 0, seat: 2, userId: 'b' },
        { slotIndex: 0, seat: 1, userId: 'a' },
      ],
      team2: [{ slotIndex: 0, seat: 1, userId: 'x' }],
    });
    expect(out).toEqual([
      { slotIndex: 0, side1: ['a', 'b'], side2: ['x'] },
    ]);
  });

  it('returns one entry per slot in play order', () => {
    const out = planLineupPairs({
      slotCount: 3,
      team1: [
        { slotIndex: 2, seat: 1, userId: 'c' },
        { slotIndex: 0, seat: 1, userId: 'a' },
        { slotIndex: 1, seat: 1, userId: 'b' },
      ],
      team2: [
        { slotIndex: 0, seat: 1, userId: 'x' },
        { slotIndex: 1, seat: 1, userId: 'y' },
        { slotIndex: 2, seat: 1, userId: 'z' },
      ],
    });
    expect(out.map((p) => p.slotIndex)).toEqual([0, 1, 2]);
    expect(out.map((p) => p.side1[0])).toEqual(['a', 'b', 'c']);
  });
});
