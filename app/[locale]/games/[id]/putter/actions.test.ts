import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Unit tests for backfillPutts — #1290 del B (post-finish putt back-fill).
 *
 * Boundary-mocked (Supabase client + next/cache). The RLS policy + column guard
 * from migration 0148 are exercised separately in
 * supabase/tests/scores_putts_backfill_rls_test.sql; here we assert the action's
 * OWN contract: auth gate, payload validation against the DB CHECK bound,
 * finished-only gate, per-row expectAffected, that the write carries ONLY putts
 * (never client_updated_at — the 0109 LWW key must stay untouched), and cache
 * invalidation.
 */

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (tag: string, profile?: string) => revalidateTagMock(tag, profile),
}));

const GAME_ID = 'fab70b1a-c993-43d3-ba91-3c5bf234b4f7';
const USER_ID = '716c82bd-2538-472f-98dd-e16204867320';

function setAuth(user: { id: string } | null) {
  supabaseMock.auth.getUser = vi.fn(async () => ({
    data: { user },
  })) as unknown as typeof supabaseMock.auth.getUser;
}

async function importAction() {
  return (await import('./actions')).backfillPutts;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('backfillPutts', () => {
  it('back-fills putts on a finished game and invalidates the game cache tag', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { status: 'finished' }, error: null }, // games.status
      { data: [{ hole_number: 9 }], error: null }, // scores update
    ]);
    setAuth({ id: USER_ID });
    const backfillPutts = await importAction();

    const result = await backfillPutts(GAME_ID, [{ holeNumber: 9, putts: 2 }]);

    expect(result).toEqual({ ok: true, updated: 1 });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
  });

  it('writes ONLY putts — never client_updated_at (0109 LWW key stays untouched)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { status: 'finished' }, error: null },
      { data: [{ hole_number: 9 }], error: null },
    ]);
    setAuth({ id: USER_ID });
    const backfillPutts = await importAction();

    await backfillPutts(GAME_ID, [{ holeNumber: 9, putts: 3 }]);

    const updateCall = supabaseMock.__fromCalls.find(
      (c) => c.table === 'scores' && c.method === 'update',
    );
    expect(updateCall).toBeDefined();
    expect(updateCall!.args[0]).toEqual({ putts: 3 });
    expect(Object.keys(updateCall!.args[0] as object)).not.toContain('client_updated_at');
  });

  it('back-fills several holes and reports the count', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { status: 'finished' }, error: null },
      { data: [{ hole_number: 5 }], error: null },
      { data: [{ hole_number: 9 }], error: null },
    ]);
    setAuth({ id: USER_ID });
    const backfillPutts = await importAction();

    const result = await backfillPutts(GAME_ID, [
      { holeNumber: 5, putts: 2 },
      { holeNumber: 9, putts: 1 },
    ]);

    expect(result).toEqual({ ok: true, updated: 2 });
  });

  it('rejects an unauthenticated caller before any DB read', async () => {
    supabaseMock = buildSupabaseMock([]);
    setAuth(null);
    const backfillPutts = await importAction();

    const result = await backfillPutts(GAME_ID, [{ holeNumber: 9, putts: 2 }]);

    expect(result).toEqual({ ok: false, code: 'unauthenticated' });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('refuses when the game is not finished (active games use writeScore)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { status: 'active' }, error: null },
    ]);
    setAuth({ id: USER_ID });
    const backfillPutts = await importAction();

    const result = await backfillPutts(GAME_ID, [{ holeNumber: 9, putts: 2 }]);

    expect(result).toEqual({ ok: false, code: 'not_finished' });
    // No scores mutation attempted.
    expect(
      supabaseMock.__fromCalls.some((c) => c.table === 'scores'),
    ).toBe(false);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it.each([
    ['above the DB CHECK bound', 11],
    ['negative', -1],
    ['non-integer', 2.5],
  ])('rejects putts %s without touching the DB', async (_label, putts) => {
    supabaseMock = buildSupabaseMock([]);
    setAuth({ id: USER_ID });
    const backfillPutts = await importAction();

    const result = await backfillPutts(GAME_ID, [{ holeNumber: 9, putts }]);

    expect(result).toEqual({ ok: false, code: 'invalid' });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('treats a 0-row update (hole never played) as a clean failure, not silent success', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { status: 'finished' }, error: null },
      { data: [], error: null }, // 0 rows affected → NoRowsAffectedError
    ]);
    setAuth({ id: USER_ID });
    const backfillPutts = await importAction();

    const result = await backfillPutts(GAME_ID, [{ holeNumber: 9, putts: 2 }]);

    expect(result).toEqual({ ok: false, code: 'invalid' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('is a no-op success for an empty payload (no DB read)', async () => {
    supabaseMock = buildSupabaseMock([]);
    setAuth({ id: USER_ID });
    const backfillPutts = await importAction();

    const result = await backfillPutts(GAME_ID, []);

    expect(result).toEqual({ ok: true, updated: 0 });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});
