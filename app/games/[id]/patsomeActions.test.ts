import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Unit-tester for setPatsomeTeeStarter (#286).
 *
 * Verifiserer at server-action validerer lag-medlemskap både for kaller og
 * valgt bruker — et Patsome-lag-medlem kan ikke sette et annet lags tee-starter,
 * og tee-starter-brukeren må selv være på samme lag.
 *
 * Speiler foursomesActions.test.ts i struktur og mocking-stil.
 */

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

const getProxyVerifiedUserIdMock = vi.fn(
  async (): Promise<string | null> => null,
);
vi.mock('@/lib/auth/userId', () => ({
  getProxyVerifiedUserId: () => getProxyVerifiedUserIdMock(),
}));

let serverMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => serverMock,
}));

const CALLER_ID = '11111111-1111-1111-1111-111111111111';
const PARTNER_ID = '22222222-2222-2222-2222-222222222222';
const OPP_ID = '33333333-3333-3333-3333-333333333333';
const GAME_ID = '99999999-9999-9999-9999-999999999999';
const TEAM_NUMBER = 1;

beforeEach(() => {
  vi.clearAllMocks();
  serverMock = buildSupabaseMock([]);
});

describe('setPatsomeTeeStarter', () => {
  it('uautentisert → unauthenticated, ingen DB-call', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(null);
    const { setPatsomeTeeStarter } = await import('./patsomeActions');

    const result = await setPatsomeTeeStarter(GAME_ID, TEAM_NUMBER, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'unauthenticated' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('kaller ikke i spillet → not_in_game', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    serverMock = buildSupabaseMock([{ data: null, error: null }]);
    const { setPatsomeTeeStarter } = await import('./patsomeActions');

    const result = await setPatsomeTeeStarter(GAME_ID, TEAM_NUMBER, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'not_in_game' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('kaller hører til annet lag → wrong_team', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    // caller har team_number 2, men prøver å sette lag 1
    serverMock = buildSupabaseMock([
      { data: { team_number: 2 }, error: null },
    ]);
    const { setPatsomeTeeStarter } = await import('./patsomeActions');

    const result = await setPatsomeTeeStarter(GAME_ID, TEAM_NUMBER, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'wrong_team' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('kandidat ikke i spillet → candidate_not_in_game', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    serverMock = buildSupabaseMock([
      { data: { team_number: TEAM_NUMBER }, error: null },
      { data: null, error: null },
    ]);
    const { setPatsomeTeeStarter } = await import('./patsomeActions');

    const result = await setPatsomeTeeStarter(
      GAME_ID,
      TEAM_NUMBER,
      '99999999-aaaa-bbbb-cccc-dddddddddddd',
    );
    expect(result).toEqual({ ok: false, error: 'candidate_not_in_game' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('kandidat hører til annet lag → candidate_wrong_team', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    serverMock = buildSupabaseMock([
      // caller er på lag 1
      { data: { team_number: TEAM_NUMBER }, error: null },
      // kandidat er på lag 2
      { data: { team_number: 2 }, error: null },
    ]);
    const { setPatsomeTeeStarter } = await import('./patsomeActions');

    const result = await setPatsomeTeeStarter(GAME_ID, TEAM_NUMBER, OPP_ID);
    expect(result).toEqual({ ok: false, error: 'candidate_wrong_team' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('spillet er ferdig → game_finished', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    serverMock = buildSupabaseMock([
      { data: { team_number: TEAM_NUMBER }, error: null },
      { data: { team_number: TEAM_NUMBER }, error: null },
      { data: { status: 'finished', game_mode: 'patsome' }, error: null },
    ]);
    const { setPatsomeTeeStarter } = await import('./patsomeActions');

    const result = await setPatsomeTeeStarter(GAME_ID, TEAM_NUMBER, PARTNER_ID);
    expect(result).toEqual({ ok: false, error: 'game_finished' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('feil game_mode → wrong_game_mode', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    serverMock = buildSupabaseMock([
      { data: { team_number: TEAM_NUMBER }, error: null },
      { data: { team_number: TEAM_NUMBER }, error: null },
      {
        data: { status: 'active', game_mode: 'texas_scramble' },
        error: null,
      },
    ]);
    const { setPatsomeTeeStarter } = await import('./patsomeActions');

    const result = await setPatsomeTeeStarter(GAME_ID, TEAM_NUMBER, PARTNER_ID);
    expect(result).toEqual({ ok: false, error: 'wrong_game_mode' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('happy path: lag-1-kaller setter lag-1-makker → ok + revalidateTag + upsert', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    serverMock = buildSupabaseMock([
      { data: { team_number: TEAM_NUMBER }, error: null },
      { data: { team_number: TEAM_NUMBER }, error: null },
      { data: { status: 'active', game_mode: 'patsome' }, error: null },
      // upsert returnerer ingen feil
      { data: null, error: null },
    ]);
    const { setPatsomeTeeStarter } = await import('./patsomeActions');

    const result = await setPatsomeTeeStarter(GAME_ID, TEAM_NUMBER, PARTNER_ID);
    expect(result).toEqual({ ok: true });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');

    // Verifiser at upsert gikk mot riktig tabell med riktige data
    const upsertCall = serverMock.__fromCalls.find(
      (c) => c.method === 'upsert',
    );
    expect(upsertCall?.args[0]).toEqual({
      game_id: GAME_ID,
      team_number: TEAM_NUMBER,
      tee_starter_user_id: PARTNER_ID,
    });
  });

  it('happy path lag 2: upsert treffer korrekt lag-nummer', async () => {
    const SIDE2_CALLER = '44444444-4444-4444-4444-444444444444';
    const SIDE2_PARTNER = '55555555-5555-5555-5555-555555555555';
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(SIDE2_CALLER);
    serverMock = buildSupabaseMock([
      { data: { team_number: 2 }, error: null },
      { data: { team_number: 2 }, error: null },
      { data: { status: 'active', game_mode: 'patsome' }, error: null },
      { data: null, error: null },
    ]);
    const { setPatsomeTeeStarter } = await import('./patsomeActions');

    const result = await setPatsomeTeeStarter(GAME_ID, 2, SIDE2_PARTNER);
    expect(result).toEqual({ ok: true });

    const upsertCall = serverMock.__fromCalls.find(
      (c) => c.method === 'upsert',
    );
    expect(upsertCall?.args[0]).toEqual({
      game_id: GAME_ID,
      team_number: 2,
      tee_starter_user_id: SIDE2_PARTNER,
    });
  });
});
