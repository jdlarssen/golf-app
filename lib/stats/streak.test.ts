import { describe, it, expect } from 'vitest';
import { computeStreak, roundStreakGrowth } from './streak';

/**
 * Type A — pure logic. `computeStreak` derives a positive streak state from a
 * player's finished-round dates, bucketed on Oslo-ISO weeks (DST-stable via the
 * shared Oslo primitives). Every row of the contract's edge table is a case
 * here. `now` is always injected — no clock reads, no fake timers.
 *
 * Fixture dates use noon UTC (≈13–14 Oslo) so the instant's Oslo calendar date
 * is unambiguous, except the DST cases which deliberately probe the boundary.
 *
 * Grounded ISO-week facts used below (Europe/Oslo wall-clock):
 *  - 2026 wk28 = Mon 2026-07-06 … Sun 2026-07-12; wk27 Mon 06-29; wk26 Mon 06-22;
 *    wk25 Mon 06-15; wk24 Mon 06-08.
 *  - ISO 2020-W53 = Mon 2020-12-28 … Sun 2021-01-03; ISO 2021-W01 = Mon 2021-01-04.
 *  - ISO 2025-W01 = Mon 2024-12-30 … Sun 2025-01-05 (spans the calendar year).
 *  - DST starts Sun 2026-03-29 (wk13 = Mon 03-23…Sun 03-29, wk14 = Mon 03-30…);
 *    DST ends Sun 2026-10-25 (wk43 = Mon 10-19…Sun 10-25).
 */

const d = (iso: string) => new Date(iso);

// A Saturday in 2026 wk28 — the canonical "now" for the mid-2026 cases.
const NOW = d('2026-07-11T12:00:00Z');

describe('computeStreak — empty / single', () => {
  it('empty history: everything zero, nothing active, no last week', () => {
    expect(computeStreak({ dates: [], now: NOW })).toEqual({
      weeklyStreak: 0,
      weeklyStreakActive: false,
      roundsThisSeason: 0,
      roundsInStreak: 0,
      lastRoundWeekKey: null,
    });
  });

  it('one round this week: streak 1, active, one round in streak', () => {
    const out = computeStreak({ dates: [d('2026-07-08T12:00:00Z')], now: NOW });
    expect(out.weeklyStreak).toBe(1);
    expect(out.weeklyStreakActive).toBe(true);
    expect(out.roundsInStreak).toBe(1);
    expect(out.roundsThisSeason).toBe(1);
    expect(out.lastRoundWeekKey).toBe('2026-W28');
  });
});

describe('computeStreak — same-week idempotence', () => {
  it('two rounds the same week count as ONE week but TWO rounds', () => {
    const out = computeStreak({
      dates: [d('2026-07-07T12:00:00Z'), d('2026-07-09T12:00:00Z')],
      now: NOW,
    });
    expect(out.weeklyStreak).toBe(1);
    expect(out.roundsInStreak).toBe(2);
  });

  it('two rounds the same day behave like the same week', () => {
    const out = computeStreak({
      dates: [d('2026-07-08T08:00:00Z'), d('2026-07-08T16:00:00Z')],
      now: NOW,
    });
    expect(out.weeklyStreak).toBe(1);
    expect(out.roundsInStreak).toBe(2);
  });
});

describe('computeStreak — consecutive runs and gaps', () => {
  it('counts consecutive weeks ending at the last round', () => {
    const out = computeStreak({
      dates: [
        d('2026-06-22T12:00:00Z'), // wk26
        d('2026-06-29T12:00:00Z'), // wk27
        d('2026-07-08T12:00:00Z'), // wk28 (last)
      ],
      now: NOW,
    });
    expect(out.weeklyStreak).toBe(3);
    expect(out.roundsInStreak).toBe(3);
    expect(out.weeklyStreakActive).toBe(true);
  });

  it('a gap breaks the run; streak = the run ending at the last round', () => {
    // wk24, [gap wk25], wk26, wk27, wk28 — the run ending at wk28 is 3 weeks;
    // the isolated wk24 round is beyond the gap and excluded.
    const out = computeStreak({
      dates: [
        d('2026-06-08T12:00:00Z'), // wk24 (orphaned by the gap)
        d('2026-06-22T12:00:00Z'), // wk26
        d('2026-06-29T12:00:00Z'), // wk27
        d('2026-07-08T12:00:00Z'), // wk28 (last)
      ],
      now: NOW,
    });
    expect(out.weeklyStreak).toBe(3);
    expect(out.roundsInStreak).toBe(3); // the wk24 round is NOT in the streak
  });
});

describe('computeStreak — grace and silent reset', () => {
  it('last round previous week, this week empty: still active (grace)', () => {
    const out = computeStreak({
      dates: [d('2026-07-01T12:00:00Z')], // wk27, previous week
      now: NOW,
    });
    expect(out.weeklyStreak).toBe(1);
    expect(out.weeklyStreakActive).toBe(true);
    expect(out.lastRoundWeekKey).toBe('2026-W27');
  });

  it('last round older than previous week: run preserved but NOT active', () => {
    const out = computeStreak({
      dates: [
        d('2026-06-15T12:00:00Z'), // wk25
        d('2026-06-22T12:00:00Z'), // wk26 (last — two weeks before now's wk28)
      ],
      now: NOW,
    });
    expect(out.weeklyStreak).toBe(2); // historical run length is honest…
    expect(out.weeklyStreakActive).toBe(false); // …but not shown as ongoing
  });
});

