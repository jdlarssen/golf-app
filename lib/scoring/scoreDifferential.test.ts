import { describe, it, expect } from 'vitest';
import { computeScoreDifferential, type DifferentialHole } from './scoreDifferential';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a full 18-hole array where every hole has the same par/SI pattern. */
function makeHoles(
  overrides: Partial<DifferentialHole>[] = [],
  defaults: DifferentialHole = { strokes: 5, par: 4, strokeIndex: 0 },
): DifferentialHole[] {
  return Array.from({ length: 18 }, (_, i) => ({
    ...defaults,
    strokeIndex: i + 1, // SI 1..18
    ...overrides[i],
  }));
}

// ---------------------------------------------------------------------------
// Standard 18-hole round
// ---------------------------------------------------------------------------

describe('computeScoreDifferential — standard round', () => {
  /**
   * Setup:
   *   18 holes, all par 4, stroke-indexes 1..18
   *   courseHandicap = 18 → receives 1 stroke on every hole (strokesForHole(18, si) = 1 for all si)
   *   slope = 113, courseRating = 72.0
   *   All holes scored as 5 (bogey)
   *
   * Per hole:
   *   received_i = 1
   *   cap_i      = 4 + 2 + 1 = 7
   *   adj_i      = min(5, 7) = 5  (cap does not fire)
   *
   * AGS = 5 × 18 = 90
   * differential = round1((113 / 113) × (90 − 72))
   *              = round1(1.0 × 18)
   *              = 18.0
   */
  it('computes 18.0 for a bogey round with CH=18 on a standard-rated course', () => {
    const result = computeScoreDifferential({
      holes: makeHoles([], { strokes: 5, par: 4, strokeIndex: 0 }),
      courseHandicap: 18,
      slope: 113,
      courseRating: 72.0,
    });
    expect(result).toBe(18.0);
  });
});

// ---------------------------------------------------------------------------
// Net-double-bogey cap actually clips a blow-up hole
// ---------------------------------------------------------------------------

describe('computeScoreDifferential — net-double-bogey cap', () => {
  /**
   * Setup:
   *   courseHandicap = 0 → receives 0 strokes everywhere
   *   slope = 113, courseRating = 72.0
   *
   *   Hole 1 (SI=1): 10 strokes, par 4
   *     cap = 4 + 2 + 0 = 6  → adj = min(10, 6) = 6  (cap fires, saves 4 strokes)
   *   Holes 2..18 (SI=2..18): 4 strokes (par), par 4
   *     cap = 4 + 2 + 0 = 6  → adj = min(4, 6) = 4  (no cap)
   *
   * With cap:
   *   AGS = 6 + 17 × 4 = 6 + 68 = 74
   *   differential = round1((113 / 113) × (74 − 72)) = round1(2.0) = 2.0
   *
   * Without cap (for comparison):
   *   AGS = 10 + 17 × 4 = 10 + 68 = 78
   *   differential = round1((113 / 113) × (78 − 72)) = round1(6.0) = 6.0
   */
  const holesWithBlowup: DifferentialHole[] = [
    { strokes: 10, par: 4, strokeIndex: 1 },
    ...Array.from({ length: 17 }, (_, i) => ({
      strokes: 4,
      par: 4,
      strokeIndex: i + 2,
    })),
  ];

  it('clips the blow-up hole to net-double-bogey and returns 2.0', () => {
    const result = computeScoreDifferential({
      holes: holesWithBlowup,
      courseHandicap: 0,
      slope: 113,
      courseRating: 72.0,
    });
    expect(result).toBe(2.0);
  });

  it('without cap the same round would give 6.0 (verifies cap actually changes outcome)', () => {
    // Replace the blow-up hole with an uncapped score to confirm the
    // difference comes from the cap:  adj replaced by raw = 10.
    //
    // This test validates the cap by checking the UNCAPPED scenario produces
    // a higher differential.  We achieve it by giving a small blow-up that
    // still doesn't quite reach NDB — ensures the cap path is genuinely different.
    //
    // par 4 + 2 + 0 strokes = cap 6.  Score of 10 → capped to 6.
    // Score of 6 exactly → NOT capped (min(6,6)=6 same result), so we use score=7
    // to get capped to 6 (saves 1):  adj=6 vs raw=7 → delta differential = 1/1 = 1.0

    const holesAlmostBlowup: DifferentialHole[] = [
      { strokes: 7, par: 4, strokeIndex: 1 }, // 1 over NDB → capped to 6 (saves 1 stroke)
      ...Array.from({ length: 17 }, (_, i) => ({
        strokes: 4,
        par: 4,
        strokeIndex: i + 2,
      })),
    ];

    const withCap = computeScoreDifferential({
      holes: holesAlmostBlowup,
      courseHandicap: 0,
      slope: 113,
      courseRating: 72.0,
    });
    // AGS (capped) = 6 + 68 = 74 → diff = 2.0
    expect(withCap).toBe(2.0);

    // Uncapped reference: AGS = 7 + 68 = 75 → diff = 3.0
    const holesAlmostBlowupAtPar: DifferentialHole[] = [
      { strokes: 8, par: 4, strokeIndex: 1 }, // 2 over NDB → capped to 6 (saves 2 strokes)
      ...Array.from({ length: 17 }, (_, i) => ({
        strokes: 4,
        par: 4,
        strokeIndex: i + 2,
      })),
    ];
    const withCap2 = computeScoreDifferential({
      holes: holesAlmostBlowupAtPar,
      courseHandicap: 0,
      slope: 113,
      courseRating: 72.0,
    });
    // AGS (capped) = 6 + 68 = 74 → diff = 2.0 (same as above)
    // Uncapped AGS = 8 + 68 = 76 → diff = 4.0
    expect(withCap2).toBe(2.0);
    // The two uncapped scores (7 and 8) would give differentials 3.0 and 4.0,
    // but the cap floors both to the same 2.0 — proves the cap is active.
    expect(withCap).toBe(withCap2);
  });

  it('the large blow-up (score=10) from the main scenario returns 2.0 per hand calc', () => {
    const result = computeScoreDifferential({
      holes: holesWithBlowup,
      courseHandicap: 0,
      slope: 113,
      courseRating: 72.0,
    });
    // AGS = 6 + 17×4 = 74; (113/113)×(74-72) = 2.0
    expect(result).toBe(2.0);
  });
});

