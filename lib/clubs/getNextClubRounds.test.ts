import { beforeEach, describe, expect, it, vi } from 'vitest';

// Type A: which date each club row gets as «neste runde» (#2493). The club
// query is the boundary, faked in memory with the same filters, order and
// window as the real one (`getUpcomingClubGames`), so the test sees what the
// database would hand back.
type Row = { id: string; group_id: string; status: string; scheduled_tee_off_at: string | null };
let ROWS: Row[] = [];
let failFor: string | null = null;
const upcoming = vi.fn(
  async (clubIds: string[], opts: { teeOffFrom?: string; limit?: number } = {}) => {
    if (failFor && clubIds.includes(failFor)) return { data: null, error: { message: 'boom' } };
    const data = ROWS.filter((r) => clubIds.includes(r.group_id) && r.status === 'scheduled')
      .filter((r) => !opts.teeOffFrom || (r.scheduled_tee_off_at !== null && r.scheduled_tee_off_at >= opts.teeOffFrom))
      .sort((a, b) =>
        a.scheduled_tee_off_at === b.scheduled_tee_off_at
          ? 0
          : a.scheduled_tee_off_at === null
            ? 1
            : b.scheduled_tee_off_at === null
              ? -1
              : a.scheduled_tee_off_at < b.scheduled_tee_off_at
                ? -1
                : 1,
      )
      .slice(0, opts.limit ?? 50);
    return { data, error: null };
  },
);
vi.mock('@/lib/games/getUpcomingClubGames', () => ({ getUpcomingClubGames: upcoming }));

const { getNextClubRounds } = await import('./getNextClubRounds');

const NOW = new Date('2026-10-05T10:00:00.000Z');
const round = (id: string, club: string, tee: string | null, status = 'scheduled'): Row => ({
  id,
  group_id: club,
  status,
  scheduled_tee_off_at: tee,
});

beforeEach(() => {
  ROWS = [];
  failFor = null;
  upcoming.mockClear();
});

describe('getNextClubRounds', () => {
  it('finds each club its own next round, even when another club has 50 old planned rounds', async () => {
    ROWS = [
      ...Array.from({ length: 50 }, (_, i) =>
        round(`old-${i}`, 'busy', `2026-09-${String((i % 28) + 1).padStart(2, '0')}T08:00:00.000Z`),
      ),
      round('busy-next', 'busy', '2026-10-10T08:00:00.000Z'),
      round('quiet-next', 'quiet', '2026-10-24T08:00:00.000Z'),
    ];
    const res = await getNextClubRounds(['busy', 'quiet'], NOW);
    expect(res).toEqual({
      ok: true,
      next: new Map([
        ['busy', '2026-10-10T08:00:00.000Z'],
        ['quiet', '2026-10-24T08:00:00.000Z'],
      ]),
    });
  });

  it('finds the quiet club its round when a busy club has 50 coming rounds before it', async () => {
    ROWS = [
      ...Array.from({ length: 50 }, (_, i) =>
        round(`soon-${i}`, 'busy', `2026-10-${String(6 + (i % 17)).padStart(2, '0')}T${String(8 + Math.floor(i / 17)).padStart(2, '0')}:00:00.000Z`),
      ),
      round('quiet-next', 'quiet', '2026-10-24T08:00:00.000Z'),
    ];
    const res = await getNextClubRounds(['busy', 'quiet'], NOW);
    expect(res.ok && res.next.get('quiet')).toBe('2026-10-24T08:00:00.000Z');
  });

  it('counts a round teeing off right now, skips passed ones and rounds without a time; none left → null', async () => {
    ROWS = [
      round('passed', 'a', '2026-10-05T09:59:59.000Z'),
      round('now', 'a', '2026-10-05T10:00:00.000Z'),
      round('later', 'a', '2026-10-06T10:00:00.000Z'),
      round('no-time', 'b', null),
      round('draft', 'b', '2026-10-07T10:00:00.000Z', 'draft'),
    ];
    const res = await getNextClubRounds(['a', 'b', 'c'], NOW);
    expect(res).toEqual({
      ok: true,
      next: new Map([
        ['a', '2026-10-05T10:00:00.000Z'],
        ['b', null],
        ['c', null],
      ]),
    });
  });

  it('a failed read for any club is a failed read, not «ingen runder satt opp» (#2490)', async () => {
    ROWS = [round('x', 'a', '2026-10-06T10:00:00.000Z')];
    failFor = 'b';
    await expect(getNextClubRounds(['a', 'b'], NOW)).resolves.toEqual({ ok: false });
  });

  it('no clubs, no reads', async () => {
    await expect(getNextClubRounds([], NOW)).resolves.toEqual({ ok: true, next: new Map() });
    expect(upcoming).not.toHaveBeenCalled();
  });
});
