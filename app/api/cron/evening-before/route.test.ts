// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2483): the evening sweep's orchestration: closed before 18:00 Oslo,
 * the candidate filter it gives the database, the cap, and what one round's
 * outcome does to the others.
 *
 * Not re-asserted here: when the varsel is due
 * (`lib/games/eveningBeforeRules.test.ts`), the claim and the send per round
 * (`lib/notifications/eveningStatusNotice.test.ts`), and the cron gate's
 * refusals (`lib/cron/auth.test.ts`). The gate is NOT mocked, so the wiring is
 * proven.
 */

let pending: { data?: unknown; error?: { message: string } | null };

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'games') return pending;
  throw new Error(`unexpected query: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
const runMock = vi.fn(async (..._args: unknown[]) => ({ notified: true }));
vi.mock('@/lib/notifications/eveningStatusNotice', () => ({
  runEveningNoticeForGame: (...args: unknown[]) => runMock(...args),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

function cronRequest(headers: Record<string, string> = { authorization: 'Bearer test-secret' }) {
  return new NextRequest('http://localhost/api/cron/evening-before', { method: 'POST', headers });
}

function game(id: string) {
  return { id, name: `Runde ${id}`, created_by: 'arrangor' };
}

// Friday 20 November 2026: 19:00 Oslo is 18:00Z (winter).
const EVENING = new Date('2026-11-20T18:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  process.env.CRON_SECRET = 'test-secret';
  pending = { data: [] };
  runMock.mockResolvedValue({ notified: true });
  vi.useFakeTimers();
  vi.setSystemTime(EVENING);
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CRON_SECRET;
});

describe('POST /api/cron/evening-before — the gate', () => {
  it('wrong Authorization: 401 before anything is read', async () => {
    const res = await POST(cronRequest({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
    expect(fake.ops).toEqual([]);
  });

  it('before 18:00 Oslo the sweep reads nothing', async () => {
    vi.setSystemTime(new Date('2026-11-20T16:59:00.000Z'));
    const res = await POST(cronRequest());
    await expect(res.json()).resolves.toEqual({ ok: true, checked: 0, notified: 0, failed: [] });
    expect(fake.ops).toEqual([]);
  });
});

describe('POST /api/cron/evening-before — the candidates', () => {
  it('asks for the rounds the rule can say yes to tonight, capped', async () => {
    await POST(cronRequest());

    const [read, ...extra] = fake.ops;
    expect(extra).toEqual([]);
    expect(read.table).toBe('games');
    // The same predicates as 0242's EXISTS gate and `isEveningNoticeDue`.
    expect(read.filters).toEqual([
      { op: 'eq', column: 'status', value: 'scheduled' },
      { op: 'is', column: 'tournament_id', value: null },
      { op: 'is', column: 'source_game_id', value: null },
      { op: 'is', column: 'league_round_id', value: null },
      { op: 'not', column: 'created_by', value: null },
      { op: 'is', column: 'organizer_evening_notice_sent_at', value: null },
      { op: 'gt', column: 'scheduled_tee_off_at', value: '2026-11-20T18:00:00.000Z' },
      { op: 'lt', column: 'scheduled_tee_off_at', value: '2026-11-22T18:00:00.000Z' },
      { op: 'lt', column: 'created_at', value: '2026-11-20T17:00:00.000Z' },
    ]);
    expect(read.range).toEqual([0, 49]);
  });

  it('runs exactly the rounds the database gave, at one `now`, and counts the varsler', async () => {
    pending = { data: [game('a'), game('b'), game('c')] };
    runMock.mockResolvedValueOnce({ notified: true });
    runMock.mockResolvedValueOnce({ notified: false });

    const res = await POST(cronRequest());

    expect(runMock.mock.calls.map((c) => (c[1] as { id: string }).id)).toEqual(['a', 'b', 'c']);
    expect(new Set(runMock.mock.calls.map((c) => c[2]))).toEqual(new Set([EVENING.getTime()]));
    await expect(res.json()).resolves.toEqual({ ok: true, checked: 3, notified: 2, failed: [] });
  });

  it('one round that throws does not stop the others', async () => {
    pending = { data: [game('a'), game('b')] };
    runMock.mockRejectedValueOnce(new Error('connection reset'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(cronRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      checked: 2,
      notified: 1,
      failed: [{ id: 'a', error: 'connection reset' }],
    });
    errorSpy.mockRestore();
  });

  it('the candidate query fails: 500, no round is run', async () => {
    pending = { error: { message: 'boom' } };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(cronRequest());

    expect(res.status).toBe(500);
    expect(runMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
