import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertMock = vi.fn();
const getUserMock = vi.fn();
const revalidateTagMock = vi.fn();
const maybeSingleMock = vi.fn();

// Track which table was queried for games-status check
let fromCalls: string[] = [];

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      fromCalls.push(table);
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: maybeSingleMock,
        };
      }
      return { upsert: upsertMock };
    },
  }),
}));

vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

import { setBingoBangoBongoHole } from './setBingoBangoBongoHole';

beforeEach(() => {
  upsertMock.mockReset();
  getUserMock.mockReset();
  revalidateTagMock.mockReset();
  maybeSingleMock.mockReset();
  fromCalls = [];
});

function mockAuthed(userId: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } } });
}

function mockGame(status: string) {
  maybeSingleMock.mockResolvedValue({ data: { status }, error: null });
}

describe('setBingoBangoBongoHole — validering før DB', () => {
  it('avviser ikke-autentisert bruker', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const result = await setBingoBangoBongoHole({
      gameId: 'g',
      holeNumber: 1,
      bingoUserId: 'u-1',
      bangoUserId: null,
      bongoUserId: null,
    });

    expect(result).toEqual({ ok: false, error: 'not_authenticated' });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('avviser hole_number 0 (utenfor 1-18)', async () => {
    mockAuthed('u-1');

    const result = await setBingoBangoBongoHole({
      gameId: 'g',
      holeNumber: 0,
      bingoUserId: 'u-1',
      bangoUserId: null,
      bongoUserId: null,
    });

    expect(result).toEqual({ ok: false, error: 'invalid_hole' });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('avviser hole_number 19', async () => {
    mockAuthed('u-1');

    const result = await setBingoBangoBongoHole({
      gameId: 'g',
      holeNumber: 19,
      bingoUserId: 'u-1',
      bangoUserId: null,
      bongoUserId: null,
    });

    expect(result).toEqual({ ok: false, error: 'invalid_hole' });
  });
});

describe('setBingoBangoBongoHole — finished-lock', () => {
  it('avviser upsert når spillet er finished', async () => {
    mockAuthed('u-1');
    mockGame('finished');

    const result = await setBingoBangoBongoHole({
      gameId: 'g-done',
      holeNumber: 5,
      bingoUserId: 'u-1',
      bangoUserId: 'u-2',
      bongoUserId: 'u-3',
    });

    expect(result).toEqual({ ok: false, error: 'game_finished' });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('returnerer game_not_found hvis games-rad mangler', async () => {
    mockAuthed('u-1');
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await setBingoBangoBongoHole({
      gameId: 'missing',
      holeNumber: 1,
      bingoUserId: null,
      bangoUserId: null,
      bongoUserId: null,
    });

    expect(result).toEqual({ ok: false, error: 'game_not_found' });
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe('setBingoBangoBongoHole — DB-interaksjon', () => {
  it('happy path: upserter alle tre user-id-ene med entered_by + revaliderer game-tag', async () => {
    mockAuthed('u-scorer');
    mockGame('active');
    upsertMock.mockResolvedValue({ error: null });

    const result = await setBingoBangoBongoHole({
      gameId: 'g-42',
      holeNumber: 7,
      bingoUserId: 'u-1',
      bangoUserId: 'u-2',
      bongoUserId: 'u-3',
    });

    expect(result).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledWith(
      {
        game_id: 'g-42',
        hole_number: 7,
        bingo_user_id: 'u-1',
        bango_user_id: 'u-2',
        bongo_user_id: 'u-3',
        entered_by: 'u-scorer',
      },
      { onConflict: 'game_id,hole_number' },
    );
    expect(revalidateTagMock).toHaveBeenCalledWith('game-g-42', 'max');
  });

  it('lagrer null-kategorier (bango udelt)', async () => {
    mockAuthed('u-scorer');
    mockGame('active');
    upsertMock.mockResolvedValue({ error: null });

    const result = await setBingoBangoBongoHole({
      gameId: 'g',
      holeNumber: 9,
      bingoUserId: 'u-1',
      bangoUserId: null,
      bongoUserId: null,
    });

    expect(result).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ bango_user_id: null, bongo_user_id: null }),
      expect.any(Object),
    );
  });

  it('same spiller alle tre (3 poeng — lovlig)', async () => {
    mockAuthed('u-scorer');
    mockGame('active');
    upsertMock.mockResolvedValue({ error: null });

    const result = await setBingoBangoBongoHole({
      gameId: 'g',
      holeNumber: 3,
      bingoUserId: 'u-star',
      bangoUserId: 'u-star',
      bongoUserId: 'u-star',
    });

    expect(result).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bingo_user_id: 'u-star',
        bango_user_id: 'u-star',
        bongo_user_id: 'u-star',
      }),
      expect.any(Object),
    );
  });

  it('entered_by settes til auth.uid() uavhengig av hvilken spiller som vant', async () => {
    mockAuthed('admin-user');
    mockGame('active');
    upsertMock.mockResolvedValue({ error: null });

    await setBingoBangoBongoHole({
      gameId: 'g',
      holeNumber: 1,
      bingoUserId: 'player-1',
      bangoUserId: 'player-2',
      bongoUserId: 'player-3',
    });

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ entered_by: 'admin-user' }),
      expect.any(Object),
    );
  });

  it('Postgres-feil → rls_denied (uten å lekke detaljer)', async () => {
    mockAuthed('u-1');
    mockGame('active');
    upsertMock.mockResolvedValue({
      error: { message: 'new row violates row-level security policy' },
    });

    const result = await setBingoBangoBongoHole({
      gameId: 'g',
      holeNumber: 1,
      bingoUserId: 'u-1',
      bangoUserId: null,
      bongoUserId: null,
    });

    expect(result).toEqual({ ok: false, error: 'rls_denied' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('revaliderer IKKE game-tagen ved feil', async () => {
    mockAuthed('u-1');
    mockGame('active');
    upsertMock.mockResolvedValue({ error: { message: 'db error' } });

    await setBingoBangoBongoHole({
      gameId: 'g-99',
      holeNumber: 2,
      bingoUserId: null,
      bangoUserId: null,
      bongoUserId: null,
    });

    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
