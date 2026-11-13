import { describe, expect, it } from 'vitest';
import { coinRows, coinState, skinsPotNow, type CoinState } from './skinsPot';
import type { SkinsHoleOutcome, SkinsHoleRow } from '@/lib/scoring/modes/types';

// Type A (#2317): where the skins pot stands now, and what each hole's coin
// shows. Rows are built the way `lib/scoring/modes/skins.ts` builds them:
// carriedIn is the run of halved holes before, atStake = carriedIn + 1.

type Cell = { outcome: SkinsHoleOutcome; carriedIn?: number; entered?: number };

/** Hole rows from a compact spec; `entered` = how many of `players` have gross. */
function holes(spec: Cell[], firstHole = 1, players = 4): SkinsHoleRow[] {
  return spec.map((c, i) => {
    const carriedIn = c.carriedIn ?? 0;
    const entered = c.entered ?? (c.outcome === 'pending' ? 0 : players);
    return {
      holeNumber: firstHole + i,
      par: 4,
      strokeIndex: i + 1,
      carriedIn,
      atStake: carriedIn + 1,
      outcome: c.outcome,
      winnerUserId: c.outcome === 'won' ? 'u1' : null,
      skinsAwarded: c.outcome === 'won' ? carriedIn + 1 : 0,
      perPlayer: Array.from({ length: players }, (_, p) => ({
        userId: `u${p + 1}`,
        gross: p < entered ? 4 : null,
        effectiveScore: p < entered ? 4 : null,
        isWinner: false,
      })),
    };
  });
}

const won = (carriedIn = 0): Cell => ({ outcome: 'won', carriedIn });
const halved = (carriedIn = 0): Cell => ({ outcome: 'carryover', carriedIn });
const pending = (carriedIn = 0, entered = 0): Cell => ({ outcome: 'pending', carriedIn, entered });

describe('skinsPotNow', () => {
  it.each([
    {
      name: 'no scores yet: one skin on hole 1',
      rows: holes([pending(), pending(), pending()]),
      carriedPot: 0,
      expected: { kind: 'pending', holeNumber: 1, atStake: 1, carriedFrom: [], waiting: false },
    },
    {
      name: 'fresh hole after a win',
      rows: holes([won(), won(), pending()]),
      carriedPot: 0,
      expected: { kind: 'pending', holeNumber: 3, atStake: 1, carriedFrom: [], waiting: false },
    },
    {
      name: 'pot after two halved holes, someone has entered the hole',
      rows: holes([won(), halved(), halved(1), pending(2, 1), pending(2)]),
      carriedPot: 2,
      expected: { kind: 'pending', holeNumber: 4, atStake: 3, carriedFrom: [2, 3], waiting: true },
    },
    {
      name: 'only the run right before the pot counts',
      rows: holes([won(), halved(), won(1), halved(), pending(1)]),
      carriedPot: 1,
      expected: { kind: 'pending', holeNumber: 5, atStake: 2, carriedFrom: [4], waiting: false },
    },
    {
      name: 'frozen pot: a hole missing a score holds it although later holes are entered',
      rows: holes([won(), pending(0, 3), pending(0, 4), pending(0, 4)]),
      carriedPot: 0,
      expected: { kind: 'pending', holeNumber: 2, atStake: 1, carriedFrom: [], waiting: true },
    },
    {
      name: 'back nine: hole numbers start at 10',
      rows: holes([halved(), pending(1), pending(1)], 10),
      carriedPot: 1,
      expected: { kind: 'pending', holeNumber: 11, atStake: 2, carriedFrom: [10], waiting: false },
    },
    {
      name: 'all decided, last hole won',
      rows: holes([won(), halved(), won(1)]),
      carriedPot: 0,
      expected: { kind: 'settled', hanging: 0 },
    },
    {
      name: 'all decided, the last two halved: the pot hangs',
      rows: holes([won(), halved(), halved(1)]),
      carriedPot: 2,
      expected: { kind: 'settled', hanging: 2 },
    },
    {
      name: 'no holes at all',
      rows: [],
      carriedPot: 0,
      expected: { kind: 'settled', hanging: 0 },
    },
  ])('$name', ({ rows, carriedPot, expected }) => {
    expect(skinsPotNow(rows, carriedPot)).toEqual(expected);
  });
});

describe('coinState', () => {
  const rows = holes([won(), halved(), won(1), pending(), pending()]);
  it.each<[number, number | null, CoinState]>([
    [0, 4, 'won'],
    [1, 4, 'carried'],
    [2, 4, 'potWon'],
    [3, 4, 'current'],
    [4, 4, 'future'],
    // Every hole decided: nothing is current.
    [3, null, 'future'],
  ])('hole index %i with the pot on %s → %s', (index, current, expected) => {
    expect(coinState(rows[index], current)).toBe(expected);
  });
});

describe('coinRows', () => {
  it.each([
    { name: '18 holes: two rows of nine', rows: holes(Array(18).fill(won())), first: 1, expected: [9, 9] },
    { name: '9 holes: one row', rows: holes(Array(9).fill(won())), first: 1, expected: [9] },
    { name: 'back nine: one row from 10', rows: holes(Array(9).fill(won()), 10), first: 10, expected: [9] },
    { name: 'no holes: no rows', rows: [], first: undefined, expected: [] },
  ])('$name', ({ rows, first, expected }) => {
    const out = coinRows(rows);
    expect(out.map((r) => r.length)).toEqual(expected);
    expect(out[0]?.[0]?.holeNumber).toBe(first);
  });
});