describe('computeStreak — year boundary (ISO week continuity)', () => {
  it('a streak continues across the calendar-year boundary (W53 → W01)', () => {
    const out = computeStreak({
      dates: [
        d('2020-12-30T12:00:00Z'), // ISO 2020-W53
        d('2021-01-06T12:00:00Z'), // ISO 2021-W01 (consecutive)
      ],
      now: d('2021-01-08T12:00:00Z'), // ISO 2021-W01
    });
    expect(out.weeklyStreak).toBe(2);
    expect(out.weeklyStreakActive).toBe(true);
    expect(out.lastRoundWeekKey).toBe('2021-W01');
    // Season = Oslo calendar year of `now` (2021): only the January round counts.
    expect(out.roundsThisSeason).toBe(1);
  });

  it('one ISO week spanning the year change counts as a single week', () => {
    const out = computeStreak({
      dates: [
        d('2024-12-31T12:00:00Z'), // ISO 2025-W01 (calendar year 2024)
        d('2025-01-02T12:00:00Z'), // ISO 2025-W01 (calendar year 2025)
      ],
      now: d('2025-01-03T12:00:00Z'), // ISO 2025-W01
    });
    expect(out.weeklyStreak).toBe(1); // same ISO week despite differing cal years
    expect(out.roundsInStreak).toBe(2);
    expect(out.lastRoundWeekKey).toBe('2025-W01');
    // Season counts calendar-year rounds: only the 2025 round.
    expect(out.roundsThisSeason).toBe(1);
  });
});

describe('computeStreak — DST stability', () => {
  it('consecutive weeks across the spring DST change are not broken', () => {
    const out = computeStreak({
      dates: [
        d('2026-03-27T12:00:00Z'), // wk13 (CET, before DST)
        d('2026-04-01T12:00:00Z'), // wk14 (CEST, after DST)
      ],
      now: d('2026-04-02T12:00:00Z'), // wk14
    });
    expect(out.weeklyStreak).toBe(2);
    expect(out.weeklyStreakActive).toBe(true);
  });

  it('two rounds either side of the autumn fall-back stay in the same Oslo week', () => {
    // 2026-10-25 is the DST-end Sunday (wk43). One round just after midnight
    // (CEST, +02:00) and one late evening (CET, +01:00) — both Oslo 2026-10-25.
    const out = computeStreak({
      dates: [
        d('2026-10-25T00:30:00+02:00'),
        d('2026-10-25T23:30:00+01:00'),
      ],
      now: d('2026-10-26T12:00:00Z'), // wk44 (next week — grace keeps it active)
    });
    expect(out.weeklyStreak).toBe(1);
    expect(out.roundsInStreak).toBe(2);
    expect(out.weeklyStreakActive).toBe(true);
  });
});

describe('roundStreakGrowth — celebrate only genuine growth', () => {
  const now = NOW;

  it('the very first round does not grow (a 1-week "streak" is not celebrated)', () => {
    const out = roundStreakGrowth({
      datesWithout: [],
      newDate: d('2026-07-08T12:00:00Z'),
      now,
    });
    expect(out.grew).toBe(false);
    expect(out.weeklyStreak).toBe(1);
  });

  it('a round in the next consecutive week grows the streak to 2', () => {
    const out = roundStreakGrowth({
      datesWithout: [d('2026-06-29T12:00:00Z')], // wk27
      newDate: d('2026-07-08T12:00:00Z'), // wk28
      now,
    });
    expect(out.grew).toBe(true);
    expect(out.weeklyStreak).toBe(2);
  });

  it('a second round in the same week does not grow the weekly streak', () => {
    const out = roundStreakGrowth({
      datesWithout: [d('2026-07-07T12:00:00Z')], // wk28
      newDate: d('2026-07-09T12:00:00Z'), // wk28
      now,
    });
    expect(out.grew).toBe(false);
    expect(out.weeklyStreak).toBe(1);
  });

  it('a round after a multi-week gap restarts quietly (no growth, no shame)', () => {
    const out = roundStreakGrowth({
      datesWithout: [d('2026-06-08T12:00:00Z')], // wk24, long ago
      newDate: d('2026-07-08T12:00:00Z'), // wk28
      now,
    });
    expect(out.grew).toBe(false);
    expect(out.weeklyStreak).toBe(1);
  });

  it('extending a run to three weeks grows and reports 3', () => {
    const out = roundStreakGrowth({
      datesWithout: [
        d('2026-06-22T12:00:00Z'), // wk26
        d('2026-06-29T12:00:00Z'), // wk27
      ],
      newDate: d('2026-07-08T12:00:00Z'), // wk28
      now,
    });
    expect(out.grew).toBe(true);
    expect(out.weeklyStreak).toBe(3);
  });
});
