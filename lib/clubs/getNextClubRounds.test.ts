import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordingClient, type QueryCall } from '@/tests/queryBuilderMock';

// Type A: which date each club row gets as «neste runde» (#2493). The real
// `getUpcomingClubGames` runs; the boundary is the service-role client
// (shared `recordingClient`), and each query is answered from `ROWS` by the
// filters it actually sent: group ids, status, earliest tee-off, order and
// window.
type Row = { id: string; group_id: string; status: string; scheduled_tee_off_at: string | null };
let ROWS: Row[] = [];
let failFor: string | null = null;

const arg = (calls: QueryCall[], method: string, column: string) =>
  calls.find((c) => c[0] === method && c[1] === column)?.[2];

function answer(calls: QueryCall[]) {
  const clubIds = arg(calls, 'in', 'group_id') as string[];
  if (failFor && clubIds.includes(failFor)) return { data: null, error: { message: 'boom' } };
  const status = arg(calls, 'eq', 'status');
  const from = arg(calls, 'gte', 'scheduled_tee_off_at') as string | undefined;
  const limit = (calls.find((c) => c[0] === 'limit')?.[1] as number | undefined) ?? Infinity;
  const tee = (r: Row) => r.scheduled_tee_off_at;
  const data = ROWS.filter((r) => clubIds.includes(r.group_id) && r.status === status)
    .filter((r) => from === undefined || (tee(r) !== null && tee(r)! >= from))
    // ascending, rows without a tee-off last (nullsFirst: false)
    .sort((a, b) => (tee(a) === tee(b) ? 0 : tee(a) === null ? 1 : tee(b) === null ? -1 : tee(a)! < tee(b)! ? -1 : 1))
    .slice(0, limit);
  return { data, error: null };
}

const db = recordingClient(answer);
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => db.client }));

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
  db.reset();
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
    // One query per club, each one row from now on.
    expect(
      db.queries.map((q) => [arg(q, 'in', 'group_id'), arg(q, 'gte', 'scheduled_tee_off_at'), q.find((c) => c[0] === 'limit')?.[1]]),
    ).toEqual([
      [['busy'], NOW.toISOString(), 1],
      [['quiet'], NOW.toISOString(), 1],
    ]);
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
    expect(db.queries).toEqual([]);
  });
});
