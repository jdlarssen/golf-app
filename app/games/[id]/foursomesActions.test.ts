import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Unit-tester for setFoursomesTeeStarter (#218).
 *
 * Verifiserer at server-action validerer side-medlemskap både for kaller og
 * valgt user — en bruker på side 1 kan ikke sette side 2's tee-starter, og
 * tee-starter-user-en må selv være medlem av sidens game_players-rad.
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

beforeEach(() => {
  vi.clearAllMocks();
  serverMock = buildSupabaseMock([]);
});

describe('setFoursomesTeeStarter', () => {
  it('uautentisert → unauthenticated, ingen DB-call', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(null);
    const { setFoursomesTeeStarter } = await import('./foursomesActions');

    const result = await setFoursomesTeeStarter(GAME_ID, 1, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'unauthenticated' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('ugyldig sideNumber (3) → bad_side', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    const { setFoursomesTeeStarter } = await import('./foursomesActions');

    // @ts-expect-error testing runtime-guard for invalid side
    const result = await setFoursomesTeeStarter(GAME_ID, 3, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'bad_side' });
  });

  it('kaller hører ikke til siden (side-1-bruker setter side 2) → wrong_side', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    // 1) caller-row lookup: caller har team_number = 1
    serverMock = buildSupabaseMock([
      { data: { team_number: 1 }, error: null },
    ]);
    const { setFoursomesTeeStarter } = await import('./foursomesActions');

    const result = await setFoursomesTeeStarter(GAME_ID, 2, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'wrong_side' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('kaller ikke i spillet → not_in_game', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    serverMock = buildSupabaseMock([{ data: null, error: null }]);
    const { setFoursomesTeeStarter } = await import('./foursomesActions');

    const result = await setFoursomesTeeStarter(GAME_ID, 1, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'not_in_game' });
  });

  it('valgt user hører til motstander-siden → candidate_wrong_side', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    serverMock = buildSupabaseMock([
      // 1) caller-row: side 1
      { data: { team_number: 1 }, error: null },
      // 2) candidate-row: side 2 (avvises)
      { data: { team_number: 2 }, error: null },
    ]);
    const { setFoursomesTeeStarter } = await import('./foursomesActions');

    const result = await setFoursomesTeeStarter(GAME_ID, 1, OPP_ID);
    expect(result).toEqual({ ok: false, error: 'candidate_wrong_side' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('valgt user ikke i spillet → candidate_not_in_game', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    serverMock = buildSupabaseMock([
      { data: { team_number: 1 }, error: null },
      { data: null, error: null },
    ]);
    const { setFoursomesTeeStarter } = await import('./foursomesActions');

    const result = await setFoursomesTeeStarter(
      GAME_ID,
      1,
      '99999999-aaaa-bbbb-cccc-dddddddddddd',
    );
    expect(result).toEqual({ ok: false, error: 'candidate_not_in_game' });
  });

  it('spillet er ferdig → game_finished', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    serverMock = buildSupabaseMock([
      // caller
      { data: { team_number: 1 }, error: null },
      // candidate (partner på side 1)
      { data: { team_number: 1 }, error: null },
      // game row
      {
        data: { status: 'finished', game_mode: 'foursomes_matchplay' },
        error: null,
      },
    ]);
    const { setFoursomesTeeStarter } = await import('./foursomesActions');

    const result = await setFoursomesTeeStarter(GAME_ID, 1, PARTNER_ID);
    expect(result).toEqual({ ok: false, error: 'game_finished' });
  });

  it('feil game_mode → wrong_game_mode (defensiv: ingen scribling i ikke-foursomes-spill)', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    serverMock = buildSupabaseMock([
      { data: { team_number: 1 }, error: null },
      { data: { team_number: 1 }, error: null },
      {
        data: { status: 'active', game_mode: 'singles_matchplay' },
        error: null,
      },
    ]);
    const { setFoursomesTeeStarter } = await import('./foursomesActions');

    const result = await setFoursomesTeeStarter(GAME_ID, 1, PARTNER_ID);
    expect(result).toEqual({ ok: false, error: 'wrong_game_mode' });
  });

  it('happy path: side-1-kaller setter side-1-partner → ok + revalidateTag', async () => {
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(CALLER_ID);
    serverMock = buildSupabaseMock([
      { data: { team_number: 1 }, error: null },
      { data: { team_number: 1 }, error: null },
      {
        data: { status: 'active', game_mode: 'foursomes_matchplay' },
        error: null,
      },
      // update returnerer ingen feil
      { data: null, error: null },
    ]);
    const { setFoursomesTeeStarter } = await import('./foursomesActions');

    const result = await setFoursomesTeeStarter(GAME_ID, 1, PARTNER_ID);
    expect(result).toEqual({ ok: true });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');

    // Verifiser at update gikk mot riktig kolonne for side 1
    const updateCall = serverMock.__fromCalls.find(
      (c) => c.method === 'update',
    );
    expect(updateCall?.args[0]).toEqual({
      foursomes_side1_tee_starter_user_id: PARTNER_ID,
    });
  });

  it('happy path side 2: update treffer side2-kolonne', async () => {
    const SIDE2_CALLER = '44444444-4444-4444-4444-444444444444';
    getProxyVerifiedUserIdMock.mockResolvedValueOnce(SIDE2_CALLER);
    serverMock = buildSupabaseMock([
      { data: { team_number: 2 }, error: null },
      { data: { team_number: 2 }, error: null },
      {
        data: { status: 'active', game_mode: 'foursomes_matchplay' },
        error: null,
      },
      { data: null, error: null },
    ]);
    const { setFoursomesTeeStarter } = await import('./foursomesActions');

    const result = await setFoursomesTeeStarter(GAME_ID, 2, OPP_ID);
    expect(result).toEqual({ ok: true });

    const updateCall = serverMock.__fromCalls.find(
      (c) => c.method === 'update',
    );
    expect(updateCall?.args[0]).toEqual({
      foursomes_side2_tee_starter_user_id: OPP_ID,
    });
  });
});
