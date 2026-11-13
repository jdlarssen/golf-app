// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  lastDayEntries,
  scheduledTodayRows,
  weekSummary,
  type ScheduledGameInput,
} from './morningReport';

// The server runs in UTC on Vercel; every Oslo-day rule here must hold there.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'UTC';
});
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

// ─── weekSummary ──────────────────────────────────────────────────────────

const week = (finished: number, extra: { byOthers?: number; publicSignups?: number } = {}) => ({
  finished,
  ...extra,
});

describe('weekSummary', () => {
  const trend = [6, 8, 7, 9, 11, 8, 10];

  it.each([
    ['more than last week', 14, 4],
    ['fewer than last week', 7, -3],
    ['as many as last week', 10, 0],
  ])('%s: the diff is this week minus last week', (_label, thisWeek, diff) => {
    const summary = weekSummary([
      ...trend.map((n) => week(n)),
      week(thisWeek, { byOthers: 9, publicSignups: 3 }),
    ]);
    expect(summary).toEqual({
      finished: thisWeek,
      diff,
      byOthers: 9,
      publicSignups: 3,
      trend: [...trend, thisWeek],
    });
  });

  it('leaves byOthers out when the week has no by_others field', () => {
    const summary = weekSummary([week(3), week(5, { publicSignups: 2 })]);
    expect(summary).not.toBeNull();
    expect(summary).not.toHaveProperty('byOthers');
    expect(summary?.publicSignups).toBe(2);
  });

  it('leaves publicSignups out when the week has no public_signups field', () => {
    const summary = weekSummary([week(3), week(5, { byOthers: 4 })]);
    expect(summary).not.toHaveProperty('publicSignups');
    expect(summary?.byOthers).toBe(4);
  });

  it('counts a missing previous week as zero', () => {
    expect(weekSummary([week(2)])).toEqual({ finished: 2, diff: 2, trend: [2] });
  });

  it('is null without any weeks', () => {
    expect(weekSummary([])).toBeNull();
  });
});

// ─── scheduledTodayRows ───────────────────────────────────────────────────

const game = (id: string, teeOffIso: string): ScheduledGameInput => ({
  id,
  name: `Runde ${id}`,
  scheduledTeeOffAt: teeOffIso,
});

describe('scheduledTodayRows', () => {
  // Friday 13 November 2026, 08:00 in Oslo (CET, UTC+1).
  const now = new Date('2026-11-13T07:00:00Z');

  it('keeps the rounds on the same Oslo date, sorted by tee-off, with their player counts', () => {
    const rows = scheduledTodayRows(
      [game('late-evening', '2026-11-13T16:30:00Z'), game('noon', '2026-11-13T11:00:00Z')],
      new Map([
        ['late-evening', 8],
        ['noon', 4],
      ]),
      now,
    );
    expect(rows.map((r) => [r.gameId, r.playerCount, r.late])).toEqual([
      ['noon', 4, false],
      ['late-evening', 8, false],
    ]);
  });

  it('drops 23:30 UTC, which is the next day in Oslo', () => {
    // 23:30 UTC = 00:30 Saturday in Oslo.
    const rows = scheduledTodayRows([game('saturday', '2026-11-13T23:30:00Z')], new Map(), now);
    expect(rows).toEqual([]);
  });

  it('drops 22:30 UTC the evening before, which is 23:30 yesterday in Oslo', () => {
    const rows = scheduledTodayRows([game('thursday', '2026-11-12T22:30:00Z')], new Map(), now);
    expect(rows).toEqual([]);
  });

  it('in summer (CEST), 22:30 UTC is the next Oslo day: tonight is dropped, last night is kept', () => {
    // Friday 10 July 2026, 09:00 in Oslo (UTC+2).
    const summerNow = new Date('2026-07-10T07:00:00Z');
    const rows = scheduledTodayRows(
      [game('tonight', '2026-07-10T22:30:00Z'), game('last-night', '2026-07-09T22:30:00Z')],
      new Map(),
      summerNow,
    );
    expect(rows.map((r) => [r.gameId, r.late])).toEqual([['last-night', true]]);
  });

  it('keeps 23:30 UTC the evening before, which is 00:30 today in Oslo, and marks it late', () => {
    const rows = scheduledTodayRows([game('just-past-midnight', '2026-11-12T23:30:00Z')], new Map(), now);
    expect(rows).toEqual([
      {
        gameId: 'just-past-midnight',
        name: 'Runde just-past-midnight',
        playerCount: 0,
        teeOffAt: '2026-11-12T23:30:00Z',
        late: true,
      },
    ]);
  });

  it('marks a round late once its tee-off has passed without a start', () => {
    const rows = scheduledTodayRows([game('missed', '2026-11-13T06:30:00Z')], new Map([['missed', 6]]), now);
    expect(rows[0]).toMatchObject({ gameId: 'missed', playerCount: 6, late: true });
  });

  it('is empty without scheduled rounds', () => {
    expect(scheduledTodayRows([], new Map(), now)).toEqual([]);
  });
});

// ─── lastDayEntries ───────────────────────────────────────────────────────

const entry = (ts: string) => ({ ts, id: ts });

describe('lastDayEntries', () => {
  // 00:20 Saturday 14 November in Oslo (CET): 23:20 UTC on the 13th.
  const now = new Date('2026-11-13T23:20:00Z');

  it('stamps an event on the same Oslo day with its Oslo time', () => {
    // 23:05 UTC = 00:05 Saturday in Oslo, the same Oslo day as now.
    expect(lastDayEntries([entry('2026-11-13T23:05:00Z')], now)).toEqual([
      { entry: entry('2026-11-13T23:05:00Z'), stamp: { kind: 'time', time: '00:05' } },
    ]);
  });

  it('stamps an event before Oslo midnight as yesterday, even though it is the same UTC day', () => {
    // 22:50 UTC = 23:50 Friday in Oslo.
    expect(lastDayEntries([entry('2026-11-13T22:50:00Z')], now)).toEqual([
      { entry: entry('2026-11-13T22:50:00Z'), stamp: { kind: 'yesterday' } },
    ]);
  });

  it('keeps the three newest events, newest first', () => {
    const rows = lastDayEntries(
      [
        entry('2026-11-13T10:00:00Z'),
        entry('2026-11-13T23:10:00Z'),
        entry('2026-11-13T20:00:00Z'),
        entry('2026-11-13T22:00:00Z'),
      ],
      now,
    );
    expect(rows.map((r) => r.entry.ts)).toEqual([
      '2026-11-13T23:10:00Z',
      '2026-11-13T22:00:00Z',
      '2026-11-13T20:00:00Z',
    ]);
  });

  // Staging holds a seeded game with ended_at weeks ahead; it sorted first
  // and read «i går» (#2345 staging run).
  it('drops events stamped after now', () => {
    expect(
      lastDayEntries([entry('2026-12-01T12:00:00Z'), entry('2026-11-13T23:10:00Z')], now).map(
        (r) => r.entry.ts,
      ),
    ).toEqual(['2026-11-13T23:10:00Z']);
  });

  it('drops events older than 24 hours', () => {
    expect(lastDayEntries([entry('2026-11-12T23:19:00Z')], now)).toEqual([]);
  });

  it('is empty without events', () => {
    expect(lastDayEntries([], now)).toEqual([]);
  });
});
