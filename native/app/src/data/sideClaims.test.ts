// #2283: innmeldingene på hullet mot supabase-mocken (Type A). Rpc-ene selv,
// og at RLS bare viser egen flight, er testet i
// `supabase/tests/game_side_claims_rls_test.sql`.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fetchGirClaims, fetchSideClaims, recordGirClaims, recordSideClaim } from './sideClaims';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const { supabase, queryStub, stepArgs, currentDeviceUserId } =
  require('../test/supabaseMock') as typeof import('../test/supabaseMock');

beforeEach(() => {
  supabase.rpc.mockReset();
  supabase.from.mockReset();
  currentDeviceUserId.mockResolvedValue('me');
});

describe('fetchSideClaims', () => {
  it('leser hullet i spillet og gir radene i appens form, med avstanden som tall', async () => {
    const stub = queryStub({
      data: [
        {
          category: 'closest_to_pin',
          hole_number: 7,
          winner_user_id: 'marte',
          distance_m: '2.5',
          entered_by: 'tore',
          updated_at: '2026-11-15T10:00:00Z',
        },
        {
          category: 'longest_drive',
          hole_number: 7,
          winner_user_id: null,
          distance_m: null,
          entered_by: 'me',
          updated_at: '2026-11-15T10:01:00Z',
        },
      ],
      error: null,
    });
    supabase.from.mockReturnValueOnce(stub);

    await expect(fetchSideClaims('game-1', 7)).resolves.toEqual([
      {
        category: 'closest_to_pin',
        holeNumber: 7,
        winnerUserId: 'marte',
        distanceM: 2.5,
        enteredBy: 'tore',
        updatedAt: '2026-11-15T10:00:00Z',
      },
      {
        category: 'longest_drive',
        holeNumber: 7,
        winnerUserId: null,
        distanceM: null,
        enteredBy: 'me',
        updatedAt: '2026-11-15T10:01:00Z',
      },
    ]);
    expect(supabase.from).toHaveBeenCalledWith('game_side_claims');
    expect(stepArgs(stub, 'eq')).toEqual([
      ['game_id', 'game-1'],
      ['hole_number', 7],
    ]);
  });

  it('kaster ved feil, så raden kan si «Fikk ikke hentet» og ikke «Meld inn»', async () => {
    supabase.from.mockReturnValueOnce(queryStub({ data: null, error: { message: 'boom' } }));
    await expect(fetchSideClaims('game-1', 7)).rejects.toThrow('fetchSideClaims: boom');
  });
});

describe('fetchGirClaims', () => {
  it('leser hullet i spillet', async () => {
    const stub = queryStub({
      data: [{ hole_number: 5, user_id: 'kari', hit: false, entered_by: 'tore', updated_at: 't' }],
      error: null,
    });
    supabase.from.mockReturnValueOnce(stub);
    await expect(fetchGirClaims('game-1', 5)).resolves.toEqual([
      { holeNumber: 5, userId: 'kari', hit: false, enteredBy: 'tore', updatedAt: 't' },
    ]);
    expect(supabase.from).toHaveBeenCalledWith('game_gir_claims');
    expect(stepArgs(stub, 'eq')).toEqual([
      ['game_id', 'game-1'],
      ['hole_number', 5],
    ]);
  });

  it('kaster ved feil', async () => {
    supabase.from.mockReturnValueOnce(queryStub({ data: null, error: { message: 'nett' } }));
    await expect(fetchGirClaims('game-1', 5)).rejects.toThrow('fetchGirClaims: nett');
  });
});

describe('recordSideClaim', () => {
  const write = {
    gameId: 'game-1',
    category: 'closest_to_pin' as const,
    holeNumber: 7,
    winnerUserId: 'marte',
    distanceM: 2.5,
  };

  it('sender svaret til rpc-en og godtar bare «ok»', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 'ok', error: null });
    await expect(recordSideClaim(write)).resolves.toEqual({ ok: true });
    expect(supabase.rpc).toHaveBeenCalledWith('record_side_claim', {
      p_game_id: 'game-1',
      p_category: 'closest_to_pin',
      p_hole_number: 7,
      p_winner_user_id: 'marte',
      p_distance_m: 2.5,
    });
  });

  it('«Ingen på green» sender null for vinner og avstand', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 'ok', error: null });
    await recordSideClaim({ ...write, winnerUserId: null, distanceM: null });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'record_side_claim',
      expect.objectContaining({ p_winner_user_id: null, p_distance_m: null }),
    );
  });

  it.each(['not_player', 'not_active', 'no_slot', 'wrong_flight', 'bad_distance'])(
    'gir koden %s videre',
    async (code) => {
      supabase.rpc.mockResolvedValueOnce({ data: code, error: null });
      await expect(recordSideClaim(write)).resolves.toEqual({ ok: false, error: code });
    },
  );

  it('en rpc-feil, et ukjent svar og et kast er db_error', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(recordSideClaim(write)).resolves.toEqual({ ok: false, error: 'db_error' });
    supabase.rpc.mockResolvedValueOnce({ data: 'hm', error: null });
    await expect(recordSideClaim(write)).resolves.toEqual({ ok: false, error: 'db_error' });
    supabase.rpc.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(recordSideClaim(write)).resolves.toEqual({ ok: false, error: 'db_error' });
  });

  it('uten sesjon sendes ingenting', async () => {
    currentDeviceUserId.mockResolvedValueOnce(null);
    await expect(recordSideClaim(write)).resolves.toEqual({ ok: false, error: 'not_authenticated' });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('recordGirClaims', () => {
  it('sender ballens spillere og treffet, og godtar bare «ok»', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 'ok', error: null });
    await expect(
      recordGirClaims({ gameId: 'game-1', holeNumber: 5, userIds: ['tore', 'kari'], hit: true }),
    ).resolves.toEqual({ ok: true });
    expect(supabase.rpc).toHaveBeenCalledWith('record_gir_claims', {
      p_game_id: 'game-1',
      p_hole_number: 5,
      p_user_ids: ['tore', 'kari'],
      p_hit: true,
    });
  });

  it('gir koden videre når rpc-en nekter', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 'wrong_flight', error: null });
    await expect(
      recordGirClaims({ gameId: 'game-1', holeNumber: 5, userIds: ['x'], hit: false }),
    ).resolves.toEqual({ ok: false, error: 'wrong_flight' });
  });
});