// ---------------------------------------------------------------------------
// Negative differential (plus-handicap / generous rating)
// ---------------------------------------------------------------------------

describe('computeScoreDifferential — negative differential', () => {
  /**
   * Setup:
   *   18 holes, all par 4, SI 1..18
   *   All scores = 4 (par), courseHandicap = 0 → received = 0
   *   cap_i = 4 + 2 + 0 = 6, adj_i = min(4, 6) = 4 (no cap)
   *   AGS = 4 × 18 = 72
   *   slope = 130, courseRating = 75.0
   *
   *   differential = round1((113 / 130) × (72 − 75))
   *                = round1(0.86923... × (−3))
   *                = round1(−2.60769...)
   *                = −2.6
   */
  it('returns a negative differential when AGS < courseRating on a high-slope course', () => {
    const result = computeScoreDifferential({
      holes: makeHoles([], { strokes: 4, par: 4, strokeIndex: 0 }),
      courseHandicap: 0,
      slope: 130,
      courseRating: 75.0,
    });
    expect(result).toBe(-2.6);
  });
});

// ---------------------------------------------------------------------------
// 1-decimal rounding applied
// ---------------------------------------------------------------------------

describe('computeScoreDifferential — 1-decimal rounding', () => {
  /**
   * Setup:
   *   All scores at par (4), courseHandicap=0, par 4 per hole, SI 1..18
   *   AGS = 72
   *   slope = 130, courseRating = 72.0
   *
   *   raw = (113 / 130) × (72 − 72) = (113/130) × 0 = 0.0 — boring.
   *
   * Use AGS = 73 (score one-over par on hole 1, rest par):
   *   AGS = 73
   *   raw = (113 / 130) × (73 − 72) = (113 / 130) × 1 = 0.86923...
   *   rounded = 0.9
   */
  it('rounds (113/130)×1 = 0.86923... to 0.9', () => {
    const holes: DifferentialHole[] = [
      { strokes: 5, par: 4, strokeIndex: 1 }, // one over par on the first hole
      ...Array.from({ length: 17 }, (_, i) => ({
        strokes: 4,
        par: 4,
        strokeIndex: i + 2,
      })),
    ];
    const result = computeScoreDifferential({
      holes,
      courseHandicap: 0,
      slope: 130,
      courseRating: 72.0,
    });
    // (113/130) × 1 = 0.8692307... → Math.round(0.8692307 * 10)/10 = Math.round(8.692307)/10 = 9/10 = 0.9
    expect(result).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// Null cases
// ---------------------------------------------------------------------------

describe('computeScoreDifferential — null cases', () => {
  const validInput = {
    holes: makeHoles([], { strokes: 5, par: 4, strokeIndex: 0 }),
    courseHandicap: 18 as number | null,
    slope: 113 as number | null,
    courseRating: 72.0 as number | null,
  };

  it('returns null for a 17-hole input', () => {
    const result = computeScoreDifferential({
      ...validInput,
      holes: validInput.holes.slice(0, 17),
    });
    expect(result).toBeNull();
  });

  it('returns null when one hole has null strokes', () => {
    const holesWithNull: DifferentialHole[] = [
      { strokes: null, par: 4, strokeIndex: 1 },
      ...Array.from({ length: 17 }, (_, i) => ({
        strokes: 5,
        par: 4,
        strokeIndex: i + 2,
      })),
    ];
    const result = computeScoreDifferential({
      ...validInput,
      holes: holesWithNull,
    });
    expect(result).toBeNull();
  });

  it('returns null when slope is null', () => {
    expect(computeScoreDifferential({ ...validInput, slope: null })).toBeNull();
  });

  it('returns null when courseRating is null', () => {
    expect(computeScoreDifferential({ ...validInput, courseRating: null })).toBeNull();
  });

  it('returns null when courseHandicap is null', () => {
    expect(computeScoreDifferential({ ...validInput, courseHandicap: null })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Plus-handicap (negative CH): cap still applies correctly
// ---------------------------------------------------------------------------

describe('computeScoreDifferential — plus-handicap player', () => {
  /**
   * courseHandicap = -2
   * SI 17 and 18 → received = -1 (the two easiest holes get a stroke subtracted)
   * SI 1..16  → received = 0
   *
   * All scores = 4 (par), all par 4:
   *   Holes SI 1..16: cap = 4 + 2 + 0 = 6, adj = min(4, 6) = 4
   *   Holes SI 17, 18: cap = 4 + 2 + (-1) = 5, adj = min(4, 5) = 4  (no clip)
   *   AGS = 18 × 4 = 72
   *   differential = round1((113/113) × (72 - 72)) = 0.0
   */
  it('scratch-level score on a scratch course gives 0.0 even for a plus-HCP player', () => {
    const result = computeScoreDifferential({
      holes: makeHoles([], { strokes: 4, par: 4, strokeIndex: 0 }),
      courseHandicap: -2,
      slope: 113,
      courseRating: 72.0,
    });
    expect(result).toBe(0.0);
  });

  /**
   * Plus-handicap player on an easier course → negative differential.
   * courseHandicap = -4, slope = 113, courseRating = 71.0
   * All scores = 4 (par), all par 4:
   *   SI 1..14: received = 0, cap = 6, adj = 4
   *   SI 15..18: received = -1 (remainder = 4 % 18 = 4, threshold = 18 - 4 + 1 = 15)
   *              cap = 4 + 2 + (-1) = 5, adj = min(4, 5) = 4 (no clip)
   *   AGS = 72
   *   differential = round1((113/113) × (72 - 71)) = 1.0
   *
   * But if scores are 1 below par (3 per hole):
   *   AGS = 3 × 18 = 54
   *   differential = round1((113/113) × (54 - 71)) = round1(-17.0) = -17.0
   */
  it('returns deeply negative differential for a plus-HCP player shooting well below par', () => {
    const result = computeScoreDifferential({
      holes: makeHoles([], { strokes: 3, par: 4, strokeIndex: 0 }),
      courseHandicap: -4,
      slope: 113,
      courseRating: 71.0,
    });
    // AGS = 3 × 18 = 54; (113/113) × (54 − 71) = -17.0
    expect(result).toBe(-17.0);
  });
});
