import { describe, it, expect } from 'vitest';
import { computeFlightRoundValues, type FlightScoringInput } from './roundScoring';
import type { ScoringPlayer, ScoringHole, ScoringHoleScore } from '@/lib/scoring/modes/types';
import type { LeagueFormat } from './types';

// 3-hull-bane, total par 11 (4/4/3). Spillere har courseHandicap 0 så netto =
// brutto og stableford-poeng er trivielle å regne for hånd (par→2, bogey→1
// standard; par→0, bogey→−1 modifisert).
const HOLES: ScoringHole[] = [
  { number: 1, par: 4, strokeIndex: 1 },
  { number: 2, par: 4, strokeIndex: 2 },
  { number: 3, par: 3, strokeIndex: 3 },
];
const TEE_PAR = 11;

const player = (userId: string): ScoringPlayer => ({
  userId,
  teamNumber: 1,
  flightNumber: 1,
  courseHandicap: 0,
  teeGender: 'mens',
});

const card = (userId: string, strokes: (number | null)[]): ScoringHoleScore[] =>
  strokes.map((gross, i) => ({ userId, holeNumber: i + 1, gross }));

const input = (format: LeagueFormat, over: Partial<FlightScoringInput> = {}): FlightScoringInput => ({
  format,
  gameId: 'g1',
  players: [player('A'), player('B')],
  holes: HOLES,
  // A plays par-par-par (11), B plays bogey-bogey-bogey (14).
  scores: [...card('A', [4, 4, 3]), ...card('B', [5, 5, 4])],
  parByUser: new Map([
    ['A', TEE_PAR],
    ['B', TEE_PAR],
  ]),
  deliveredOutsideWindow: false,
  ...over,
});

const byUser = (rows: ReturnType<typeof computeFlightRoundValues>, userId: string) =>
  rows.find((r) => r.userId === userId)!;

describe('computeFlightRoundValues — stroke', () => {
  it('maps to net/gross mot-par (total strokes − tee par)', () => {
    const rows = computeFlightRoundValues(input('stroke'));
    expect(byUser(rows, 'A')).toMatchObject({ net: 0, gross: 0 }); // 11 − 11
    expect(byUser(rows, 'B')).toMatchObject({ net: 3, gross: 3 }); // 14 − 11
  });

  it('drops a player whose tee par is unknown', () => {
    const rows = computeFlightRoundValues(
      input('stroke', { parByUser: new Map([['A', TEE_PAR]]) }), // B missing
    );
    expect(rows.map((r) => r.userId)).toEqual(['A']);
  });
});

describe('computeFlightRoundValues — stableford', () => {
  it('maps to stableford points; gross mirrors net (netto-only)', () => {
    const rows = computeFlightRoundValues(input('stableford'));
    // A: 3× par = 3×2 = 6. B: 3× bogey = 3×1 = 3.
    expect(byUser(rows, 'A')).toMatchObject({ net: 6, gross: 6 });
    expect(byUser(rows, 'B')).toMatchObject({ net: 3, gross: 3 });
  });
});

describe('computeFlightRoundValues — modified_stableford', () => {
  it('maps to modified points (par→0, bogey→−1)', () => {
    const rows = computeFlightRoundValues(input('modified_stableford'));
    expect(byUser(rows, 'A')).toMatchObject({ net: 0, gross: 0 }); // 3× par
    expect(byUser(rows, 'B')).toMatchObject({ net: -3, gross: -3 }); // 3× bogey
  });
});

describe('computeFlightRoundValues — complete-card rule', () => {
  it.each(['stroke', 'stableford', 'modified_stableford'] as LeagueFormat[])(
    '%s: excludes an incomplete card',
    (format) => {
      const rows = computeFlightRoundValues(
        input(format, {
          players: [player('A'), player('C')],
          scores: [...card('A', [4, 4, 3]), ...card('C', [4, 4, null])], // C only 2 holes
          parByUser: new Map([
            ['A', TEE_PAR],
            ['C', TEE_PAR],
          ]),
        }),
      );
      expect(rows.map((r) => r.userId)).toEqual(['A']);
    },
  );
});

describe('computeFlightRoundValues — flag passthrough', () => {
  it('stamps deliveredOutsideWindow on every produced row', () => {
    const rows = computeFlightRoundValues(input('stableford', { deliveredOutsideWindow: true }));
    expect(rows.every((r) => r.deliveredOutsideWindow)).toBe(true);
  });
});
