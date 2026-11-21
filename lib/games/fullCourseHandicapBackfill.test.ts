import { describe, expect, it } from 'vitest';
import {
  indexCandidates,
  planFullCourseHandicap,
  type FullCourseHandicapInput,
} from './fullCourseHandicapBackfill';

// Type A. The backfill (0254, F1) recovers the full course handicap for rows
// frozen before the column existed. It trusts the frozen playing handicap and
// accepts an index only when one of the app's freeze formulas turns it into
// exactly that frozen number.

// League tee 125 / 70,0 / 72: index 30,0 → raw 31,19 → course handicap 31;
// 75 % = 23,39 → 23; index 12,1 → raw 11,385 → 11; 75 % = 8,54 → 9.
const LEAGUE = { slope: 125, courseRating: 70, par: 72 };

function input(overrides: Partial<FullCourseHandicapInput> = {}): FullCourseHandicapInput {
  return {
    gameMode: 'stableford',
    storedPct: 75,
    storedMaxStrokes: 32,
    frozenCourseHandicap: 23,
    rating: LEAGUE,
    candidates: [{ hcpIndex: 30.0, source: 'history_at_start' }],
    ...overrides,
  };
}

describe('planFullCourseHandicap', () => {
  it('no frozen playing handicap → nothing to recover', () => {
    expect(planFullCourseHandicap(input({ frozenCourseHandicap: null }))).toBeNull();
  });

  it('100 % with no cap ever possible: the frozen number is the full one', () => {
    expect(
      planFullCourseHandicap(
        input({ storedPct: 100, storedMaxStrokes: null, frozenCourseHandicap: 17, candidates: [] }),
      ),
    ).toEqual({ fullCourseHandicap: 17, source: 'frozen_at_100' });
  });

  it('a format with its own percentage froze the full number (stored 100)', () => {
    expect(
      planFullCourseHandicap(
        input({
          gameMode: 'fourball_matchplay',
          storedPct: 100,
          storedMaxStrokes: null,
          frozenCourseHandicap: 12,
          candidates: [],
        }),
      ),
    ).toEqual({ fullCourseHandicap: 12, source: 'frozen_at_100' });
  });

  it('a reduced game takes the index that reproduces the frozen playing handicap', () => {
    expect(planFullCourseHandicap(input())).toEqual({
      fullCourseHandicap: 31,
      source: 'history_at_start',
    });
  });

  it('the first matching candidate wins, in the order given', () => {
    expect(
      planFullCourseHandicap(
        input({
          candidates: [
            { hcpIndex: 12.1, source: 'history_at_start' }, // 9 ≠ 23
            { hcpIndex: 30.0, source: 'profile_now' }, // 23 ✓
            { hcpIndex: 30.4, source: 'history_other' },
          ],
        }),
      ),
    ).toEqual({ fullCourseHandicap: 31, source: 'profile_now' });
  });

  it('no candidate reproduces the frozen number → unresolved', () => {
    expect(
      planFullCourseHandicap(input({ candidates: [{ hcpIndex: 12.1, source: 'profile_now' }] })),
    ).toBeNull();
  });

  it('no tee rating → unresolved (unless the frozen number is already full)', () => {
    expect(planFullCourseHandicap(input({ rating: null }))).toBeNull();
  });

  it('the cap: index 54 at 75 % with a cap of 32 froze 32; the full number is 58', () => {
    // 54 × 125/113 − 2 = 57,73 → 58; 75 % = 43,3 → 43, and the cap makes it 32.
    expect(
      planFullCourseHandicap(
        input({ frozenCourseHandicap: 32, candidates: [{ hcpIndex: 54, source: 'profile_now' }] }),
      ),
    ).toEqual({ fullCourseHandicap: 58, source: 'profile_now' });
  });

  it('before #2924: the share of the rounded course handicap also counts as a match', () => {
    // 125 / 71,0 / 71 at 85 %: index 8,6 → raw 9,513. Today 8,09 → 8; before
    // #2924 round(9,513) = 10 → 8,5 → 9 was frozen. Full number 10 either way.
    const rulebookTee = { slope: 125, courseRating: 71, par: 71 };
    expect(
      planFullCourseHandicap(
        input({
          storedPct: 85,
          storedMaxStrokes: null,
          rating: rulebookTee,
          frozenCourseHandicap: 9,
          candidates: [{ hcpIndex: 8.6, source: 'history_at_start' }],
        }),
      ),
    ).toEqual({ fullCourseHandicap: 10, source: 'history_at_start' });
  });

  it('before #2210: a stale stored share on an own-percentage format also counts', () => {
    // Fourball stored with 85 % from an earlier format choice, frozen with it:
    // index 20 on 113/72/72 → 20 → 17. Today the effective share is 100 %.
    expect(
      planFullCourseHandicap(
        input({
          gameMode: 'fourball_matchplay',
          storedPct: 85,
          storedMaxStrokes: null,
          rating: { slope: 113, courseRating: 72, par: 72 },
          frozenCourseHandicap: 17,
          candidates: [{ hcpIndex: 20, source: 'profile_now' }],
        }),
      ),
    ).toEqual({ fullCourseHandicap: 20, source: 'profile_now' });
  });

  it('an older freeze of the full number on a reduced game also counts', () => {
    // Shamble stored with 0 %, but the row was frozen at 18, the full course
    // handicap of index 18 on 113/72/72 (shamble kept the full number before #2570).
    expect(
      planFullCourseHandicap(
        input({
          gameMode: 'shamble',
          storedPct: 0,
          storedMaxStrokes: null,
          rating: { slope: 113, courseRating: 72, par: 72 },
          frozenCourseHandicap: 18,
          candidates: [{ hcpIndex: 18.2, source: 'history_at_start' }],
        }),
      ),
    ).toEqual({ fullCourseHandicap: 18, source: 'history_at_start' });
  });

  it('the game\'s own share beats an older full-number freeze, whatever the candidate order', () => {
    // Index 22,3 on the league tee is course handicap 23: at share 100 it
    // «reproduces» the frozen 23. Index 30,0 reproduces it at 75 %, and wins.
    expect(
      planFullCourseHandicap(
        input({
          candidates: [
            { hcpIndex: 22.3, source: 'history_at_start' },
            { hcpIndex: 30.0, source: 'profile_now' },
          ],
        }),
      ),
    ).toEqual({ fullCourseHandicap: 31, source: 'profile_now' });
  });

  it('a plus handicap: the full number keeps its sign', () => {
    // −2,2 × 140/113 + 0,5 = −2,23 → −2; 75 % = −1,67 → −2.
    expect(
      planFullCourseHandicap(
        input({
          storedMaxStrokes: null,
          rating: { slope: 140, courseRating: 71.5, par: 71 },
          frozenCourseHandicap: -2,
          candidates: [{ hcpIndex: -2.2, source: 'profile_now' }],
        }),
      ),
    ).toEqual({ fullCourseHandicap: -2, source: 'profile_now' });
  });
});

