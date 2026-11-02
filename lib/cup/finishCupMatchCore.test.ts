// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2752): hvilken kamp som avsluttes, og hva pipelinens svar blir. Selve
 * avslutningen har sin egen suite (`endGameCore`), så den er byttet ut her.
 */

const CUP = 'cup';
const ACTOR = { id: 'sjef', name: 'Anne' };

const endGameCore = vi.fn();
vi.mock('@/lib/games/endGameCore', () => ({ endGameCore: (...args: unknown[]) => endGameCore(...args) }));

let games: Record<string, Record<string, unknown>> = {};
let readError: { message: string } | null = null;

function respond(op: QueryOp): QueryResponse {
  if (op.table !== 'games') throw new Error(`kjernen leser ikke ${op.table}`);
  const id = op.filters.find((f) => f.column === 'id')?.value as string;
  return { data: games[id] ?? null, error: readError };
}
const fake = createAdminClientMock({ tokens: {}, respond });

const { finishCupMatchCore } = await import('./finishCupMatchCore');

const finish = (gameId: string, allowMissing = false) =>
  finishCupMatchCore(fake.client as never, { tournamentId: CUP, gameId, actor: ACTOR, allowMissing });

const game = (status: string, over: Record<string, unknown> = {}) => ({
  id: 'kamp',
  tournament_id: CUP,
  source_game_id: null,
  status,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  readError = null;
  games = {};
  endGameCore.mockResolvedValue({ ok: true, gameName: 'Kamp', alreadyFinished: false });
});

describe('finishCupMatchCore', () => {
  it('avslutter kampen uten varsler per kamp: cupen eier avsløringen (#1501)', async () => {
    games = { kamp: game('active') };

    await expect(finish('kamp')).resolves.toEqual({ ok: true, alreadyFinished: false, gameIds: ['kamp'] });

    expect(endGameCore).toHaveBeenCalledWith(fake.client, 'kamp', ACTOR, {
      allowMissing: false,
      suppressPerGameNotifications: true,
      logContext: 'finishCupMatch',
    });
  });

  it('«Avslutt likevel» sendes videre', async () => {
    games = { kamp: game('active') };
    await finish('kamp', true);
    expect(endGameCore.mock.calls[0][3]).toMatchObject({ allowMissing: true });
  });

  it('en avledet kamp avsluttes gjennom verten', async () => {
    games = {
      avledet: game('active', { id: 'avledet', source_game_id: 'vert' }),
      vert: game('active', { id: 'vert' }),
    };

    await expect(finish('avledet')).resolves.toEqual({ ok: true, alreadyFinished: false, gameIds: ['vert'] });

    expect(endGameCore.mock.calls[0][1]).toBe('vert');
  });

  it('en kamp i en annen cup: not_found, og ingenting avsluttes', async () => {
    games = { kamp: game('active', { tournament_id: 'annen' }) };
    await expect(finish('kamp')).resolves.toEqual({ ok: false, error: 'not_found' });
    expect(endGameCore).not.toHaveBeenCalled();
  });

  it('en kamp som ikke finnes: not_found', async () => {
    await expect(finish('kamp')).resolves.toEqual({ ok: false, error: 'not_found' });
  });

  it('en vert i en annen cup: not_found', async () => {
    games = {
      avledet: game('active', { id: 'avledet', source_game_id: 'vert' }),
      vert: game('active', { id: 'vert', tournament_id: 'annen' }),
    };
    await expect(finish('avledet')).resolves.toEqual({ ok: false, error: 'not_found' });
    expect(endGameCore).not.toHaveBeenCalled();
  });

  it('en ferdig kamp er suksess uten skriving: nytt forsøk etter et tidsavbrudd', async () => {
    games = { kamp: game('finished') };
    await expect(finish('kamp')).resolves.toEqual({ ok: true, alreadyFinished: true, gameIds: ['kamp'] });
    expect(endGameCore).not.toHaveBeenCalled();
  });

  it('en avledet kamp med ferdig vert er også suksess', async () => {
    games = {
      avledet: game('active', { id: 'avledet', source_game_id: 'vert' }),
      vert: game('finished', { id: 'vert' }),
    };
    await expect(finish('avledet')).resolves.toEqual({ ok: true, alreadyFinished: true, gameIds: ['vert'] });
  });

  it('en kamp som ikke har startet: not_active', async () => {
    games = { kamp: game('scheduled') };
    await expect(finish('kamp')).resolves.toEqual({ ok: false, error: 'not_active' });
    expect(endGameCore).not.toHaveBeenCalled();
  });

  it('to kall samtidig: den som tapte flippen, får vite det', async () => {
    games = { kamp: game('active') };
    endGameCore.mockResolvedValue({ ok: true, gameName: 'Kamp', alreadyFinished: true });
    await expect(finish('kamp')).resolves.toEqual({ ok: true, alreadyFinished: true, gameIds: ['kamp'] });
  });

  it('noen rakk det mellom lesingen og skrivingen: suksess', async () => {
    games = { kamp: game('active') };
    endGameCore.mockImplementation(async () => {
      games = { kamp: game('finished') };
      return { ok: false, reason: 'not_active' };
    });
    await expect(finish('kamp')).resolves.toEqual({ ok: true, alreadyFinished: true, gameIds: ['kamp'] });
  });

  it.each(['no_players', 'not_all_submitted', 'not_all_approved'])('regelen %s kommer ut som den er', async (reason) => {
    games = { kamp: game('active') };
    endGameCore.mockResolvedValue({ ok: false, reason });
    await expect(finish('kamp')).resolves.toEqual({ ok: false, error: reason });
  });

  it.each(['db_winners', 'winner_withdrawn', 'db_finish'])('skrivefeilen %s er finish_failed', async (reason) => {
    games = { kamp: game('active') };
    endGameCore.mockResolvedValue({ ok: false, reason });
    await expect(finish('kamp')).resolves.toEqual({ ok: false, error: 'finish_failed' });
  });

  it('en lesefeil er finish_failed, ikke «finnes ikke»', async () => {
    games = { kamp: game('active') };
    readError = { message: 'boom' };
    await expect(finish('kamp')).resolves.toEqual({ ok: false, error: 'finish_failed' });
    expect(endGameCore).not.toHaveBeenCalled();
  });
});
