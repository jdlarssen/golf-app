// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Type A (#1856): the sweep's orchestration — the candidate filter it hands the
 * DB, and what one game's outcome does to the others.
 *
 * What this file deliberately does NOT re-assert: the tail itself and its
 * claim-first marker, which are Type A in `lib/games/runFinishPipeline.test.ts`,
 * and the two rejection shapes of the cron gate, which are Type A in
 * `lib/cron/auth.test.ts`. The gate is NOT mocked here, so the wiring — that this
 * handler actually consults it before touching the service role — is proven
 * rather than assumed.
 */

/** Every `from(...)` the route makes, in order. Empty = the DB was never touched. */
const fromCalls: string[] = [];
const eqCalls: Array<{ column: string; value: unknown }> = [];
const isCalls: Array<{ column: string; value: unknown }> = [];
const orderCalls: Array<{ column: string; options: unknown }> = [];
const limitCalls: number[] = [];
const pendingReturnsMock = vi.fn<
  (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>
>();

// The chain the route builds:
//   games: select().eq().is().is().order().limit().returns()
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      fromCalls.push(table);
      if (table !== 'games') throw new Error(`unexpected from(${table}) call`);
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          eqCalls.push({ column, value });
          return chain;
        },
        is: (column: string, value: unknown) => {
          isCalls.push({ column, value });
          return chain;
        },
        order: (column: string, options: unknown) => {
          orderCalls.push({ column, options });
          return chain;
        },
        limit: (n: number) => {
          limitCalls.push(n);
          return chain;
        },
        returns: pendingReturnsMock,
      };
      return chain;
    },
  }),
}));

vi.mock('@/lib/games/runFinishPipeline', () => ({
  runFinishPipelineForGame: vi.fn(),
}));
// revalidateTag kaster utenfor Next-runtime.
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { runFinishPipelineForGame } from '@/lib/games/runFinishPipeline';
import { POST } from './route';

const runPipelineMock = vi.mocked(runFinishPipelineForGame);
const revalidateTagMock = vi.mocked(revalidateTag);

function cronRequest(headers: Record<string, string> = {
  authorization: 'Bearer test-secret',
}) {
  return new NextRequest('http://localhost/api/cron/finish-pipeline', {
    method: 'POST',
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fromCalls.length = 0;
  eqCalls.length = 0;
  isCalls.length = 0;
  orderCalls.length = 0;
  limitCalls.length = 0;
  process.env.CRON_SECRET = 'test-secret';
  pendingReturnsMock.mockResolvedValue({ data: [], error: null });
  runPipelineMock.mockResolvedValue({ ran: true });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('POST /api/cron/finish-pipeline — auth', () => {
  it('uten CRON_SECRET: 500, og ingen service-role-klient tas i bruk', async () => {
    delete process.env.CRON_SECRET;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(cronRequest());

    expect(res.status).toBe(500);
    await expect(res.text()).resolves.toBe('CRON_SECRET not configured');
    expect(fromCalls).toEqual([]);
    expect(runPipelineMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[finishPipeline] CRON_SECRET not set');
  });

  it('feil Authorization: 401 før noe som helst leses', async () => {
    const res = await POST(cronRequest({ authorization: 'Bearer wrong' }));

    expect(res.status).toBe(401);
    await expect(res.text()).resolves.toBe('Unauthorized');
    expect(fromCalls).toEqual([]);
    expect(runPipelineMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/finish-pipeline — kandidatfilteret', () => {
  it('spør kun etter finished spill uten markør, uten cup og uten kilde-spill, eldste først', async () => {
    await POST(cronRequest());

    // Nøyaktig de FIRE predikatene i 0170s cron-gate og den partielle indeksen
    // (0169, korrigert i 0171). Ett rule, tre hjem — de må være identiske.
    expect(eqCalls).toEqual([{ column: 'status', value: 'finished' }]);
    expect(isCalls).toEqual([
      { column: 'finish_pipeline_at', value: null },
      { column: 'tournament_id', value: null },
      // #1856: avledede cup-kamper (#1441 D3) må ut. `finishDerivedGames`
      // avslutter dem med kun {status, ended_at} og setter aldri markøren, så
      // de fødes som kandidater — og `tournament_id is null` fanger dem ikke:
      // `games_tournament_id_fkey` er ON DELETE SET NULL, så en slettet cup
      // gjør hele kamptreet til kandidater. Hver av dem ville fått HELE halen
      // kjørt på nytt uten cupens `suppressPerGameNotifications`: én
      // «Resultatet er klart»-mail per kamp til de samme spillerne, og ett
      // fakturert Anthropic-referat hver.
      { column: 'source_game_id', value: null },
    ]);
    expect(orderCalls).toEqual([
      { column: 'ended_at', options: { ascending: true } },
    ]);
    // Batchen er avgrenset: et krav claim-first stiller, ikke pynt (se ruta).
    expect(limitCalls).toEqual([5]);
  });

  it('tom kandidatliste: 200, ingenting kjørt, ingen cache invalidert', async () => {
    const res = await POST(cronRequest());

    expect(runPipelineMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      ok: true,
      checked: 0,
      completed: [],
      failed: [],
    });
  });

  it('feilende kandidat-spørring gir 500, ikke en tom «alt er gjort»-suksess', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pendingReturnsMock.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });

    const res = await POST(cronRequest());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'pending-games query failed',
    });
    expect(runPipelineMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/finish-pipeline — per spill', () => {
  it('kjører halen for hvert kandidatspill og invaliderer spillets cache-tag', async () => {
    pendingReturnsMock.mockResolvedValue({
      data: [{ id: 'g1' }, { id: 'g2' }],
      error: null,
    });

    const res = await POST(cronRequest());

    expect(runPipelineMock.mock.calls.map((c) => c[1])).toEqual(['g1', 'g2']);
    // Loggkonteksten er det som gjør hele halens logglinjer greppbare som én.
    expect(runPipelineMock.mock.calls[0][2]).toEqual({
      logContext: 'finishPipeline',
    });
    expect(revalidateTagMock.mock.calls).toEqual([
      ['game-g1', 'max'],
      ['game-g2', 'max'],
    ]);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      checked: 2,
      completed: ['g1', 'g2'],
      failed: [],
    });
  });

  it('tapt markør-kapring (ran:false) er verken fullført eller feilet', async () => {
    pendingReturnsMock.mockResolvedValue({ data: [{ id: 'g1' }], error: null });
    runPipelineMock.mockResolvedValue({ ran: false });

    const res = await POST(cronRequest());

    // Ingen invalidering heller: eieren av kjøringen gjør sin egen.
    expect(revalidateTagMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      ok: true,
      checked: 1,
      completed: [],
      failed: [],
    });
  });

  it('ett spill som kaster stopper ikke de andre', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pendingReturnsMock.mockResolvedValue({
      data: [{ id: 'g1' }, { id: 'g-bad' }, { id: 'g3' }],
      error: null,
    });
    runPipelineMock
      .mockResolvedValueOnce({ ran: true })
      .mockRejectedValueOnce(new Error('kaboom'))
      .mockResolvedValueOnce({ ran: true });

    const res = await POST(cronRequest());

    expect(runPipelineMock).toHaveBeenCalledTimes(3);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      checked: 3,
      completed: ['g1', 'g3'],
      failed: [{ id: 'g-bad', error: 'kaboom' }],
    });
    // Det som feilet får ingen cache-invalidering; naboene får sin.
    expect(revalidateTagMock.mock.calls).toEqual([
      ['game-g1', 'max'],
      ['game-g3', 'max'],
    ]);
  });
});
