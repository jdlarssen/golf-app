import { describe, it, expect } from 'vitest';
import {
  computeCupBestBallAward,
  type CupBestBallAwardInput,
} from './computeCupBestBallAward';

// Type-A unit-test for splittet-cup-dagens best-ball-cup-poeng (#1441, D4).
// Ren funksjon over holes+scores+sides+allowance — netto lagtotal (lavest
// vinner), IKKE hull-for-hull som matchplay-familien. Funksjonen tar ingen
// stilling til games.status ('finished') — det er kallerens ansvar
// (getCupSnapshot, F3b), se kontrakt-kommentaren i selve fila.

function holes(n: number, startingAt = 10) {
  return Array.from({ length: n }, (_, i) => ({
    number: startingAt + i,
    strokeIndex: i + 1,
  }));
}

function score(userId: string, holeNumber: number, gross: number | null) {
  return { userId, holeNumber, gross };
}

describe('computeCupBestBallAward', () => {
  it('side 1 vinner på lavere netto lagtotal, formatert som «side1–side2»', () => {
    const h = holes(2);
    const input: CupBestBallAwardInput = {
      side1: [
        { userId: 'a1', courseHandicap: 0 },
        { userId: 'a2', courseHandicap: 0 },
      ],
      side2: [
        { userId: 'b1', courseHandicap: 0 },
        { userId: 'b2', courseHandicap: 0 },
      ],
      holes: h,
      scores: [
        score('a1', 10, 4),
        score('a2', 10, 6),
        score('a1', 11, 4),
        score('a2', 11, 6),
        score('b1', 10, 5),
        score('b2', 10, 7),
        score('b1', 11, 5),
        score('b2', 11, 7),
      ],
      allowancePct: 0,
    };
    const result = computeCupBestBallAward(input);
    expect(result).toEqual({ winnerSide: 1, formatted: '8–10' });
  });

  it('lik netto lagtotal → winnerSide "tied"', () => {
    const h = holes(2);
    const input: CupBestBallAwardInput = {
      side1: [
        { userId: 'a1', courseHandicap: 0 },
        { userId: 'a2', courseHandicap: 0 },
      ],
      side2: [
        { userId: 'b1', courseHandicap: 0 },
        { userId: 'b2', courseHandicap: 0 },
      ],
      holes: h,
      scores: [
        score('a1', 10, 5),
        score('a2', 10, 6),
        score('a1', 11, 5),
        score('a2', 11, 6),
        score('b1', 10, 5),
        score('b2', 10, 6),
        score('b1', 11, 5),
        score('b2', 11, 6),
      ],
      allowancePct: 0,
    };
    const result = computeCupBestBallAward(input);
    expect(result).toEqual({ winnerSide: 'tied', formatted: '10–10' });
  });

  it('default allowance er 85 (ikke 0) når allowancePct ikke oppgis', () => {
    // side1 CH 18 (effektiv 85% → 15 → 1 slag/hull på SI 1-2), side2 CH 0.
    // Likt gross (5) begge hull → uten allowance blir det delt (10-10);
    // MED default-allowance vinner side1 (netto 4 per hull → 8 total).
    const h = holes(2);
    const side1 = [
      { userId: 'a1', courseHandicap: 18 },
      { userId: 'a2', courseHandicap: 18 },
    ];
    const side2 = [
      { userId: 'b1', courseHandicap: 0 },
      { userId: 'b2', courseHandicap: 0 },
    ];
    const scores = [
      score('a1', 10, 5),
      score('a2', 10, 5),
      score('a1', 11, 5),
      score('a2', 11, 5),
      score('b1', 10, 5),
      score('b2', 10, 5),
      score('b1', 11, 5),
      score('b2', 11, 5),
    ];

    const withDefault = computeCupBestBallAward({ side1, side2, holes: h, scores });
    const withExplicit85 = computeCupBestBallAward({
      side1,
      side2,
      holes: h,
      scores,
      allowancePct: 85,
    });
    const withExplicit0 = computeCupBestBallAward({
      side1,
      side2,
      holes: h,
      scores,
      allowancePct: 0,
    });

    expect(withDefault).toEqual({ winnerSide: 1, formatted: '8–10' });
    expect(withDefault).toEqual(withExplicit85);
    expect(withExplicit0).toEqual({ winnerSide: 'tied', formatted: '10–10' });
  });

  it('manglende scores på ETT hull for én side → null (partial sum kan ikke sammenlignes)', () => {
    const h = holes(3);
    const input: CupBestBallAwardInput = {
      side1: [
        { userId: 'a1', courseHandicap: 0 },
        { userId: 'a2', courseHandicap: 0 },
      ],
      side2: [
        { userId: 'b1', courseHandicap: 0 },
        { userId: 'b2', courseHandicap: 0 },
      ],
      holes: h,
      scores: [
        score('a1', 10, 4),
        score('a2', 10, 5),
        score('a1', 11, 4),
        score('a2', 11, 5),
        score('a1', 12, 4),
        score('a2', 12, 5),
        score('b1', 10, 5),
        score('b2', 10, 6),
        score('b1', 11, 5),
        score('b2', 11, 6),
        // hole 12: side2 has no scores at all → missingHoles for side2
      ],
    };
    expect(computeCupBestBallAward(input)).toBeNull();
  });

  it('feil antall spillere per side (ikke 2+2) → null', () => {
    const h = holes(1);
    const input: CupBestBallAwardInput = {
      side1: [{ userId: 'a1', courseHandicap: 0 }],
      side2: [
        { userId: 'b1', courseHandicap: 0 },
        { userId: 'b2', courseHandicap: 0 },
      ],
      holes: h,
      scores: [score('a1', 10, 4), score('b1', 10, 5), score('b2', 10, 6)],
    };
    expect(computeCupBestBallAward(input)).toBeNull();
  });

  it('ingen hull i scope → null', () => {
    const input: CupBestBallAwardInput = {
      side1: [
        { userId: 'a1', courseHandicap: 0 },
        { userId: 'a2', courseHandicap: 0 },
      ],
      side2: [
        { userId: 'b1', courseHandicap: 0 },
        { userId: 'b2', courseHandicap: 0 },
      ],
      holes: [],
      scores: [],
    };
    expect(computeCupBestBallAward(input)).toBeNull();
  });
});
