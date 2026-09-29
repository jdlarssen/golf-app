import { describe, it, expect } from 'vitest';
import { seasonHandicapTrend } from './handicapTrend';

/** Type A (#2256): the bag-tag's season curve and «−x denne sesongen». */

const at = (month: number, day: number, year = 2026) => new Date(year, month, day, 12).toISOString();

describe('seasonHandicapTrend', () => {
  it('starts the season from the last value before the year began', () => {
    const trend = seasonHandicapTrend(
      [
        { hcpIndex: 18.0, recordedAt: at(5, 1, 2025) },
        { hcpIndex: 16.8, recordedAt: at(10, 3, 2025) },
        { hcpIndex: 15.9, recordedAt: at(4, 2) },
        { hcpIndex: 14.2, recordedAt: at(8, 20) },
      ],
      2026,
    );
    expect(trend).toEqual({ points: [16.8, 15.9, 14.2], change: -2.6 });
  });

  it('starts from the first value this year when there is nothing before', () => {
    const trend = seasonHandicapTrend(
      [
        { hcpIndex: 20.1, recordedAt: at(3, 10) },
        { hcpIndex: 21.3, recordedAt: at(6, 1) },
      ],
      2026,
    );
    expect(trend).toEqual({ points: [20.1, 21.3], change: 1.2 });
  });

  it('draws in time order whatever order the rows came in', () => {
    const trend = seasonHandicapTrend(
      [
        { hcpIndex: 12.0, recordedAt: at(8, 1) },
        { hcpIndex: 14.0, recordedAt: at(2, 1) },
      ],
      2026,
    );
    expect(trend?.points).toEqual([14.0, 12.0]);
  });

  it('counts a plus handicap as better, across zero', () => {
    // Stored signed: -1.0 is a plus handicap of 1,0.
    const trend = seasonHandicapTrend(
      [
        { hcpIndex: 2.0, recordedAt: at(3, 1) },
        { hcpIndex: -1.0, recordedAt: at(7, 1) },
      ],
      2026,
    );
    expect(trend?.change).toBe(-3);
  });

  it('gives a plain 0 when the season ends where it began', () => {
    const trend = seasonHandicapTrend(
      [
        { hcpIndex: 10.0, recordedAt: at(3, 1) },
        { hcpIndex: 11.0, recordedAt: at(5, 1) },
        { hcpIndex: 10.0, recordedAt: at(7, 1) },
      ],
      2026,
    );
    expect(Object.is(trend?.change, 0)).toBe(true);
  });

  it('has no curve with fewer than two points in the season', () => {
    expect(seasonHandicapTrend([], 2026)).toBeNull();
    expect(seasonHandicapTrend([{ hcpIndex: 14.2, recordedAt: at(8, 1) }], 2026)).toBeNull();
    // Only history from earlier years, nothing this season: one start point.
    expect(
      seasonHandicapTrend(
        [
          { hcpIndex: 18.0, recordedAt: at(5, 1, 2024) },
          { hcpIndex: 16.0, recordedAt: at(5, 1, 2025) },
        ],
        2026,
      ),
    ).toBeNull();
  });

  it('skips a row it cannot date', () => {
    const trend = seasonHandicapTrend(
      [
        { hcpIndex: 15.0, recordedAt: 'ikke en dato' },
        { hcpIndex: 14.0, recordedAt: at(3, 1) },
        { hcpIndex: 13.0, recordedAt: at(5, 1) },
      ],
      2026,
    );
    expect(trend?.points).toEqual([14.0, 13.0]);
  });
});