describe('indexCandidates', () => {
  const START = '2026-10-10T10:00:00Z';
  const history = [
    { hcp_index: 31.0, recorded_at: '2026-09-01T08:00:00Z' },
    { hcp_index: 30.0, recorded_at: '2026-10-01T08:00:00Z' },
    { hcp_index: 28.5, recorded_at: '2026-10-20T08:00:00Z' },
  ];

  it('the index valid at the start first, then the profile, then the rest newest first, each value once', () => {
    expect(indexCandidates({ startedAt: START, history, profileIndex: 28.5 })).toEqual([
      { hcpIndex: 30.0, source: 'history_at_start' },
      { hcpIndex: 28.5, source: 'profile_now' },
      { hcpIndex: 31.0, source: 'history_other' },
    ]);
  });

  it('no history before the start and no start time: the profile, then the history', () => {
    expect(
      indexCandidates({ startedAt: null, history: history.slice(2), profileIndex: 27 }),
    ).toEqual([
      { hcpIndex: 27, source: 'profile_now' },
      { hcpIndex: 28.5, source: 'history_other' },
    ]);
  });

  it('numeric strings from PostgREST are read as numbers; a missing profile index is left out', () => {
    expect(
      indexCandidates({
        startedAt: START,
        history: [{ hcp_index: '30.0', recorded_at: '2026-10-01T08:00:00Z' }],
        profileIndex: null,
      }),
    ).toEqual([{ hcpIndex: 30, source: 'history_at_start' }]);
  });
});
