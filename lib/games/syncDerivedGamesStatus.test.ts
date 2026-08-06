import { describe, it, expect, vi, beforeEach } from 'vitest';

const startScheduledGameMock = vi.fn();
vi.mock('./startScheduledGame', () => ({
  startScheduledGame: (...args: unknown[]) => startScheduledGameMock(...args),
}));

const persistResultSummariesMock = vi.fn().mockResolvedValue(0);
vi.mock('./persistResultSummaries', () => ({
  persistResultSummaries: (...args: unknown[]) => persistResultSummariesMock(...args),
}));

const persistScoreDifferentialsMock = vi.fn().mockResolvedValue(0);
vi.mock('./persistScoreDifferentials', () => ({
  persistScoreDifferentials: (...args: unknown[]) =>
    persistScoreDifferentialsMock(...args),
}));

import {
  syncDerivedGamesStatus,
  startDerivedGames,
  finishDerivedGames,
} from './syncDerivedGamesStatus';

const HOST = 'host-1';

/**
 * Minimal chainable mock of the two query shapes these helpers issue
 * against `supabase.from('games')`:
 *   - lookup:  .select('id'[, more cols]).eq('source_game_id', id).returns()
 *   - patch:   .update(patch).eq('source_game_id', id).select('id')
 * `lookupResult` backs the lookup chain; `updateResult` backs the patch
 * chain (only reached by `syncDerivedGamesStatus`/`finishDerivedGames`).
 */
function makeSupabase(opts: {
  lookupResult: { data: unknown[] | null; error: { message: string } | null };
  updateResult?: { data: { id: string }[] | null; error: { message: string } | null };
}) {
  const updateSpy = vi.fn();
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          returns: () => Promise.resolve(opts.lookupResult),
        }),
      }),
      update: (patch: unknown) => {
        updateSpy(patch);
        return {
          eq: () => ({
            select: () => Promise.resolve(opts.updateResult),
          }),
        };
      },
    }),
    updateSpy,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return client;
}

beforeEach(() => {
  startScheduledGameMock.mockReset();
  persistResultSummariesMock.mockReset().mockResolvedValue(0);
  persistScoreDifferentialsMock.mockReset().mockResolvedValue(0);
});

describe('syncDerivedGamesStatus', () => {
  it('no-ops without issuing an UPDATE when there are 0 derived games', async () => {
    const supabase = makeSupabase({ lookupResult: { data: [], error: null } });

    const result = await syncDerivedGamesStatus(supabase, HOST, {
      status: 'finished',
      ended_at: '2026-08-06T12:00:00.000Z',
    });

    expect(result).toEqual({ count: 0 });
    expect(supabase.updateSpy).not.toHaveBeenCalled();
  });

  it('patches every derived game with the same status/timestamp and returns the count', async () => {
    const supabase = makeSupabase({
      lookupResult: { data: [{ id: 'd1' }, { id: 'd2' }], error: null },
      updateResult: { data: [{ id: 'd1' }, { id: 'd2' }], error: null },
    });

    const patch = { status: 'finished' as const, ended_at: '2026-08-06T12:00:00.000Z' };
    const result = await syncDerivedGamesStatus(supabase, HOST, patch);

    expect(result).toEqual({ count: 2 });
    expect(supabase.updateSpy).toHaveBeenCalledWith(patch);
  });

  it('swallows a 0-row UPDATE on a non-empty derived set instead of throwing (#667/#704 pattern)', async () => {
    const supabase = makeSupabase({
      lookupResult: { data: [{ id: 'd1' }], error: null },
      updateResult: { data: [], error: null },
    });

    const result = await syncDerivedGamesStatus(supabase, HOST, { status: 'finished' });

    expect(result).toEqual({ count: 0 });
  });
});

describe('startDerivedGames', () => {
  it('no-ops without calling startScheduledGame when there are 0 derived games', async () => {
    const supabase = makeSupabase({ lookupResult: { data: [], error: null } });

    const result = await startDerivedGames(supabase, HOST);

    expect(result).toEqual({ startedCount: 0, failedIds: [] });
    expect(startScheduledGameMock).not.toHaveBeenCalled();
  });

  it('starts every derived game and counts successes', async () => {
    const supabase = makeSupabase({
      lookupResult: { data: [{ id: 'd1' }, { id: 'd2' }], error: null },
    });
    startScheduledGameMock.mockResolvedValue({ ok: true, started: true });

    const result = await startDerivedGames(supabase, HOST);

    expect(result).toEqual({ startedCount: 2, failedIds: [] });
    expect(startScheduledGameMock).toHaveBeenCalledTimes(2);
  });

  it('collects failed ids without aborting the rest of the batch', async () => {
    const supabase = makeSupabase({
      lookupResult: { data: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }], error: null },
    });
    startScheduledGameMock
      .mockResolvedValueOnce({ ok: true, started: true })
      .mockResolvedValueOnce({ ok: false, reason: 'incomplete_sides' })
      .mockRejectedValueOnce(new Error('db down'));

    const result = await startDerivedGames(supabase, HOST);

    expect(result.startedCount).toBe(1);
    expect(result.failedIds).toEqual(['d2', 'd3']);
    expect(startScheduledGameMock).toHaveBeenCalledTimes(3);
  });
});

describe('finishDerivedGames', () => {
  const derivedRow = (id: string) => ({
    id,
    game_mode: 'singles_matchplay',
    mode_config: {},
    course_id: 'course-1',
    hole_segment: 'back9',
    source_game_id: HOST,
  });

  it('no-ops without patching or persisting when there are 0 derived games', async () => {
    const supabase = makeSupabase({ lookupResult: { data: [], error: null } });

    const result = await finishDerivedGames(supabase, HOST, '2026-08-06T12:00:00.000Z');

    expect(result).toEqual({ count: 0 });
    expect(supabase.updateSpy).not.toHaveBeenCalled();
    expect(persistResultSummariesMock).not.toHaveBeenCalled();
    expect(persistScoreDifferentialsMock).not.toHaveBeenCalled();
  });

  it('patches status/ended_at and persists a result summary + score differential per derived game', async () => {
    const rows = [derivedRow('d1'), derivedRow('d2')];
    const supabase = makeSupabase({
      lookupResult: { data: rows, error: null },
      updateResult: { data: [{ id: 'd1' }, { id: 'd2' }], error: null },
    });
    const endedAt = '2026-08-06T12:00:00.000Z';

    const result = await finishDerivedGames(supabase, HOST, endedAt);

    expect(result).toEqual({ count: 2 });
    expect(supabase.updateSpy).toHaveBeenCalledWith({
      status: 'finished',
      ended_at: endedAt,
    });
    expect(persistResultSummariesMock).toHaveBeenCalledTimes(2);
    expect(persistResultSummariesMock).toHaveBeenCalledWith(rows[0]);
    expect(persistResultSummariesMock).toHaveBeenCalledWith(rows[1]);
    expect(persistScoreDifferentialsMock).toHaveBeenCalledWith('d1');
    expect(persistScoreDifferentialsMock).toHaveBeenCalledWith('d2');
  });

  it('swallows a 0-row UPDATE on a non-empty derived set instead of throwing', async () => {
    const supabase = makeSupabase({
      lookupResult: { data: [derivedRow('d1')], error: null },
      updateResult: { data: [], error: null },
    });

    const result = await finishDerivedGames(supabase, HOST, '2026-08-06T12:00:00.000Z');

    expect(result).toEqual({ count: 0 });
    // The 0-row UPDATE throws inside the try/catch before the persist loop.
    expect(persistResultSummariesMock).not.toHaveBeenCalled();
  });
});
