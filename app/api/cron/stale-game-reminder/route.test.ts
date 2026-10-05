// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2203): the stale sweep's orchestration — the candidate filter it
 * gives the database, the cap on the batch, and what one game's outcome does
 * to the others.
 *
 * What this file deliberately does NOT re-assert: when a round is stale
 * (`lib/games/organizerNoticeRules.test.ts`), the claim and the send per game
 * (`lib/notifications/organizerNotices.test.ts`), and the cron gate's two
 * refusals (`lib/cron/auth.test.ts`). The gate is NOT mocked, so the wiring is
 * proven.
 */

let pending: { data?: unknown; error?: { message: string } | null };

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'games') return pending;
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
vi.mock('@/lib/notifications/organizerNotices', () => ({
  runStaleGameReminderForGame: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { runStaleGameReminderForGame } from '@/lib/notifications/organizerNotices';
import { POST } from './route';

const runMock = vi.mocked(runStaleGameReminderForGame);

function cronRequest(headers: Record<string, string> = { authorization: 'Bearer test-secret' }) {
  return new NextRequest('http://localhost/api/cron/stale-game-reminder', {
    method: 'POST',
    headers,
  });
}

function game(id: string) {
  return { id, name: `Spill ${id}`, created_by: 'arrangor', started_at: '2026-10-01T08:00:00.000Z' };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  process.env.CRON_SECRET = 'test-secret';
  pending = { data: [] };
  runMock.mockResolvedValue({ reminded: true });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('POST /api/cron/stale-game-reminder — the gate', () => {
  it('without CRON_SECRET: 500, and the database is not touched', async () => {
    delete process.env.CRON_SECRET;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(cronRequest());

    expect(res.status).toBe(500);
    expect(fake.ops).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('[staleGameReminder] CRON_SECRET not set');
    errorSpy.mockRestore();
  });

  it('wrong Authorization: 401 before anything is read', async () => {
    const res = await POST(cronRequest({ authorization: 'Bearer wrong' }));

    expect(res.status).toBe(401);
    expect(fake.ops).toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/stale-game-reminder — the candidates', () => {
  it('asks for active, non-cup, non-derived games with an organiser, unreminded, started over a day ago, oldest first, capped', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T12:00:00.000Z'));
    await POST(cronRequest());
    vi.useRealTimers();

    const [read, ...extra] = fake.ops;
    expect(extra).toEqual([]);
    expect(read.table).toBe('games');
    expect(read.columns).toBe('id, name, created_by, started_at');
    // The same predicate as 0205's EXISTS gate. Change one, change both.
    expect(read.filters).toEqual([
      { op: 'eq', column: 'status', value: 'active' },
      { op: 'is', column: 'source_game_id', value: null },
      { op: 'is', column: 'tournament_id', value: null },
      { op: 'not', column: 'created_by', value: null },
      { op: 'is', column: 'organizer_stale_reminder_sent_at', value: null },
      { op: 'lt', column: 'started_at', value: '2026-10-04T12:00:00.000Z' },
    ]);
    expect(read.range).toEqual([0, 24]);
  });

  it('runs exactly the games the database gave, and counts the reminders', async () => {
    pending = { data: [game('a'), game('b'), game('c')] };
    runMock.mockResolvedValueOnce({ reminded: true });
    runMock.mockResolvedValueOnce({ reminded: false });

    const res = await POST(cronRequest());

    expect(runMock.mock.calls.map((c) => c[1].id)).toEqual(['a', 'b', 'c']);
    await expect(res.json()).resolves.toEqual({ ok: true, checked: 3, reminded: 2, failed: [] });
  });

  it('one game that throws does not stop the others', async () => {
    pending = { data: [game('a'), game('b')] };
    runMock.mockRejectedValueOnce(new Error('connection reset'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(cronRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      checked: 2,
      reminded: 1,
      failed: [{ id: 'a', error: 'connection reset' }],
    });
    expect(errorSpy).toHaveBeenCalledWith('[staleGameReminder] game a failed', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('the candidate query fails: 500, no game is run', async () => {
    pending = { error: { message: 'boom' } };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(cronRequest());

    expect(res.status).toBe(500);
    expect(runMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
