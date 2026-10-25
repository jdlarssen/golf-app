// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';
import { recordingClient } from '@/tests/queryBuilderMock';

/**
 * Type A (#2638 Del 3): the league round sweep's orchestration — the
 * candidate filter it gives the database, the cap on the batch, and what one
 * round's outcome does to the others.
 *
 * What this file deliberately does NOT re-assert: when a message is due and
 * who gets it (`lib/league/roundNotices.test.ts`), the claim and the send per
 * round (`lib/notifications/leagueRoundNotices.test.ts`), and the cron gate's
 * two refusals (`lib/cron/auth.test.ts`). The gate is NOT mocked, so the
 * wiring is proven.
 */

let pending: { data?: unknown; error?: { message: string } | null };

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'league_rounds') return pending;
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });
// The admin-client double records filters but not `.order()`. The one test
// that proves the order swaps in a recorder that logs every chained call.
const recorder = recordingClient(() => ({ data: [], error: null }));
let useRecorder = false;

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => (useRecorder ? recorder.client : fake.client),
}));
// The shared double lives in lib/notifications/__mocks__/leagueRoundNotices.ts.
vi.mock('@/lib/notifications/leagueRoundNotices');

import { NextRequest } from 'next/server';
import { runLeagueRoundNotices } from '@/lib/notifications/leagueRoundNotices';
import { POST } from './route';

const runMock = vi.mocked(runLeagueRoundNotices);

function cronRequest(headers: Record<string, string> = { authorization: 'Bearer test-secret' }) {
  return new NextRequest('http://localhost/api/cron/league-round-reminder', {
    method: 'POST',
    headers,
  });
}

function round(id: string) {
  return {
    id,
    league_id: 'liga-1',
    label: `Runde ${id}`,
    opens_at: '2026-10-23T22:00:00+00:00',
    closes_at: '2026-11-06T22:59:00+00:00',
    opening_notice_sent_at: null,
    closing_reminder_sent_at: null,
    leagues: { name: 'Vinterligaen', status: 'active' },
  };
}

const sent = (open: number, closing: number) => ({
  sent: { league_round_open: open, league_round_closing: closing },
});

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  recorder.reset();
  useRecorder = false;
  process.env.CRON_SECRET = 'test-secret';
  pending = { data: [] };
  runMock.mockResolvedValue(sent(0, 0));
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('POST /api/cron/league-round-reminder — the gate', () => {
  it('without CRON_SECRET: 500, and the database is not touched', async () => {
    delete process.env.CRON_SECRET;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(cronRequest());

    expect(res.status).toBe(500);
    expect(fake.ops).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('[leagueRoundReminder] CRON_SECRET not set');
    errorSpy.mockRestore();
  });

  it('wrong Authorization: 401 before anything is read', async () => {
    const res = await POST(cronRequest({ authorization: 'Bearer wrong' }));

    expect(res.status).toBe(401);
    expect(fake.ops).toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/league-round-reminder — the candidates', () => {
  it('asks for open rounds of active leagues with a message left to send, capped', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T12:00:00.000Z'));
    await POST(cronRequest());
    vi.useRealTimers();

    const [read, ...extra] = fake.ops;
    expect(extra).toEqual([]);
    expect(read!.table).toBe('league_rounds');
    expect(read!.columns).toBe(
      'id, league_id, label, opens_at, closes_at, opening_notice_sent_at, closing_reminder_sent_at, leagues!inner(name, status)',
    );
    // The same predicates as `dueNotices` and 0218's EXISTS gate. Change one, change all three.
    expect(read!.filters).toEqual([
      { op: 'eq', column: 'leagues.status', value: 'active' },
      { op: 'lte', column: 'opens_at', value: '2026-11-05T12:00:00.000Z' },
      { op: 'gt', column: 'closes_at', value: '2026-11-05T12:00:00.000Z' },
      {
        op: 'or',
        column: '',
        value:
          'opening_notice_sent_at.is.null,and(closing_reminder_sent_at.is.null,closes_at.lt.2026-11-07T12:00:00.000Z)',
      },
    ]);
    expect(read!.range).toEqual([0, 19]);
  });

  it('takes the closest deadline first, 20 per run: the cap leans on that order', async () => {
    useRecorder = true;
    await POST(cronRequest());

    const calls = recorder.calls();
    expect(calls).toContainEqual(['from', 'league_rounds']);
    expect(calls).toContainEqual(['order', 'closes_at', { ascending: true }]);
    expect(calls).toContainEqual(['range', 0, 19]);
  });

  it('runs exactly the rounds the database gave, and adds up what went', async () => {
    pending = { data: [round('1'), round('2'), round('3')] };
    runMock.mockResolvedValueOnce(sent(4, 0));
    runMock.mockResolvedValueOnce(sent(0, 2));
    runMock.mockResolvedValueOnce(sent(3, 3));

    const res = await POST(cronRequest());

    expect(runMock.mock.calls.map((c) => c[1].id)).toEqual(['1', '2', '3']);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      checked: 3,
      sent: { league_round_open: 7, league_round_closing: 5 },
      failed: [],
    });
  });

  it('one round that throws does not stop the others', async () => {
    pending = { data: [round('1'), round('2')] };
    runMock.mockRejectedValueOnce(new Error('connection reset'));
    runMock.mockResolvedValueOnce(sent(2, 0));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(cronRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      checked: 2,
      sent: { league_round_open: 2, league_round_closing: 0 },
      failed: [{ id: '1', error: 'connection reset' }],
    });
    expect(errorSpy).toHaveBeenCalledWith('[leagueRoundReminder] round 1 failed', expect.any(Error));
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
