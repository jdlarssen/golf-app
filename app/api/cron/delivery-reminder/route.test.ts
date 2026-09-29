// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2200 del 2): sveipens orkestrering — kandidatfilteret den gir
 * basen, taket på batchen, og hva ett spills utfall gjør med de andre.
 *
 * Det fila bevisst IKKE re-asserterer: mottakerregelen
 * (`lib/games/deliveryReminderSweep.test.ts`), kravet og sendingen per spill
 * (`lib/notifications/deliveryReminder.test.ts`), og cron-portens to avvisninger
 * (`lib/cron/auth.test.ts`). Porten er IKKE mocket, så koblingen er bevist.
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
vi.mock('@/lib/notifications/deliveryReminder', () => ({
  runDeliveryReminderSweepForGame: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { runDeliveryReminderSweepForGame } from '@/lib/notifications/deliveryReminder';
import { POST } from './route';

const runMock = vi.mocked(runDeliveryReminderSweepForGame);

function cronRequest(headers: Record<string, string> = { authorization: 'Bearer test-secret' }) {
  return new NextRequest('http://localhost/api/cron/delivery-reminder', {
    method: 'POST',
    headers,
  });
}

function game(id: string) {
  return {
    id,
    name: `Spill ${id}`,
    game_mode: 'stableford',
    hole_segment: 'full',
    source_game_id: null,
    tournament_id: null,
    scheduled_tee_off_at: null,
    created_at: null,
    game_players: [{ user_id: 'x' }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  process.env.CRON_SECRET = 'test-secret';
  pending = { data: [] };
  runMock.mockResolvedValue({ reminded: 1 });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('POST /api/cron/delivery-reminder — porten', () => {
  it('uten CRON_SECRET: 500, og basen røres ikke', async () => {
    delete process.env.CRON_SECRET;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(cronRequest());

    expect(res.status).toBe(500);
    expect(fake.ops).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('[deliveryReminderSweep] CRON_SECRET not set');
    errorSpy.mockRestore();
  });

  it('feil Authorization: 401 før noe som helst leses', async () => {
    const res = await POST(cronRequest({ authorization: 'Bearer wrong' }));

    expect(res.status).toBe(401);
    expect(fake.ops).toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/delivery-reminder — kandidatene', () => {
  it('spør etter aktive, ikke-avledede spill med et ulevert, upurret kort, eldste først, med tak', async () => {
    await POST(cronRequest());

    const [read, ...extra] = fake.ops;
    expect(extra).toEqual([]);
    expect(read.table).toBe('games');
    // The same predicate as 0192's EXISTS gate. Change one, change both.
    expect(read.columns).toContain('game_players!inner(user_id)');
    expect(read.filters).toEqual([
      { op: 'eq', column: 'status', value: 'active' },
      { op: 'is', column: 'source_game_id', value: null },
      { op: 'is', column: 'game_players.submitted_at', value: null },
      { op: 'is', column: 'game_players.withdrawn_at', value: null },
      { op: 'is', column: 'game_players.deliver_reminder_sent_at', value: null },
    ]);
    // The batch is capped: 25 games per run.
    expect(read.range).toEqual([0, 24]);
  });

  it('taket på batchen holder: bare de spillene basen ga, kjøres', async () => {
    pending = { data: [game('a'), game('b')] };

    const res = await POST(cronRequest());

    expect(runMock.mock.calls.map((c) => (c[1] as { id: string }).id)).toEqual(['a', 'b']);
    await expect(res.json()).resolves.toEqual({ ok: true, checked: 2, reminded: 2, failed: [] });
  });

  it('ett spill som kaster, stopper ikke de andre', async () => {
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
    expect(errorSpy).toHaveBeenCalledWith(
      '[deliveryReminderSweep] game a failed',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it('kandidatspørringen feiler: 500, ingen spill kjøres', async () => {
    pending = { error: { message: 'boom' } };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(cronRequest());

    expect(res.status).toBe(500);
    expect(runMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
